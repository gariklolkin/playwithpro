"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  cropToAvatar,
  type CroppedAvatar,
  type PixelCrop,
} from "@/lib/crop-image";

/**
 * Square crop modal: zoom slider + drag to pan. Confirms with a normalized
 * 512×512 blob; cancelling produces nothing. Rendered as a Base UI dialog so
 * it nests correctly inside the settings dialog (stacks above it, covers the
 * viewport regardless of the parent's transform, returns focus on close).
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogTitle className="mb-3">{t("title")}</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}
