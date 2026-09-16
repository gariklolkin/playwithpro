"use client";

import type { PlayerCardResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { PlayerCard } from "@/components/players/player-card";

/**
 * The coach's collapsed "About the player" block: the player's card and
 * the session goal. Rendered only when the API embedded a card (the
 * paid-session rule lives server-side). A native disclosure, so opening it
 * never touches the surrounding layout or, in the room, the call.
 */
export function PlayerContextDisclosure({
  player,
  goal,
  className,
}: {
  player: PlayerCardResponse;
  goal: string | null;
  className?: string;
}) {
  const t = useTranslations("sessions.aboutPlayer");
  return (
    <details className={className} data-testid="player-context">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-[#2A5FC7] hover:underline">
        👤 {t("title")}
      </summary>
      <div className="mt-2">
        <PlayerCard player={player} goal={goal} />
      </div>
    </details>
  );
}
