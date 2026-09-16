"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface RoomToastItem {
  id: string;
  text: ReactNode;
  /** Auto-dismiss delay. */
  durationMs: number;
  tone?: "warning" | "danger";
}

const TONE_CLASS: Record<NonNullable<RoomToastItem["tone"]>, string> = {
  warning: "bg-[#FDECC8] text-[#402C1B]",
  danger: "bg-[#FBE4E4] text-[#C4554D]",
};

/** Where a toast must live to stay visible: over the fullscreen element, if any. */
function portalTarget(): Element | null {
  if (typeof document === "undefined") return null;
  return document.fullscreenElement ?? document.body;
}

/**
 * Bottom-centre stack of non-blocking, dismissible, auto-dismissing toasts
 * for the session room. Rendered through a portal into the fullscreen
 * element when the clip card is fullscreen, so a reminder is never hidden
 * behind it. Announced politely to assistive technology.
 */
export function RoomToasts({
  toasts,
  onDismiss,
  dismissLabel,
}: {
  toasts: RoomToastItem[];
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const update = () => setTarget(portalTarget());
    // Deferred first read keeps the effect free of synchronous setState.
    const kickoff = setTimeout(update, 0);
    document.addEventListener("fullscreenchange", update);
    return () => {
      clearTimeout(kickoff);
      document.removeEventListener("fullscreenchange", update);
    };
  }, []);

  if (!target || toasts.length === 0) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <RoomToast key={toast.id} toast={toast} onDismiss={onDismiss}>
          {dismissLabel}
        </RoomToast>
      ))}
    </div>,
    target,
  );
}

function RoomToast({
  toast,
  onDismiss,
  children,
}: {
  toast: RoomToastItem;
  onDismiss: (id: string) => void;
  children: ReactNode;
}) {
  const { id, durationMs } = toast;
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), durationMs);
    return () => clearTimeout(timer);
  }, [id, durationMs, onDismiss]);

  return (
    <div
      data-testid="room-toast"
      className={`pointer-events-auto flex max-w-[480px] items-center gap-3 rounded-lg px-4 py-2.5 text-[13.5px] shadow-card ${TONE_CLASS[toast.tone ?? "warning"]}`}
    >
      <span>⏱ {toast.text}</span>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label={children as string}
        className="cursor-pointer text-base leading-none opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
