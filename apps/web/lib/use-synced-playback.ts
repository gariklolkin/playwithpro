"use client";

import {
  PLAYBACK_DRIFT_THRESHOLD_SECONDS,
  PLAYBACK_HEARTBEAT_INTERVAL_MS,
  PLAYBACK_SYNC_EVENTS,
  PLAYBACK_SYNC_NAMESPACE,
  type PlaybackState,
} from "@playwithpro/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/api";

/** Seek slack for gesture-driven states; drift threshold covers heartbeats. */
const EXACT_SEEK_SLACK_SECONDS = 0.5;

interface RemoteState {
  state: PlaybackState;
  /** Local monotonic receive time — never compared to the peer's clock. */
  receivedAtMs: number;
}

/** The attached clip the local player shows, and how to follow the peer's. */
export interface ClipBinding {
  /** Null until the panel has picked a clip; nothing is published meanwhile. */
  videoId: string | null;
  /** The peer is on another attached clip: swap the source, then call `onSourceReady`. */
  onRemoteClip: (videoId: string) => void;
}

export interface SyncedPlayback {
  /** Whether this client follows and publishes shared state. */
  synced: boolean;
  setSynced: (on: boolean) => void;
  /** True while the browser refuses programmatic playback (autoplay policy). */
  blocked: boolean;
  /** User-gesture handler that re-applies the shared state after a block. */
  resume: () => void;
  /** Attach to the <video> element's media events. */
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onRateChange: () => void;
  /** The <video> loaded a new source: apply the shared state waiting for it. */
  onSourceReady: () => void;
  /**
   * The underlying /playback-sync socket, for features that share the
   * channel (annotations). Null until the effect creates it.
   */
  socket: Socket | null;
}

/**
 * Shared playback state over the API's /playback-sync socket. Both parties
 * converge on full-state snapshots (last writer wins); the last commander
 * re-asserts a playing state as a heartbeat, and followers snap when drifted.
 */
