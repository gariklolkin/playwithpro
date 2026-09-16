"use client";

import {
  SESSION_GOAL_MAX_LENGTH,
  type SessionResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

/**
 * The player's goal on a session card: shown as a line, editable inline
 * until the slot starts (same rule as the clip set), saved through
 * PATCH /sessions/:id/goal. The coach never sees this editor.
 */
export function SessionGoalEditor({
  session,
  editable,
  onUpdated,
}: {
  session: SessionResponse;
  editable: boolean;
  onUpdated: (session: SessionResponse) => void;
}) {
  const t = useTranslations("sessions.goal");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(session.goal ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const trimmed = draft.trim();
      const response = await apiFetch(`/sessions/${session.id}/goal`, {
        method: "PATCH",
        body: JSON.stringify({ goal: trimmed === "" ? null : trimmed }),
      });
      if (response.ok) {
        onUpdated((await response.json()) as SessionResponse);
        setOpen(false);
        return;
      }
      setError(response.status === 409 ? t("locked") : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-0.5 text-[13px]" data-testid="session-goal">
        {session.goal ? (
          <span className="text-text" data-ph-mask>
            🎯 {session.goal}
          </span>
        ) : editable ? (
          <span className="text-text-tertiary">{t("none")}</span>
        ) : null}
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setDraft(session.goal ?? "");
              setOpen(true);
            }}
            className="ml-2 font-medium text-[#2A5FC7] hover:underline"
          >
            ✏️ {session.goal ? t("edit") : t("add")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-bg p-3">
      <label className="mb-1 block text-[13px] font-medium text-text-secondary">
        {t("label")}
      </label>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("placeholder")}
        rows={3}
        maxLength={SESSION_GOAL_MAX_LENGTH}
        data-ph-mask
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
      />
      <div className="mt-1 text-right text-[11px] tabular-nums text-text-tertiary">
        {draft.length}/{SESSION_GOAL_MAX_LENGTH}
      </div>
      {error ? (
        <p className="mt-1 rounded-md bg-[#FBE4E4] p-2 text-[13px] text-[#C4554D]">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "…" : t("save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
