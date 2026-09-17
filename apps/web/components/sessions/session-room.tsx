"use client";

import {
  CALL_TIME_REMINDER_BEFORE_END_MIN,
  ServiceType,
  type JoinRoomResponse,
  Role,
  type SessionRoomResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LocalTime } from "@/components/catalog/local-time";
import { PlayerContextDisclosure } from "@/components/sessions/player-context-disclosure";
import { RescheduleBanner } from "@/components/sessions/reschedule-banner";
import {
  RoomToasts,
  type RoomToastItem,
} from "@/components/sessions/room-toast";
import type {
  CallLayout,
  CallPhaseKind,
} from "@/components/sessions/livekit-room";
import {
  RoomVideoPanel,
  type CardLayout,
} from "@/components/sessions/room-video-panel";
import { apiFetch } from "@/lib/api";
import { FUNNEL_EVENTS, track } from "@/lib/observability/analytics";
import {
  formatClock,
  useSessionClock,
  type SessionClockThreshold,
} from "@/lib/use-session-clock";
import { Link } from "@/i18n/navigation";

// The call SDK is a sizeable client-only bundle; load it on this page only.
const LiveKitCall = dynamic(
  () =>
    import("@/components/sessions/livekit-room").then(
      (module) => module.LiveKitCall,
    ),
  { ssr: false },
);

type LoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; room: SessionRoomResponse };

/** Theatre geometry (px); the frame height caps at 62% of the window. */
const CARD_MIN_WIDTH = 560;
const RAIL_MIN_WIDTH = 260;
const GRID_GAP = 16;
const THEATRE_FRAME_HEIGHT = "min(520px, 62vh)";
const FOCUS_FRAME_HEIGHT = "min(720px, 75vh)";
/**
 * Portrait clips: a taller frame, a narrower card (the player bar wraps its
 * timeline under this width), a capped rail, and the pair centred so the
 * spare width does not inflate the tiles.
 */
const PORTRAIT_CARD_MIN_WIDTH = 400;
const PORTRAIT_RAIL_MAX_WIDTH = 420;
const PORTRAIT_FRAME_HEIGHT = "min(880px, 80vh)";
const HIDE_SELF_KEY = "pwp.room.hideSelf";

