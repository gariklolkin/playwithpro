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
}

/**
 * Shared playback state over the API's /playback-sync socket. Both parties
 * converge on full-state snapshots (last writer wins); the last commander
 * re-asserts a playing state as a heartbeat, and followers snap when drifted.
 */
export function useSyncedPlayback(
  sessionId: string,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): SyncedPlayback {
  const [synced, setSyncedState] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const remoteRef = useRef<RemoteState | null>(null);
  /** Suppresses re-publishing media events we caused programmatically. */
  const applyingRef = useRef(0);
  /** True while our own gesture was the room's most recent command. */
  const commanderRef = useRef(false);
  const syncedRef = useRef(true);

  const publish = useCallback(() => {
    const video = videoRef.current;
    const socket = socketRef.current;
    if (!video || !socket || !syncedRef.current) return;
    commanderRef.current = true;
    const state: PlaybackState = {
      playing: !video.paused && !video.ended,
      positionSeconds: video.currentTime,
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
      const target = state.playing
        ? state.positionSeconds +
          (performance.now() - remote.receivedAtMs) / 1000
        : state.positionSeconds;
      const drift = Math.abs(video.currentTime - target);
      const playingLocally = !video.paused && !video.ended;
      const slack = state.playing
        ? PLAYBACK_DRIFT_THRESHOLD_SECONDS
        : EXACT_SEEK_SLACK_SECONDS;
      applyingRef.current += 1;
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

  useEffect(() => {
    const socket = io(`${API_URL}${PLAYBACK_SYNC_NAMESPACE}`, {
      withCredentials: true,
      auth: { sessionId },
    });
    socketRef.current = socket;
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
      socketRef.current = null;
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
  };
}
