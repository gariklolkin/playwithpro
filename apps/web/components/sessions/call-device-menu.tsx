"use client";

import {
  useMediaDeviceSelect,
  useRoomContext,
} from "@livekit/components-react";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ControlButton } from "./control-button";

/** Speaker routing needs `setSinkId` (Chromium); elsewhere the picker is absent. */
const OUTPUT_ROUTING_SUPPORTED =
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype;

/**
 * In-call device switching: a control that opens camera / microphone /
 * speaker pickers. A pick swaps the published track in place through the
 * room, so the connection, token and attendance entry are untouched.
 */
export function DeviceMenu({ align = "center" }: { align?: "center" | "end" }) {
  const t = useTranslations("sessions.room.call.devices");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <ControlButton
        active
        pending={false}
        expanded={open}
        label={t("open")}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings2 size={18} />
      </ControlButton>
      {open ? (
        <div
          role="dialog"
          aria-label={t("title")}
          className={`absolute bottom-full z-30 mb-2 flex w-64 flex-col gap-2 rounded-lg border border-border bg-bg p-3 shadow-lg ${
            align === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <DeviceSelect kind="videoinput" label={t("camera")} />
          <DeviceSelect kind="audioinput" label={t("microphone")} />
          {OUTPUT_ROUTING_SUPPORTED ? (
            <DeviceSelect kind="audiooutput" label={t("speaker")} optional />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeviceSelect({
  kind,
  label,
  optional,
}: {
  kind: MediaDeviceKind;
  label: string;
  /** Render nothing when the browser lists no device of this kind. */
  optional?: boolean;
}) {
  const room = useRoomContext();
  const { devices, activeDeviceId, setActiveMediaDevice } =
    useMediaDeviceSelect({ kind, room, requestPermissions: false });
  if (optional && devices.length === 0) return null;
  const id = `call-device-${kind}`;
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </span>
      <select
        id={id}
        value={activeDeviceId}
        onChange={(event) =>
          // A failed switch (device unplugged meanwhile) keeps the old track;
          // the derived device notice reports anything actually missing.
          void setActiveMediaDevice(event.target.value).catch(() => undefined)
        }
        className="w-full rounded-lg border border-border-strong bg-bg px-2.5 py-2 text-sm text-text"
      >
        {devices.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