function readHideSelf(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(HIDE_SELF_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function writeHideSelf(hide: boolean) {
  try {
    if (hide) window.localStorage.setItem(HIDE_SELF_KEY, "1");
    else window.localStorage.removeItem(HIDE_SELF_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

/** Toast lifetimes: the end reminder names a time, so it stays a bit longer. */
const REMINDER_TOAST_MS = 8_000;
const END_TOAST_MS = 12_000;

/**
 * The platform session room: countdown before the join window, the native
 * call inside it, closed state after the grace period. Video-analysis rooms
 * put the attached clips beside the pre-join panel and, once joined, switch
 * to the theatre layout — clip card in the main column, call in a presence
 * rail matching the card — with focus mode and stacking on narrow screens.
 * The call and the clip panel keep their place in the tree across layouts,
 * so a layout change never reconnects the call.
 */
export function SessionRoom({
  sessionId,
  userId,
  role,
  displayName,
}: {
  sessionId: string;
  userId: string;
  role: Role;
  displayName: string;
}) {
  const t = useTranslations("sessions.room");
  const tSessions = useTranslations("sessions");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [toasts, setToasts] = useState<RoomToastItem[]>([]);
  const [callPhase, setCallPhase] = useState<CallPhaseKind>("prejoin");
  const [focus, setFocus] = useState(false);
  const [hideSelf, setHideSelf] = useState(readHideSelf);
  const [aspect, setAspect] = useState(16 / 9);
  const [cardLayout, setCardLayout] = useState<CardLayout | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch(`/sessions/${sessionId}/room`);
      if (!response.ok) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({
        kind: "ready",
        room: (await response.json()) as SessionRoomResponse,
      });
    } catch {
      setState({ kind: "unavailable" });
    }
  }, [sessionId]);

  useEffect(() => {
    // Deferred kickoff: the fetch resolves asynchronously anyway, and this
    // keeps the effect body free of anything the linter reads as sync state.
    const kickoff = setTimeout(() => void load(), 0);
    return () => clearTimeout(kickoff);
  }, [load]);

  const room = state.kind === "ready" ? state.room : null;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Reminders only while connected; the hook fires each crossing once.
  const onThreshold = useCallback(
    (threshold: SessionClockThreshold) => {
      if (!room) return;
      setToasts((prev) => [
        ...prev.filter((toast) => toast.id !== threshold),
        threshold === "end"
          ? {
              id: threshold,
              text: t.rich("time.reminderEnd", {
                time: () => <LocalTime iso={room.closesAt} />,
              }),
              durationMs: END_TOAST_MS,
              tone: "danger",
            }
          : {
              id: threshold,
              text: t("time.reminderTen"),
              durationMs: REMINDER_TOAST_MS,
              tone: "warning",
            },
      ]);
    },
    [room, t],
  );

  // One server-corrected clock for the pre-join countdown, the header
  // indicator and the in-call reminders, so they can never disagree.
  const clock = useSessionClock(room, {
    active: room?.room !== null && callPhase === "in-call",
    onThreshold,
  });

  // Before the window opens, refetch for the descriptor once it does. The
  // closed state is derived from the same clock below.
  useEffect(() => {
    if (!room || room.room !== null || clock.now === null) {
      return;
    }
    if (
      clock.now < new Date(room.opensAt).getTime() ||
      clock.now > new Date(room.closesAt).getTime()
    ) {
      return;
    }
    // Deferred like the initial kickoff: the fetch settles asynchronously.
    const kickoff = setTimeout(() => void load(), 0);
    return () => clearTimeout(kickoff);
  }, [room, clock.now, load]);

  // The explicit "Join call" click performs the join: it records attendance
  // and returns the participant token. Connection/leave evidence arrives via
  // provider webhooks, so there is nothing to beacon on tab close.
  const requestToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await apiFetch(`/sessions/${sessionId}/room/join`, {
        method: "POST",
      });
      if (!response.ok) return null;
      return ((await response.json()) as JoinRoomResponse).token;
    } catch {
      return null;
    }
  }, [sessionId]);

  const onPhaseChange = useCallback(
    (phase: CallPhaseKind) => {
      setCallPhase(phase);
      if (phase !== "in-call") setFocus(false);
      if (phase === "in-call") {
        track(FUNNEL_EVENTS.roomJoined, { sessionId, role });
      }
    },
    [sessionId, role],
  );

  const onHideSelfChange = useCallback((hide: boolean) => {
    setHideSelf(hide);
    writeHideSelf(hide);
  }, []);

  const onCardLayout = useCallback((next: CardLayout) => {
    setCardLayout((prev) =>
      prev && prev.top === next.top && prev.height === next.height
        ? prev
        : next,
    );
  }, []);

  if (state.kind === "loading") {
    return <RoomShell>{t("loading")}</RoomShell>;
  }
  if (state.kind === "unavailable" || room === null) {
    return (
      <RoomShell>
        <div className="text-lg font-semibold text-text">
          {t("unavailableTitle")}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {t("unavailableHint")}
        </p>
        <BackToSessions label={t("backToSessions")} />
      </RoomShell>
    );
  }

  const withVideo = room.serviceType === ServiceType.VideoAnalysis;
  const closed =
    room.room === null &&
    clock.now !== null &&
    clock.now > new Date(room.closesAt).getTime();
  const countdown =
    clock.now === null
      ? null
      : formatClock(new Date(room.opensAt).getTime() - clock.now);
  const indicator =
    room.room !== null && clock.phase !== null
      ? {
          phase: clock.phase,
          text: t(`time.${clock.phase}`, {
            time: formatClock(clock.remainingMs),
          }),
          urgent:
            clock.phase === "during" &&
            clock.remainingMs <= CALL_TIME_REMINDER_BEFORE_END_MIN * 60_000,
        }
      : null;
  const theatre = withVideo && callPhase === "in-call";
  const focused = theatre && focus;
  const callLayout: CallLayout = focused ? "focus" : theatre ? "rail" : "stage";
  const railReserve = RAIL_MIN_WIDTH + GRID_GAP;
  const portrait = aspect < 1;
  const frameHeight = focused
    ? FOCUS_FRAME_HEIGHT
    : portrait
      ? PORTRAIT_FRAME_HEIGHT
      : THEATRE_FRAME_HEIGHT;
  const cardMinWidth = portrait ? PORTRAIT_CARD_MIN_WIDTH : CARD_MIN_WIDTH;
  const railTrack = portrait
    ? `minmax(${RAIL_MIN_WIDTH}px, ${PORTRAIT_RAIL_MAX_WIDTH}px)`
    : `minmax(${RAIL_MIN_WIDTH}px, 1fr)`;
  const gridStyle = theatre
    ? ({
        "--frame-h": frameHeight,
        "--card-cols": focused
          ? "minmax(0, 1fr)"
          : `clamp(min(${cardMinWidth}px, 100% - ${railReserve}px), calc(${frameHeight} * ${aspect.toFixed(4)}), 100% - ${railReserve}px) ${railTrack}`,
        "--rail-top": `${cardLayout?.top ?? 0}px`,
        "--rail-h": cardLayout ? `${cardLayout.height}px` : "auto",
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="pb-4 pt-1">
      <header className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <div>
          <h1 className="text-[24px] font-bold text-text">
            🎥 {t("titleWith", { name: room.counterpartName })}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            <LocalTime iso={room.startsAt} />{" "}
            <span className="text-text-tertiary">{tSessions("yourTime")}</span>
          </p>
          {/* Coach only (the API embeds the card under the paid-session rule);
              a native disclosure outside the LiveKit tree, so opening it
              never reconnects the call. */}
          {room.reschedule ? (
            <div className="max-w-[520px]">
              <RescheduleBanner
                sessionId={sessionId}
                proposal={room.reschedule}
                counterpartName={room.counterpartName}
                onChanged={() => void load()}
              />
            </div>
          ) : null}
          {room.playerContext ? (
            <PlayerContextDisclosure
              className="mt-2"
              player={room.playerContext}
              goal={room.goal}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {indicator ? (
            <span
              data-testid="room-time"
              data-phase={indicator.phase}
              className={`rounded-md px-2.5 py-1 text-[13px] font-semibold tabular-nums ${
                indicator.phase === "over"
                  ? "bg-[#FBE4E4] text-[#C4554D]"
                  : indicator.urgent
                    ? "bg-[#FDECC8] text-[#402C1B]"
                    : "bg-bg-secondary text-text-secondary"
              }`}
            >
              ⏱ {indicator.text}
            </span>
          ) : null}
          <BackToSessions label={t("backToSessions")} />
        </div>
      </header>

      <RoomToasts
        toasts={toasts}
        onDismiss={dismissToast}
        dismissLabel={t("time.dismiss")}
      />

      {room.room === null ? (
        <div className="rounded-card border border-border p-10 text-center">
          {closed ? (
            <>
              <div className="text-3xl">🔒</div>
              <div className="mt-2 font-semibold text-text">
                {t("closedTitle")}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {t("closedHint")}
              </p>
            </>
          ) : (
            <>
              <div className="text-3xl">⏳</div>
              <div className="mt-2 font-semibold text-text">
                {t("opensInTitle")}
              </div>
              {countdown ? (
                <div className="mt-2 text-3xl font-bold tabular-nums text-text">
                  {countdown}
                </div>
              ) : null}
              <p className="mt-2 text-sm text-text-secondary">
                {t("opensInHint")}
              </p>
            </>
          )}
        </div>
      ) : (
        <div
          data-testid="room-layout"
          data-layout={withVideo ? callLayout : "consultation"}
          data-orientation={
            theatre ? (portrait ? "portrait" : "landscape") : undefined
          }
          style={gridStyle}
          className={
            !withVideo
              ? "mx-auto max-w-[860px]"
              : theatre
                ? // Tailwind 4 emits no CSS for the arbitrary-property spelling
                  // of this (square brackets); the variable shorthand works.
                  // Tailwind also scans comments, so keep class-like text out.
                  `grid gap-4 min-[1000px]:grid-cols-(--card-cols)${
                    portrait && !focused ? " min-[1000px]:justify-center" : ""
                  }`
                : "grid gap-4 min-[900px]:grid-cols-2"
          }
        >
          <div
            className={
              theatre && !focused
                ? "order-2 min-w-0 min-[1000px]:order-none min-[1000px]:col-start-2 min-[1000px]:row-start-1 min-[1000px]:mt-[var(--rail-top)] min-[1000px]:h-[var(--rail-h)]"
                : theatre
                  ? "order-2"
                  : "min-w-0"
            }
          >
            {room.room.kind === "livekit" ? (
              <LiveKitCall
                serverUrl={room.room.url}
                counterpartName={room.counterpartName}
                displayName={displayName}
                requestToken={requestToken}
                layout={withVideo ? callLayout : "stage"}
                hideSelf={hideSelf}
                onHideSelfChange={onHideSelfChange}
                onFocusChange={setFocus}
                onPhaseChange={onPhaseChange}
                sessionId={sessionId}
                waitingNote={{
                  startsAt: room.startsAt,
                  isCoach: role === Role.Professional,
                }}
              />
            ) : null}
          </div>
          {withVideo ? (
            <div
              className={
                theatre
                  ? "min-w-0 min-[1000px]:col-start-1 min-[1000px]:row-start-1"
                  : "min-w-0"
              }
            >
              {room.videos.length > 0 ? (
                <RoomVideoPanel
                  sessionId={sessionId}
                  videos={room.videos}
                  userId={userId}
                  role={role}
                  onAspectChange={setAspect}
                  onCardLayout={onCardLayout}
                />
              ) : (
                <div className="rounded-card border border-border p-6 text-center text-sm text-text-secondary">
                  📹 {t("clips.removed")}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 max-w-[480px] rounded-card border border-border p-10 text-center text-sm text-text-secondary">
      {children}
    </div>
  );
}

function BackToSessions({ label }: { label: string }) {
  return (
    <Link
      href="/dashboard/sessions"
      className="text-sm text-text-secondary hover:text-text hover:underline"
    >
      ← {label}
    </Link>
  );
}
