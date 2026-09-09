"use client";

import {
  useMediaDeviceSelect,
  usePreviewTracks,
} from "@livekit/components-react";
import {
  Track,
  type CreateLocalTracksOptions,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CallFrame } from "./call-frame";

export interface PreJoinChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId: string | null;
  videoDeviceId: string | null;
}

/**
 * Device check before connecting: live camera preview, device pickers, and
 * mute toggles. Joining is an explicit click — it records attendance and
 * doubles as the user gesture browsers require before playing remote audio.
 */
export function CallPreJoin({
  counterpartName,
  displayName,
  joining,
  initial,
  onJoin,
}: {
  counterpartName: string;
  displayName: string;
  joining: boolean;
  initial: PreJoinChoices | null;
  onJoin: (choices: PreJoinChoices) => void;
}) {
  const t = useTranslations("sessions.room.call");
  const [audioEnabled, setAudioEnabled] = useState(
    initial?.audioEnabled ?? true,
  );
  const [videoEnabled, setVideoEnabled] = useState(
    initial?.videoEnabled ?? true,
  );
  const [audioDeviceId, setAudioDeviceId] = useState<string | null>(
    initial?.audioDeviceId ?? null,
  );
  const [videoDeviceId, setVideoDeviceId] = useState<string | null>(
    initial?.videoDeviceId ?? null,
  );
  const [deviceError, setDeviceError] = useState<Error | null>(null);

  // usePreviewTracks re-acquires media whenever these options change, so the
  // object must be stable between renders.
  const previewOptions = useMemo<CreateLocalTracksOptions>(
    () => ({
      audio: audioEnabled
        ? audioDeviceId
          ? { deviceId: audioDeviceId }
          : true
        : false,
      video: videoEnabled
        ? videoDeviceId
          ? { deviceId: videoDeviceId }
          : true
        : false,
    }),
    [audioEnabled, videoEnabled, audioDeviceId, videoDeviceId],
  );
  const tracks = usePreviewTracks(previewOptions, setDeviceError);
  const videoTrack = tracks?.find(
    (track): track is LocalVideoTrack => track.kind === Track.Kind.Video,
  );
  const audioTrack = tracks?.find(
    (track): track is LocalAudioTrack => track.kind === Track.Kind.Audio,
  );
  // Until the user picks a device, the effective one is whatever the browser
  // handed the preview — the pickers must show that, not an empty value.
  const activeVideoDeviceId = videoDeviceId ?? deviceIdOf(videoTrack) ?? null;
  const activeAudioDeviceId = audioDeviceId ?? deviceIdOf(audioTrack) ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !videoTrack) return;
    videoTrack.attach(element);
    return () => {
      videoTrack.detach(element);
    };
  }, [videoTrack]);

  return (
    <div>
      <CallFrame>
        {videoEnabled && videoTrack ? (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold text-white"
            >
              {displayName.trim().charAt(0).toUpperCase() || "🏓"}
            </span>
            {!videoEnabled ? (
              <div className="text-sm text-white/70">
                {t("prejoin.cameraOff")}
              </div>
            ) : null}
          </div>
        )}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <ToggleButton
            active={audioEnabled}
            label={audioEnabled ? t("controls.mute") : t("controls.unmute")}
            onClick={() => setAudioEnabled((value) => !value)}
          >
            {audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </ToggleButton>
          <ToggleButton
            active={videoEnabled}
            label={
              videoEnabled ? t("controls.cameraOff") : t("controls.cameraOn")
            }
            onClick={() => setVideoEnabled((value) => !value)}
          >
            {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          </ToggleButton>
        </div>
      </CallFrame>

      <div className="mt-3 rounded-card border border-border p-4">
        <div className="font-semibold text-text">{t("prejoin.title")}</div>
        <p className="mt-1 text-sm text-text-secondary">
          {t("prejoin.hint", { name: counterpartName })}
        </p>
        {deviceError ? (
          <p className="mt-2 text-sm text-destructive">
            {t("prejoin.permissionDenied")}
          </p>
        ) : null}
        {/* Device labels only exist once permission was granted, so the
            pickers mount after the preview acquired its tracks. */}
        {tracks ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DevicePicker
              kind="videoinput"
              label={t("prejoin.camera")}
              value={activeVideoDeviceId}
              onChange={setVideoDeviceId}
            />
            <DevicePicker
              kind="audioinput"
              label={t("prejoin.microphone")}
              value={activeAudioDeviceId}
              onChange={setAudioDeviceId}
            />
          </div>
        ) : null}
        <Button
          type="button"
          variant="blue"
          className="mt-4"
          disabled={joining}
          onClick={() =>
            onJoin({
              audioEnabled,
              videoEnabled,
              audioDeviceId: activeAudioDeviceId,
              videoDeviceId: activeVideoDeviceId,
            })
          }
        >
          {joining ? t("prejoin.joining") : t("prejoin.join")}
        </Button>
      </div>
    </div>
  );
}

function deviceIdOf(
  track: LocalAudioTrack | LocalVideoTrack | undefined,
): string | undefined {
  const id = track?.mediaStreamTrack.getSettings().deviceId;
  return id || undefined;
}

function DevicePicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: MediaDeviceKind;
  label: string;
  value: string | null;
  onChange: (deviceId: string) => void;
}) {
  const { devices } = useMediaDeviceSelect({ kind, requestPermissions: false });
  const id = `device-${kind}`;
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border-strong bg-bg px-2.5 py-2 text-sm text-text"
      >
        {value === null ? <option value="">—</option> : null}
        {devices.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={!active}
      title={label}
      onClick={onClick}
      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors ${
        active
          ? "border-white/30 bg-black/50 text-white hover:bg-black/70"
          : "border-destructive bg-destructive text-white hover:bg-red-700"
      }`}
    >
      {children}
    </button>
  );
}
