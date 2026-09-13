"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import {
  ConnectionQuality,
  ConnectionState,
  MediaDeviceFailure,
  Track,
  type RoomOptions,
} from "livekit-client";
import {
  Eye,
  EyeOff,
  Maximize2,
  Mic,
  MicOff,
  PanelRightOpen,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CallFrame } from "./call-frame";
import { CallPreJoin, type PreJoinChoices } from "./call-prejoin";
import { deviceNotice } from "@/lib/device-notice";

type CallPhase =
  | { kind: "prejoin" }
  | { kind: "joining" }
  | { kind: "in-call"; token: string }
  | { kind: "left"; reason: "user" | "connection" | "failed" };

export type CallPhaseKind = CallPhase["kind"];

/**
 * How the joined call is presented: the full stage (consultation rooms and
 * pre-theatre), the presence rail beside the attached clip, or only a
 * floating control bar while the clip is in focus. Switching never touches
 * the connection.
 */
export type CallLayout = "stage" | "rail" | "focus";

/**
 * The native call inside the session room: pre-join device check, the call
 * itself (counterpart or shared screen as the main tile, own camera as a
 * secondary tile), and a left/lost state that offers rejoining. Every join —
 * including a rejoin — asks the API for a fresh token, which is also what
 * records attendance.
 */
export function LiveKitCall({
  serverUrl,
  counterpartName,
  displayName,
  requestToken,
  layout = "stage",
  hideSelf = false,
  onHideSelfChange,
  onFocusChange,
  onPhaseChange,
}: {
  serverUrl: string;
  counterpartName: string;
  displayName: string;
  /** Performs the join action; resolves to the participant token or null. */
  requestToken: () => Promise<string | null>;
  layout?: CallLayout;
  /** Rail only: hide the party's own tile (publishing is unaffected). */
  hideSelf?: boolean;
  onHideSelfChange?: (hide: boolean) => void;
  onFocusChange?: (focus: boolean) => void;
  onPhaseChange?: (phase: CallPhaseKind) => void;
}) {
  const t = useTranslations("sessions.room.call");
  const [phase, setPhase] = useState<CallPhase>({ kind: "prejoin" });
  const [choices, setChoices] = useState<PreJoinChoices | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const leavingRef = useRef(false);

  const changePhase = useCallback(
    (next: CallPhase) => {
      setPhase(next);
      onPhaseChange?.(next.kind);
    },
    [onPhaseChange],
  );

  const join = useCallback(
    async (next: PreJoinChoices) => {
      setChoices(next);
      changePhase({ kind: "joining" });
      const token = await requestToken();
      if (!token) {
        changePhase({ kind: "left", reason: "failed" });
        return;
      }
      leavingRef.current = false;
      setMediaFailed(false);
      changePhase({ kind: "in-call", token });
    },
    [requestToken, changePhase],
  );

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: choices?.audioDeviceId
        ? { deviceId: choices.audioDeviceId }
        : undefined,
      videoCaptureDefaults: choices?.videoDeviceId
        ? { deviceId: choices.videoDeviceId }
        : undefined,
    }),
    [choices],
  );

  if (phase.kind === "prejoin" || phase.kind === "joining") {
    return (
      <CallPreJoin
        counterpartName={counterpartName}
        displayName={displayName}
        joining={phase.kind === "joining"}
        initial={choices}
        onJoin={(next) => void join(next)}
      />
    );
  }

  if (phase.kind === "left") {
    const title =
      phase.reason === "user"
        ? t("left.title")
        : phase.reason === "connection"
          ? t("lost.title")
          : t("joinFailed.title");
    const hint =
      phase.reason === "user"
        ? t("left.hint")
        : phase.reason === "connection"
          ? t("lost.hint")
          : t("joinFailed.hint");
    return (
      <CallFrame>
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="text-3xl">
            {phase.reason === "user" ? "👋" : "⚠️"}
          </div>
          <div className="font-semibold text-white">{title}</div>
          <p className="max-w-[360px] text-sm text-white/70">{hint}</p>
          <Button
            type="button"
            variant="blue"
            className="mt-3"
            onClick={() => changePhase({ kind: "prejoin" })}
          >
            {t("rejoin")}
          </Button>
        </div>
      </CallFrame>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={phase.token}
      connect
      audio={choices?.audioEnabled ?? true}
      video={choices?.videoEnabled ?? true}
      options={roomOptions}
      onDisconnected={() =>
        changePhase({
          kind: "left",
          reason: leavingRef.current ? "user" : "connection",
        })
      }
      // Publishing failures (no camera/mic, permission denied) also arrive
      // here; they must not end the call — the party can still listen and
      // watch, and the stage shows a warning instead.
      onError={(error) => {
        if (
          error instanceof DOMException ||
          MediaDeviceFailure.getFailure(error) !== undefined
        ) {
          setMediaFailed(true);
          return;
        }
        changePhase({ kind: "left", reason: "connection" });
      }}
      onMediaDeviceFailure={() => setMediaFailed(true)}
      className="contents"
    >
      <RoomAudioRenderer />
      <CallStage
        counterpartName={counterpartName}
        displayName={displayName}
        deviceError={mediaFailed}
        wantsCamera={choices?.videoEnabled ?? true}
        wantsMicrophone={choices?.audioEnabled ?? true}
        onDevicesRecovered={() => setMediaFailed(false)}
        onLeave={() => {
          leavingRef.current = true;
        }}
        layout={layout}
        hideSelf={hideSelf}
        onHideSelfChange={onHideSelfChange}
        onFocusChange={onFocusChange}
      />
    </LiveKitRoom>
  );
}

