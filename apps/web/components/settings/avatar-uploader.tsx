"use client";

import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  AVATAR_MAX_SIZE_BYTES,
  type AvatarUploadUrlResponse,
  type MeResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";

type Status =
  "idle" | "uploading" | "removing" | "tooLarge" | "badType" | "error";

/**
 * Two-step avatar upload: get a pre-signed URL from the API, PUT the file
 * straight to storage, then confirm so the API attaches it to the account.
 */
export function AvatarUploader({
  user,
  onUserChange,
}: {
  user: MeResponse;
  onUserChange: (user: MeResponse) => void;
}) {
  const t = useTranslations("settings.avatar");
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function handleFile(file: File) {
    if (
      !(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)
    ) {
      setStatus("badType");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE_BYTES) {
      setStatus("tooLarge");
      return;
    }
    setStatus("uploading");
    try {
      const urlResponse = await apiFetch("/users/me/avatar/upload-url", {
        method: "POST",
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!urlResponse.ok) {
        setStatus("error");
        return;
      }
      const { uploadUrl, key } =
        (await urlResponse.json()) as AvatarUploadUrlResponse;
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) {
        setStatus("error");
        return;
      }
      const confirmResponse = await apiFetch("/users/me/avatar", {
        method: "PUT",
        body: JSON.stringify({ key }),
      });
      if (!confirmResponse.ok) {
        setStatus("error");
        return;
      }
      onUserChange((await confirmResponse.json()) as MeResponse);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function handleRemove() {
    setStatus("removing");
    const response = await apiFetch("/users/me/avatar", { method: "DELETE" });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    onUserChange((await response.json()) as MeResponse);
    setStatus("idle");
  }

  const busy = status === "uploading" || status === "removing";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar
        displayName={user.displayName}
        avatarUrl={user.avatarUrl}
        size="lg"
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ALLOWED_CONTENT_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {status === "uploading"
              ? t("uploading")
              : user.avatarUrl
                ? t("change")
                : t("upload")}
          </Button>
          {user.avatarUrl ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {status === "removing" ? t("removing") : t("remove")}
            </Button>
          ) : null}
        </div>
        <span className="text-[13px] text-text-tertiary">{t("hint")}</span>
        {status === "badType" ? (
          <span className="text-[13px] text-[#E03E3E]">{t("badType")}</span>
        ) : null}
        {status === "tooLarge" ? (
          <span className="text-[13px] text-[#E03E3E]">{t("tooLarge")}</span>
        ) : null}
        {status === "error" ? (
          <span className="text-[13px] text-[#E03E3E]">{t("error")}</span>
        ) : null}
      </div>
    </div>
  );
}
