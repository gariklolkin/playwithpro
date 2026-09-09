"use client";

import {
  ServiceType,
  type JoinRoomResponse,
  type SessionRoomResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LocalTime } from "@/components/catalog/local-time";
import { RoomVideoPanel } from "@/components/sessions/room-video-panel";
import { apiFetch } from "@/lib/api";
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

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * The platform session room: countdown before the join window, the native
 * call inside it (side by side with the attached video for video-analysis
 * sessions), closed state after the grace period.
 */
export function SessionRoom({
  sessionId,
  displayName,
}: {
  sessionId: string;
  displayName: string;
}) {
  const t = useTranslations("sessions.room");
  const tSessions = useTranslations("sessions");
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [countdown, setCountdown] = useState<string | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);

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

  // Tick a countdown until the window opens, then refetch for the descriptor.
  useEffect(() => {
    if (!room || room.room !== null) {
      return;
    }
    const opensAtMs = new Date(room.opensAt).getTime();
    const closesAtMs = new Date(room.closesAt).getTime();
    const tick = () => {
      const now = Date.now();
      if (now > closesAtMs) {
        setWindowClosed(true);
        return;
      }
      const left = opensAtMs - now;
      if (left <= 0) {
        void load();
        return;
      }
      setCountdown(formatCountdown(left));
    };
    // Deferred first tick keeps the effect free of synchronous setState.
    const kickoff = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [room, load]);

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

  const withVideo =
    room.serviceType === ServiceType.VideoAnalysis && room.videoId !== null;
  const closed = room.room === null && windowClosed;

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
        </div>
        <BackToSessions label={t("backToSessions")} />
      </header>

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
          className={
            withVideo
              ? "grid gap-4 min-[900px]:grid-cols-2"
              : "mx-auto max-w-[860px]"
          }
        >
          <div>
            {room.room.kind === "livekit" ? (
              <LiveKitCall
                serverUrl={room.room.url}
                counterpartName={room.counterpartName}
                displayName={displayName}
                requestToken={requestToken}
              />
            ) : null}
          </div>
          {withVideo && room.videoId ? (
            <RoomVideoPanel
              sessionId={sessionId}
              videoId={room.videoId}
              videoTitle={room.videoTitle}
            />
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
