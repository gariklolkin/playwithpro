"use client";

import { useTranslations } from "next-intl";
import { useNow } from "@/lib/use-now";

/** Minutes after the start before an absent counterpart is worth a word. */
export const WAITING_NOTE_AFTER_MIN = 10;

/**
 * Reassurance for the party waiting alone in the call once the session is
 * well under way: the player is not charged for a coach who never comes, the
 * coach is still paid for a player who never comes. Informational only — no
 * action, and the room stays open.
 */
export function WaitingNote({
  startsAt,
  isCoach,
  counterpartName,
}: {
  startsAt: string;
  isCoach: boolean;
  counterpartName: string;
}) {
  const t = useTranslations("sessions.room.call.waitingNote");
  const now = useNow(15_000);
  if (
    now === null ||
    now < new Date(startsAt).getTime() + WAITING_NOTE_AFTER_MIN * 60_000
  ) {
    return null;
  }
  return (
    <p
      role="status"
      className="max-w-[320px] rounded-lg bg-white/10 px-3 py-2 text-[13px] text-white/90"
    >
      {t(isCoach ? "coach" : "player", { name: counterpartName })}
    </p>
  );
}
