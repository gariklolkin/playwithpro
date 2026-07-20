"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import {
  cropToAvatar,
  type CroppedAvatar,
  type PixelCrop,
} from "@/lib/crop-image";

/**
 * Square crop modal: zoom slider + drag to pan. Confirms with a normalized
 * 512×512 blob; cancelling produces nothing.
 */
export function AvatarCropDialog({
  imageUrl,
  onConfirm,
  onCancel,
}: {
  imageUrl: string;
  onConfirm: (avatar: CroppedAvatar) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings.avatar.crop");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [status, setStatus] = useState<"idle" | "exporting" | "error">("idle");

  const handleCropComplete = useCallback(
    (_area: unknown, areaPixels: PixelCrop) => setPixels(areaPixels),
    [],
  );

  async function handleConfirm() {
    if (!pixels) return;
    setStatus("exporting");
    try {
      onConfirm(await cropToAvatar(imageUrl, pixels));
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal
      aria-label={t("title")}
    >
      <div className="w-full max-w-[440px] rounded-card bg-bg p-5 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold text-text">
          {t("title")}
        </h2>
        <div className="relative h-[320px] overflow-hidden rounded-lg bg-bg-secondary">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
        <label className="mt-4 flex items-center gap-3 text-[13px] text-text-secondary">
          {t("zoom")}
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1 accent-[#2E7DE1]"
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          {status === "error" ? (
            <span className="mr-auto text-[13px] text-[#E03E3E]">
              {t("error")}
            </span>
          ) : null}
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={!pixels || status === "exporting"}
            onClick={() => void handleConfirm()}
          >
            {status === "exporting" ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