function CallStage({
  counterpartName,
  displayName,
  deviceError,
  wantsCamera,
  wantsMicrophone,
  onDevicesRecovered,
  onLeave,
  layout,
  hideSelf,
  onHideSelfChange,
  onFocusChange,
}: {
  counterpartName: string;
  displayName: string;
  deviceError: boolean;
  wantsCamera: boolean;
  wantsMicrophone: boolean;
  onDevicesRecovered: () => void;
  onLeave: () => void;
  layout: CallLayout;
  hideSelf: boolean;
  onHideSelfChange?: (hide: boolean) => void;
  onFocusChange?: (focus: boolean) => void;
}) {
  const t = useTranslations("sessions.room.call");
  const tLayout = useTranslations("sessions.room.layout");
  const room = useRoomContext();
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const notice = deviceNotice({
    deviceError,
    wantsCamera,
    wantsMicrophone,
    cameraOn: isCameraEnabled,
    microphoneOn: isMicrophoneEnabled,
  });
  // Once everything requested is published the error is history; forgetting
  // it keeps a later deliberate mute from resurrecting the notice.
  useEffect(() => {
    if (deviceError && notice === null) onDevicesRecovered();
  }, [deviceError, notice, onDevicesRecovered]);
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const isLocal = (ref: TrackReferenceOrPlaceholder) =>
    ref.participant.identity === room.localParticipant.identity;
  const remoteScreen = tracks.find(
    (ref) => ref.source === Track.Source.ScreenShare && !isLocal(ref),
  );
  const remoteCamera = tracks.find(
    (ref) => ref.source === Track.Source.Camera && !isLocal(ref),
  );
  const localCamera = tracks.find(
    (ref) => ref.source === Track.Source.Camera && isLocal(ref),
  );
  const counterpartPresent = remoteParticipants.length > 0;
  const main = remoteScreen ?? remoteCamera;
  const reconnecting = connectionState === ConnectionState.Reconnecting;

  if (layout === "focus") {
    return (
      <FocusBar
        reconnecting={reconnecting}
        onLeave={onLeave}
        onExitFocus={() => onFocusChange?.(false)}
      />
    );
  }

  const mainTile =
    main && counterpartPresent ? (
      <Tile
        trackRef={main}
        label={
          remoteScreen
            ? t("screenOf", { name: counterpartName })
            : counterpartName
        }
        fill={layout === "stage" || remoteScreen !== undefined}
      />
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <Initial name={counterpartName} size="lg" />
        <div className="text-sm text-white/80">
          {connectionState === ConnectionState.Connecting
            ? t("connecting")
            : t("waiting", { name: counterpartName })}
        </div>
      </div>
    );

  const overlays = (
    <>
      <QualityBadge />
      {notice ? (
        <div className="absolute left-3 top-10 max-w-[70%] rounded bg-black/70 px-2 py-1 text-[12px] text-amber-200">
          {notice === "camera"
            ? t("cameraUnavailable")
            : notice === "microphone"
              ? t("micUnavailable")
              : t("mediaUnavailable")}
        </div>
      ) : null}
      {reconnecting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
          {t("reconnecting")}
        </div>
      ) : null}
    </>
  );

  if (layout === "rail") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 max-[999px]:flex-row max-[999px]:flex-wrap">
        <div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary max-[999px]:hidden">
          {tLayout("onCall")}
        </div>
        <div
          data-testid="rail-counterpart"
          className="relative min-h-[120px] flex-1 overflow-hidden rounded-card border border-border bg-black max-[999px]:aspect-video max-[999px]:min-h-0 max-[999px]:min-w-[200px] max-[999px]:basis-0"
        >
          {mainTile}
          {remoteScreen && remoteCamera ? (
            <div className="absolute bottom-2 right-2">
              <Tile trackRef={remoteCamera} label={counterpartName} small />
            </div>
          ) : null}
          {overlays}
        </div>
        {hideSelf ? null : (
          <div
            data-testid="rail-self"
            className="relative aspect-video shrink-0 overflow-hidden rounded-card border border-border bg-black max-[999px]:min-w-[160px] max-[999px]:flex-1 max-[999px]:basis-0"
          >
            <Tile
              trackRef={localCamera}
              label={t("you")}
              mirror
              fallbackName={displayName}
            />
          </div>
        )}
        <div className="flex flex-col items-center justify-center gap-1.5 max-[999px]:basis-full min-[640px]:max-[999px]:basis-auto">
          <CallControls onLeave={onLeave} variant="rail" />
          <div className="flex items-center gap-1">
            <RailToggle
              label={hideSelf ? tLayout("showSelf") : tLayout("hideSelf")}
              hint={tLayout("hideSelfHint")}
              pressed={hideSelf}
              onClick={() => onHideSelfChange?.(!hideSelf)}
            >
              {hideSelf ? <Eye size={16} /> : <EyeOff size={16} />}
            </RailToggle>
            <RailToggle
              label={tLayout("focus")}
              pressed={false}
              onClick={() => onFocusChange?.(true)}
            >
              <Maximize2 size={16} />
            </RailToggle>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <CallFrame>
        {mainTile}

        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
          {remoteScreen && remoteCamera ? (
            <Tile trackRef={remoteCamera} label={counterpartName} small />
          ) : null}
          <Tile
            trackRef={localCamera}
            label={t("you")}
            small
            mirror
            fallbackName={displayName}
          />
        </div>

        {overlays}
      </CallFrame>
      <CallControls onLeave={onLeave} variant="stage" />
    </div>
  );
}

