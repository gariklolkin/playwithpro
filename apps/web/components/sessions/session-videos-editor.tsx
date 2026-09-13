"use client";

import {
  VideoStatus,
  type SessionResponse,
  type SessionVideoInput,
  type VideoLimits,
  type VideoListResponse,
  type VideoResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ClipPicker } from "@/components/sessions/clip-picker";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { clipSetErrorMessage, clipSetStatus } from "@/lib/clip-set";

/**
 * Lets the player replace a session's clip set until it starts: opens
 * inline on the session card, reuses the booking picker, and saves the
 * whole ordered set atomically through PUT /sessions/:id/videos.
 */
export function SessionVideosEditor({
  session,
  onUpdated,
}: {
  session: SessionResponse;
  onUpdated: (session: SessionResponse) => void;
}) {
  const t = useTranslations("sessions.videos");
  const tClips = useTranslations("clips");
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<{
    videos: VideoResponse[];
    limits: VideoLimits;
  } | null>(null);
  const [clips, setClips] = useState<SessionVideoInput[]>(() =>
    session.videos.map((clip) => ({ videoId: clip.videoId, note: clip.note })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || library !== null) return;
    void apiFetch("/videos").then(async (response) => {
      if (!response.ok) return;
      const list = (await response.json()) as VideoListResponse;
      setLibrary({
        videos: list.videos.filter(
          (video) => video.status === VideoStatus.Ready,
        ),
        limits: list.limits,
      });
    });
  }, [open, library]);

  const invalid = library
    ? clipSetStatus(clips, library.videos, library.limits.session).invalid
    : true;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/sessions/${session.id}/videos`, {
        method: "PUT",
        body: JSON.stringify({ videos: clips }),
      });
      if (response.ok) {
        onUpdated((await response.json()) as SessionResponse);
        setOpen(false);
        return;
      }
      if (response.status === 409) {
        setError(t("locked"));
        return;
      }
      const body = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      setError(clipSetErrorMessage(tClips, body, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-[13px] font-medium text-[#2A5FC7] hover:underline"
      >
        ✏️ {t("edit")}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-bg p-3">
      <div className="mb-2 text-[13px] font-medium text-text-secondary">
        {t("title")}
      </div>
      {library === null ? (
        <div className="py-2 text-center text-sm text-text-tertiary">…</div>
      ) : (
        <ClipPicker
          videos={library.videos}
          caps={library.limits.session}
          value={clips}
          onChange={setClips}
        />
      )}
      {error ? (
        <p className="mt-2 rounded-md bg-[#FBE4E4] p-2 text-[13px] text-[#C4554D]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={invalid || saving}
          onClick={() => void save()}
        >
          {saving ? "…" : t("save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            setError(null);
            setClips(
              session.videos.map((clip) => ({
                videoId: clip.videoId,
                note: clip.note,
              })),
            );
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