export function useSyncedPlayback(
  sessionId: string,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  clip: ClipBinding,
): SyncedPlayback {
  const [synced, setSyncedState] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const remoteRef = useRef<RemoteState | null>(null);
  /** Suppresses re-publishing media events we caused programmatically. */
  const applyingRef = useRef(0);
  /** True while our own gesture was the room's most recent command. */
  const commanderRef = useRef(false);
  const syncedRef = useRef(true);
  /** The clip the local player is on; snapshots name it. */
  const videoIdRef = useRef<string | null>(clip.videoId);
  /** A clip switch the peer asked for, so the panel's change is not re-published. */
  const remoteClipRef = useRef<string | null>(null);
  /** A shared state waiting for the panel to load its clip. */
  const pendingRef = useRef<RemoteState | null>(null);
  const onRemoteClipRef = useRef(clip.onRemoteClip);
  useEffect(() => {
    onRemoteClipRef.current = clip.onRemoteClip;
  }, [clip.onRemoteClip]);

  const publish = useCallback(() => {
    const video = videoRef.current;
    const socket = socketRef.current;
    const videoId = videoIdRef.current;
    if (!video || !socket || !videoId || !syncedRef.current) return;
    commanderRef.current = true;
    const state: PlaybackState = {
      videoId,
      playing: !video.paused && !video.ended,
      positionSeconds: video.currentTime,
      rate: video.playbackRate,
      emittedAtMs: Date.now(), // informational; the server re-stamps
    };
    socket.emit(PLAYBACK_SYNC_EVENTS.publish, state);
  }, [videoRef]);

  /** Conforms the local player to `remote`, compensating elapsed play time. */
  const apply = useCallback(
    (remote: RemoteState) => {
      const video = videoRef.current;
      if (!video) return;
      const { state } = remote;
      if (state.videoId !== videoIdRef.current) {
        // The peer is on another clip: the panel swaps the source and calls
        // onSourceReady, which applies this state to the new element.
        remoteClipRef.current = state.videoId;
        pendingRef.current = remote;
        onRemoteClipRef.current(state.videoId);
        return;
      }
      pendingRef.current = null;
      // Position advances at the shared rate: slow motion is not drift.
      const target = state.playing
        ? state.positionSeconds +
          ((performance.now() - remote.receivedAtMs) / 1000) * state.rate
        : state.positionSeconds;
      const drift = Math.abs(video.currentTime - target);
      const playingLocally = !video.paused && !video.ended;
      const slack = state.playing
        ? PLAYBACK_DRIFT_THRESHOLD_SECONDS
        : EXACT_SEEK_SLACK_SECONDS;
      applyingRef.current += 1;
      if (video.playbackRate !== state.rate) {
        // The resulting ratechange fires as its own task, later than the
        // tick that releases the play/pause/seek suppression — so hold the
        // guard until that exact event, or we would echo the peer's rate.
        applyingRef.current += 1;
        const release = () => {
          applyingRef.current = Math.max(0, applyingRef.current - 1);
        };
        video.addEventListener("ratechange", release, { once: true });
        video.playbackRate = state.rate;
      }
      if (state.playing !== playingLocally || drift > slack) {
        video.currentTime = target;
      }
      const done = () => {
        // Media events we triggered fire asynchronously; release on a tick.
        setTimeout(() => {
          applyingRef.current = Math.max(0, applyingRef.current - 1);
        }, 0);
      };
      if (state.playing && !playingLocally) {
        video.play().then(
          () => {
            setBlocked(false);
            done();
          },
          () => {
            setBlocked(true);
            done();
          },
        );
        return;
      }
      if (!state.playing && playingLocally) {
        video.pause();
      }
      done();
    },
    [videoRef],
  );

  useEffect(() => {
    syncedRef.current = synced;
  }, [synced]);

  // A local clip switch is a shared command: the peer lands on the new clip
  // at its start, paused. A switch the peer asked for is not echoed.
  useEffect(() => {
    const previous = videoIdRef.current;
    videoIdRef.current = clip.videoId;
    if (!clip.videoId || previous === null || previous === clip.videoId) {
      return;
    }
    if (remoteClipRef.current === clip.videoId) {
      remoteClipRef.current = null;
      return;
    }
    const socket = socketRef.current;
    if (!socket || !syncedRef.current) return;
    commanderRef.current = true;
    const state: PlaybackState = {
      videoId: clip.videoId,
      playing: false,
      positionSeconds: 0,
      rate: videoRef.current?.playbackRate ?? 1,
      emittedAtMs: Date.now(),
    };
    socket.emit(PLAYBACK_SYNC_EVENTS.publish, state);
  }, [clip.videoId, videoRef]);

  const onSourceReady = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || !syncedRef.current) return;
    if (pending.state.videoId !== videoIdRef.current) return;
    apply(pending);
  }, [apply]);

  useEffect(() => {
    const socket = io(`${API_URL}${PLAYBACK_SYNC_NAMESPACE}`, {
      withCredentials: true,
      auth: { sessionId },
    });
    socketRef.current = socket;
    // Deferred so the effect body stays free of synchronous setState.
    const expose = setTimeout(() => setSocket(socket), 0);
    socket.on(PLAYBACK_SYNC_EVENTS.state, (state: PlaybackState) => {
      const remote: RemoteState = { state, receivedAtMs: performance.now() };
      remoteRef.current = remote;
      // The peer spoke last — we follow until our next local gesture.
      commanderRef.current = false;
      if (syncedRef.current) {
        apply(remote);
      }
    });
    return () => {
      clearTimeout(expose);
      socketRef.current = null;
      setSocket(null);
      socket.disconnect();
    };
  }, [sessionId, apply]);

  // Heartbeat: the last commander re-asserts a playing state so followers
  // can measure drift; goes quiet the moment the peer takes over.
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (
        !commanderRef.current ||
        !syncedRef.current ||
        !video ||
        video.paused ||
        video.ended
      ) {
        return;
      }
      publish();
    }, PLAYBACK_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [publish, videoRef]);

  const onLocalGesture = useCallback(() => {
    if (applyingRef.current > 0) return;
    publish();
  }, [publish]);

  const setSynced = useCallback(
    (on: boolean) => {
      setSyncedState(on);
      syncedRef.current = on;
      if (!on) {
        commanderRef.current = false;
        setBlocked(false);
        return;
      }
      // Re-attach: conform to what we last heard, then ask for fresh state.
      if (remoteRef.current) {
        apply(remoteRef.current);
      }
      socketRef.current?.emit(PLAYBACK_SYNC_EVENTS.requestState);
    },
    [apply],
  );

  const resume = useCallback(() => {
    setBlocked(false);
    if (remoteRef.current && syncedRef.current) {
      apply(remoteRef.current);
    }
  }, [apply]);

  return {
    synced,
    setSynced,
    blocked,
    resume,
    onPlay: onLocalGesture,
    onPause: onLocalGesture,
    onSeeked: onLocalGesture,
    onRateChange: onLocalGesture,
    onSourceReady,
    socket,
  };
}
