"use client";

import {
  ANNOTATION_EVENTS,
  type AnnotationClearedPayload,
  type AnnotationPoint,
  type AnnotationRemovedPayload,
  type AnnotationState,
  type AnnotationTool,
  type ClipAnnotationState,
  type Stroke,
} from "@playwithpro/shared";
import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export interface Annotations {
  /** Video id → moment key → strokes, mirroring the server's ephemeral store. */
  state: AnnotationState;
  /** Optimistically adds a stroke by this user on a clip and sends it to the peer. */
  add: (
    videoId: string,
    momentKey: string,
    tool: AnnotationTool,
    color: string,
    points: AnnotationPoint[],
  ) => void;
  /** Removes this user's latest stroke on the clip's moment (locally and remotely). */
  undo: (videoId: string, momentKey: string) => void;
  /** Empties the clip's moment for both parties. */
  clear: (videoId: string, momentKey: string) => void;
}

const EMPTY_CLIP: ClipAnnotationState = {};

/** The annotations of one clip; a stable empty object when none. */
export function clipAnnotations(
  state: AnnotationState,
  videoId: string | null,
): ClipAnnotationState {
  return (videoId && state[videoId]) || EMPTY_CLIP;
}

function withClip(
  state: AnnotationState,
  videoId: string,
  clip: ClipAnnotationState,
): AnnotationState {
  const next = { ...state };
  if (Object.keys(clip).length === 0) {
    delete next[videoId];
  } else {
    next[videoId] = clip;
  }
  return next;
}

function withoutStroke(
  state: AnnotationState,
  videoId: string,
  momentKey: string,
  strokeId: string,
): AnnotationState {
  const clip = state[videoId];
  const strokes = clip?.[momentKey];
  if (!clip || !strokes?.some((s) => s.id === strokeId)) return state;
  const rest = strokes.filter((s) => s.id !== strokeId);
  const nextClip = { ...clip };
  if (rest.length === 0) {
    delete nextClip[momentKey];
  } else {
    nextClip[momentKey] = rest;
  }
  return withClip(state, videoId, nextClip);
}

function withoutMoment(
  state: AnnotationState,
  videoId: string,
  momentKey: string,
): AnnotationState {
  const clip = state[videoId];
  if (!clip || !(momentKey in clip)) return state;
  const nextClip = { ...clip };
  delete nextClip[momentKey];
  return withClip(state, videoId, nextClip);
}

function withStroke(state: AnnotationState, stroke: Stroke): AnnotationState {
  const clip = state[stroke.videoId] ?? {};
  const strokes = clip[stroke.momentKey] ?? [];
  if (strokes.some((s) => s.id === stroke.id)) return state;
  return withClip(state, stroke.videoId, {
    ...clip,
    [stroke.momentKey]: [...strokes, stroke],
  });
}

function newStrokeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Very old browsers: still id-shaped for the server's check.
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

/**
 * Shared annotation state over the playback-sync socket, kept per attached
 * clip. The server holds the truth: local edits are optimistic and
 * reconciled by the echoed events, and the full state arrives on
 * (re)connect or on request.
 */
export function useAnnotations(
  socket: Socket | null,
  userId: string,
): Annotations {
  const [state, setState] = useState<AnnotationState>({});

  useEffect(() => {
    if (!socket) return;
    const onState = (full: AnnotationState) => setState(full);
    const onAdded = (stroke: Stroke) =>
      setState((prev) => withStroke(prev, stroke));
    const onRemoved = ({
      videoId,
      momentKey,
      strokeId,
    }: AnnotationRemovedPayload) =>
      setState((prev) => withoutStroke(prev, videoId, momentKey, strokeId));
    const onCleared = ({ videoId, momentKey }: AnnotationClearedPayload) =>
      setState((prev) => withoutMoment(prev, videoId, momentKey));
    // A reconnect gets the state pushed by the server; the explicit request
    // covers listeners attached after the connect ack already arrived.
    const onConnect = () => socket.emit(ANNOTATION_EVENTS.requestState);
    socket.on(ANNOTATION_EVENTS.state, onState);
    socket.on(ANNOTATION_EVENTS.added, onAdded);
    socket.on(ANNOTATION_EVENTS.removed, onRemoved);
    socket.on(ANNOTATION_EVENTS.cleared, onCleared);
    socket.on("connect", onConnect);
    if (socket.connected) onConnect();
    return () => {
      socket.off(ANNOTATION_EVENTS.state, onState);
      socket.off(ANNOTATION_EVENTS.added, onAdded);
      socket.off(ANNOTATION_EVENTS.removed, onRemoved);
      socket.off(ANNOTATION_EVENTS.cleared, onCleared);
      socket.off("connect", onConnect);
    };
  }, [socket]);

  const add = useCallback<Annotations["add"]>(
    (videoId, momentKey, tool, color, points) => {
      const stroke: Stroke = {
        id: newStrokeId(),
        videoId,
        momentKey,
        authorId: userId,
        tool,
        color,
        points,
        createdAtMs: Date.now(),
      };
      setState((prev) => withStroke(prev, stroke));
      socket?.emit(ANNOTATION_EVENTS.add, stroke);
    },
    [socket, userId],
  );

  const undo = useCallback<Annotations["undo"]>(
    (videoId, momentKey) => {
      setState((prev) => {
        const mine = (prev[videoId]?.[momentKey] ?? []).filter(
          (s) => s.authorId === userId,
        );
        const last = mine.at(-1);
        return last ? withoutStroke(prev, videoId, momentKey, last.id) : prev;
      });
      socket?.emit(ANNOTATION_EVENTS.undo, { videoId, momentKey });
    },
    [socket, userId],
  );

  const clear = useCallback<Annotations["clear"]>(
    (videoId, momentKey) => {
      setState((prev) => withoutMoment(prev, videoId, momentKey));
      socket?.emit(ANNOTATION_EVENTS.clear, { videoId, momentKey });
    },
    [socket],
  );

  return { state, add, undo, clear };
}