function Tile({
  trackRef,
  label,
  fill,
  small,
  mirror,
  fallbackName,
}: {
  trackRef: TrackReferenceOrPlaceholder | undefined;
  label: string;
  fill?: boolean;
  small?: boolean;
  mirror?: boolean;
  fallbackName?: string;
}) {
  const hasVideo =
    trackRef !== undefined &&
    isTrackReference(trackRef) &&
    !trackRef.publication.isMuted;
  const frame = small
    ? "relative h-[84px] w-[112px] overflow-hidden rounded-lg border border-white/20 bg-neutral-900 min-[900px]:h-[108px] min-[900px]:w-[144px]"
    : "relative h-full w-full bg-black";
  return (
    <div className={frame}>
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={`h-full w-full ${fill ? "object-contain" : "object-cover"}`}
          style={mirror ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Initial
            name={fallbackName ?? trackRef?.participant.name ?? label}
            size={small ? "sm" : "lg"}
          />
        </div>
      )}
      <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
        {label}
      </span>
    </div>
  );
}

function Initial({ name, size }: { name: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center rounded-full bg-white/15 font-semibold text-white ${
        size === "lg" ? "h-20 w-20 text-2xl" : "h-9 w-9 text-sm"
      }`}
    >
      {name.trim().charAt(0).toUpperCase() || "🏓"}
    </span>
  );
}

function QualityBadge() {
  const t = useTranslations("sessions.room.call.quality");
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({
    participant: localParticipant,
  });
  const color =
    quality === ConnectionQuality.Excellent
      ? "bg-emerald-400"
      : quality === ConnectionQuality.Good
        ? "bg-amber-300"
        : quality === ConnectionQuality.Poor
          ? "bg-orange-500"
          : quality === ConnectionQuality.Lost
            ? "bg-red-500"
            : "bg-white/40";
  const label =
    quality === ConnectionQuality.Excellent
      ? t("excellent")
      : quality === ConnectionQuality.Good
        ? t("good")
        : quality === ConnectionQuality.Poor
          ? t("poor")
          : quality === ConnectionQuality.Lost
            ? t("lost")
            : t("unknown");
  return (
    <span
      className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white"
      title={label}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function CallControls({
  onLeave,
  variant,
}: {
  onLeave: () => void;
  variant: "stage" | "rail";
}) {
  const t = useTranslations("sessions.room.call.controls");
  const room = useRoomContext();
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const canShareScreen =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return (
    <div
      className={`flex flex-wrap items-center justify-center ${
        variant === "stage" ? "mt-3 gap-2" : "gap-1.5"
      }`}
    >
      <ControlButton
        active={mic.enabled}
        pending={mic.pending}
        label={mic.enabled ? t("mute") : t("unmute")}
        onClick={() => void mic.toggle()}
      >
        {mic.enabled ? <Mic size={18} /> : <MicOff size={18} />}
      </ControlButton>
      <ControlButton
        active={camera.enabled}
        pending={camera.pending}
        label={camera.enabled ? t("cameraOff") : t("cameraOn")}
        onClick={() => void camera.toggle()}
      >
        {camera.enabled ? <Video size={18} /> : <VideoOff size={18} />}
      </ControlButton>
      {canShareScreen ? (
        <ControlButton
          active={!screen.enabled}
          highlight={screen.enabled}
          pending={screen.pending}
          label={screen.enabled ? t("stopShare") : t("shareScreen")}
          onClick={() => void screen.toggle()}
        >
          {screen.enabled ? (
            <ScreenShareOff size={18} />
          ) : (
            <ScreenShare size={18} />
          )}
        </ControlButton>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onLeave();
          void room.disconnect();
        }}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-destructive py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 max-[639px]:py-3 ${
          variant === "stage" ? "ml-2 px-4" : "px-3"
        }`}
      >
        <PhoneOff size={18} />
        {t("leave")}
      </button>
    </div>
  );
}

