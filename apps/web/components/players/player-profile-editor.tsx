"use client";

import {
  Grip,
  Handedness,
  PLAYER_ABOUT_MAX_LENGTH,
  PlayerLevel,
  PlayingStyle,
  type MeResponse,
  type PlayerProfileResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ProfileCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-card bg-bg p-6 shadow-card">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}

const SELECT_CLASS =
  "w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text";

/** "" in a select maps to null in the API (field cleared). */
const EMPTY = "";

interface FormState {
  level: PlayerLevel;
  style: string;
  years: string;
  handedness: string;
  grip: string;
  about: string;
}

function toFormState(profile: PlayerProfileResponse): FormState {
  return {
    level: profile.level,
    style: profile.style ?? EMPTY,
    years: profile.yearsOfExperience?.toString() ?? EMPTY,
    handedness: profile.handedness ?? EMPTY,
    grip: profile.grip ?? EMPTY,
    about: profile.about,
  };
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.level === b.level &&
    a.style === b.style &&
    a.years === b.years &&
    a.handedness === b.handedness &&
    a.grip === b.grip &&
    a.about === b.about
  );
}

export function PlayerProfileEditor({
  initialProfile,
  initialUser,
}: {
  initialProfile: PlayerProfileResponse;
  initialUser: MeResponse;
}) {
  const t = useTranslations("playerProfile");
  const router = useRouter();
  const [user, setUser] = useState(initialUser);

  const [saved, setSaved] = useState<FormState>(toFormState(initialProfile));
  const [level, setLevel] = useState<PlayerLevel>(initialProfile.level);
  const [style, setStyle] = useState<string>(initialProfile.style ?? EMPTY);
  const [years, setYears] = useState(
    initialProfile.yearsOfExperience?.toString() ?? EMPTY,
  );
  const [handedness, setHandedness] = useState<string>(
    initialProfile.handedness ?? EMPTY,
  );
  const [grip, setGrip] = useState<string>(initialProfile.grip ?? EMPTY);
  const [about, setAbout] = useState(initialProfile.about);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const form: FormState = { level, style, years, handedness, grip, about };
  const dirty = !sameForm(form, saved);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    const response = await apiFetch("/players/me", {
      method: "PATCH",
      body: JSON.stringify({
        level,
        style: style === EMPTY ? null : style,
        yearsOfExperience: years === EMPTY ? null : Number(years),
        handedness: handedness === EMPTY ? null : handedness,
        grip: grip === EMPTY ? null : grip,
        about,
      }),
    });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    setSaved(toFormState((await response.json()) as PlayerProfileResponse));
    setStatus("saved");
  }

  return (
    <>
      <ProfileCard title={t("avatar.title")}>
        <AvatarUploader
          user={user}
          onUserChange={(next) => {
            setUser(next);
            router.refresh();
          }}
        />
      </ProfileCard>

      <ProfileCard title={t("details.title")}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="player-level">{t("details.level")}</Label>
              <select
                id="player-level"
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value as PlayerLevel)
                }
                className={SELECT_CLASS}
              >
                {Object.values(PlayerLevel).map((value) => (
                  <option key={value} value={value}>
                    {t(`details.levels.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="player-style">{t("details.style")}</Label>
              <select
                id="player-style"
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value={EMPTY}>{t("details.notSpecified")}</option>
                {Object.values(PlayingStyle).map((value) => (
                  <option key={value} value={value}>
                    {t(`details.styles.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="player-years">{t("details.years")}</Label>
              <Input
                id="player-years"
                type="number"
                min={0}
                max={100}
                placeholder={t("details.yearsPlaceholder")}
                value={years}
                onChange={(event) => setYears(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="player-handedness">
                {t("details.handedness")}
              </Label>
              <select
                id="player-handedness"
                value={handedness}
                onChange={(event) => setHandedness(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value={EMPTY}>{t("details.notSpecified")}</option>
                {Object.values(Handedness).map((value) => (
                  <option key={value} value={value}>
                    {t(`details.handednessOptions.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="player-grip">{t("details.grip")}</Label>
              <select
                id="player-grip"
                value={grip}
                onChange={(event) => setGrip(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value={EMPTY}>{t("details.notSpecified")}</option>
                {Object.values(Grip).map((value) => (
                  <option key={value} value={value}>
                    {t(`details.gripOptions.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Label htmlFor="player-about">{t("details.about")}</Label>
          <textarea
            id="player-about"
            rows={4}
            maxLength={PLAYER_ABOUT_MAX_LENGTH}
            placeholder={t("details.aboutPlaceholder")}
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            className="mb-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={status === "saving" || !dirty}>
              {status === "saving" ? t("details.saving") : t("details.save")}
            </Button>
            {status === "saved" && !dirty ? (
              <span className="text-[13px] text-text-secondary">
                {t("details.saved")}
              </span>
            ) : null}
            {status === "error" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("details.error")}
              </span>
            ) : null}
          </div>
        </form>
      </ProfileCard>

      <ProfileCard title={t("videos.title")}>
        <p className="text-sm text-text-secondary">📹 {t("videos.empty")}</p>
      </ProfileCard>

      <ProfileCard title={t("sessions.title")}>
        <p className="text-sm text-text-secondary">🗓️ {t("sessions.empty")}</p>
      </ProfileCard>
    </>
  );
}
