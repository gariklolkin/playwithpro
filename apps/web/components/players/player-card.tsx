import type { PlayerCardResponse } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/ui/user-avatar";

/**
 * Read-only player summary for coaches/admins; booking and session screens
 * will embed it once those changes land.
 */
export function PlayerCard({ player }: { player: PlayerCardResponse }) {
  const t = useTranslations("playerProfile");

  const facts: string[] = [t(`details.levels.${player.level}`)];
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

  return (
    <div className="rounded-card bg-bg p-5 shadow-card">
      <div className="flex items-center gap-3">
        <UserAvatar
          displayName={player.displayName}
          avatarUrl={player.avatarUrl}
        />
        <div>
          <div className="text-[15px] font-semibold text-text">
            {player.displayName}
          </div>
          <div className="text-[13px] text-text-secondary">
            {facts.join(" · ")}
          </div>
        </div>
      </div>
      {player.about ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">
          {player.about}
        </p>
      ) : null}
    </div>
  );
}
