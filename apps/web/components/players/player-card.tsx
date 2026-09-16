import type { PlayerCardResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/ui/user-avatar";

/**
 * Read-only player summary as a coach receives it through a paid session
 * (and as the player previews it). A profile that was never saved shows an
 * explicit "not filled in" line instead of presenting the default level as
 * a fact. The optional goal slot carries the session's "focus on" text.
 */
export function PlayerCard({
  player,
  goal,
}: {
  player: PlayerCardResponse;
  goal?: string | null;
}) {
  const t = useTranslations("playerProfile");

  const facts: string[] = [];
  if (player.filled) {
    facts.push(t(`details.levels.${player.level}`));
    if (player.style !== null) {
      facts.push(t(`details.styles.${player.style}`));
    }
    if (player.yearsOfExperience !== null) {
      facts.push(t("card.years", { years: player.yearsOfExperience }));
    }
    if (player.handedness !== null) {
      facts.push(t(`details.handednessOptions.${player.handedness}`));
    }
    if (player.grip !== null) {
      facts.push(t(`details.gripOptions.${player.grip}`));
    }
  }

  return (
    <div
      className="rounded-card bg-bg p-5 shadow-card"
      data-testid="player-card"
    >
      <div className="flex items-center gap-3">
        <UserAvatar
          displayName={player.displayName}
          avatarUrl={player.avatarUrl}
        />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-text">
            {player.displayName}
          </div>
          <div className="text-[13px] text-text-secondary">
            {player.filled ? facts.join(" · ") : t("card.unfilled")}
          </div>
        </div>
      </div>
      {player.filled && player.about ? (
        <p
          className="mt-3 whitespace-pre-wrap text-sm text-text-secondary"
          data-ph-mask
        >
          {player.about}
        </p>
      ) : null}
      {goal !== undefined ? (
        <div className="mt-3 rounded-md bg-[#EAF2FD] p-3 text-sm">
          <div className="text-[12px] font-medium uppercase tracking-[0.5px] text-[#2A5FC7]">
            🎯 {t("card.goalLabel")}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-text" data-ph-mask>
            {goal ? (
              goal
            ) : (
              <span className="text-text-tertiary">{t("card.noGoal")}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
