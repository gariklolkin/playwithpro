"use client";

import {
  ANNOTATION_EVENTS,
  type AnnotationClearedPayload,
  type AnnotationPoint,
  type AnnotationRemovedPayload,
  type AnnotationState,
  type AnnotationTool,
  type Stroke,
} from "@playwithpro/shared";
import { useCallback, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

export interface Annotations {
  /** Moment key → strokes, mirroring the server's ephemeral store. */
  state: AnnotationState;
  /** Optimistically adds a stroke by this user and sends it to the peer. */
  add: (
    momentKey: string,
    tool: AnnotationTool,
    color: string,
    points: AnnotationPoint[],
  ) => void;
  /** Removes this user's latest stroke on the moment (locally and remotely). */
  undo: (momentKey: string) => void;
  /** Empties the moment for both parties. */
  clear: (momentKey: string) => void;
}

function withoutStroke(
  state: AnnotationState,
  momentKey: string,
  strokeId: string,
): AnnotationState {
  const strokes = state[momentKey];
  if (!strokes?.some((s) => s.id === strokeId)) return state;
  const rest = strokes.filter((s) => s.id !== strokeId);
  const next = { ...state };
  if (rest.length === 0) {
    delete next[momentKey];
  } else {
    next[momentKey] = rest;
  }
  return next;
}

function withoutMoment(
  state: AnnotationState,
  momentKey: string,
): AnnotationState {
  if (!(momentKey in state)) return state;
  const next = { ...state };
  delete next[momentKey];
  return next;
}

function withStroke(state: AnnotationState, stroke: Stroke): AnnotationState {
  const strokes = state[stroke.momentKey] ?? [];
  if (strokes.some((s) => s.id === stroke.id)) return state;
  return { ...state, [stroke.momentKey]: [...strokes, stroke] };
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
 * Shared annotation state over the playback-sync socket. The server holds
 * the truth: local edits are optimistic and reconciled by the echoed events,
 * and the full state arrives on (re)connect or on request.
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
    const onRemoved = ({ momentKey, strokeId }: AnnotationRemovedPayload) =>
      setState((prev) => withoutStroke(prev, momentKey, strokeId));
    const onCleared = ({ momentKey }: AnnotationClearedPayload) =>
      setState((prev) => withoutMoment(prev, momentKey));
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
    (momentKey, tool, color, points) => {
      const stroke: Stroke = {
        id: newStrokeId(),
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
    (momentKey) => {
      setState((prev) => {
        const mine = (prev[momentKey] ?? []).filter(
          (s) => s.authorId === userId,
        );
        const last = mine.at(-1);
        return last ? withoutStroke(prev, momentKey, last.id) : prev;
      });
      socket?.emit(ANNOTATION_EVENTS.undo, { momentKey });
    },
    [socket, userId],
  );

  const clear = useCallback<Annotations["clear"]>(
    (momentKey) => {
      setState((prev) => withoutMoment(prev, momentKey));
      socket?.emit(ANNOTATION_EVENTS.clear, { momentKey });
    },
    [socket],
  );

  return { state, add, undo, clear };
}