/** While the clip is in focus: the call keeps running behind a small bar. */
function FocusBar({
  reconnecting,
  onLeave,
  onExitFocus,
}: {
  reconnecting: boolean;
  onLeave: () => void;
  onExitFocus: () => void;
}) {
  const t = useTranslations("sessions.room.call");
  const tLayout = useTranslations("sessions.room.layout");
  const room = useRoomContext();
  const mic = useTrackToggle({ source: Track.Source.Microphone });

  return (
    <div
      role="group"
      aria-label={tLayout("onCall")}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900/90 p-1.5 shadow-lg"
    >
      {reconnecting ? (
        <span className="px-2 text-xs text-white/80">{t("reconnecting")}</span>
      ) : null}
      <ControlButton
        active={mic.enabled}
        pending={mic.pending}
        label={mic.enabled ? t("controls.mute") : t("controls.unmute")}
        onClick={() => void mic.toggle()}
      >
        {mic.enabled ? <Mic size={18} /> : <MicOff size={18} />}
      </ControlButton>
      <button
        type="button"
        aria-label={t("controls.leave")}
        title={t("controls.leave")}
        onClick={() => {
          onLeave();
          void room.disconnect();
        }}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-destructive text-white transition-colors hover:bg-red-700 max-[639px]:h-11 max-[639px]:w-11"
      >
        <PhoneOff size={18} />
      </button>
      <button
        type="button"
        aria-label={tLayout("exitFocus")}
        title={tLayout("exitFocus")}
        onClick={onExitFocus}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 max-[639px]:h-11 max-[639px]:w-11"
      >
        <PanelRightOpen size={18} />
      </button>
    </div>
  );
}

function RailToggle({
  label,
  hint,
  pressed,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={hint ? `${label} — ${hint}` : label}
      onClick={onClick}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text max-[639px]:h-11 max-[639px]:w-11"
    >
      {children}
    </button>
  );
}

function ControlButton({
  active,
  highlight,
  pending,
  label,
  onClick,
  children,
}: {
  /** Neutral look when true; "off" look (muted/disabled) when false. */
  active: boolean;
  highlight?: boolean;
  pending: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const look = highlight
    ? "border-accent bg-accent text-white hover:bg-accent/90"
    : active
      ? "border-border-strong bg-bg text-text hover:bg-bg-hover"
      : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!active}
      title={label}
      disabled={pending}
      onClick={onClick}
      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 max-[639px]:h-11 max-[639px]:w-11 ${look}`}
    >
      {children}
    </button>
  );
}
