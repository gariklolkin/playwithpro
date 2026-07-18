"use client";

import {
  ProProfileStatus,
  SUPPORTED_LOCALES,
  ServiceType,
  type ProProfileResponse,
  type ProServiceResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VenuePicker } from "./venue-picker";

const SERVICE_TYPES = [
  ServiceType.VideoAnalysis,
  ServiceType.Consultation,
  ServiceType.Game,
] as const;

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CNY", "RUB"];

const STATUS_STYLES: Record<ProProfileStatus, string> = {
  [ProProfileStatus.Draft]: "bg-bg-secondary text-text-secondary",
  [ProProfileStatus.PendingReview]: "bg-[#FDECC8] text-[#7A5A00]",
  [ProProfileStatus.Verified]: "bg-[#DBEDDB] text-[#1C6B3C]",
  [ProProfileStatus.Rejected]: "bg-[#FBE4E4] text-[#B33636]",
};

function Card({
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

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join("; ")
      : (body.message ?? "");
  } catch {
    return "";
  }
}

interface ServiceFormState {
  offered: boolean;
  price: string;
  currency: string;
  venueLabel: string;
  venueLat: number | null;
  venueLng: number | null;
  status: "idle" | "saving" | "saved" | "error";
  error: string;
}

function serviceFormFrom(
  service: ProServiceResponse | undefined,
): ServiceFormState {
  return {
    offered: Boolean(service),
    price: service ? (service.priceMinor / 100).toString() : "",
    currency: service?.currency ?? "EUR",
    venueLabel: service?.venueLabel ?? "",
    venueLat: service?.venueLat ?? null,
    venueLng: service?.venueLng ?? null,
    status: "idle",
    error: "",
  };
}

export function ProProfileEditor({
  initialProfile,
}: {
  initialProfile: ProProfileResponse;
}) {
  const t = useTranslations("proProfile");
  const [profile, setProfile] = useState(initialProfile);

  // About form
  const [bio, setBio] = useState(profile.bio);
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [aboutStatus, setAboutStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Services
  const [services, setServices] = useState<Record<string, ServiceFormState>>(
    () =>
      Object.fromEntries(
        SERVICE_TYPES.map((type) => [
          type,
          serviceFormFrom(profile.services.find((s) => s.type === type)),
        ]),
      ),
  );

  // Verification form
  const [credentials, setCredentials] = useState(
    profile.latestVerification?.credentials ?? "",
  );
  const [contactTelegram, setContactTelegram] = useState(
    profile.latestVerification?.contactTelegram ?? "",
  );
  const [contactPhone, setContactPhone] = useState(
    profile.latestVerification?.contactPhone ?? "",
  );
  const [verifyStatus, setVerifyStatus] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [verifyError, setVerifyError] = useState("");

  function patchService(type: string, patch: Partial<ServiceFormState>) {
    setServices((current) => ({
      ...current,
      [type]: { ...current[type], ...patch },
    }));
  }

  async function handleAboutSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAboutStatus("saving");
    const response = await apiFetch("/pros/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ bio, languages }),
    });
    if (!response.ok) {
      setAboutStatus("error");
      return;
    }
    setProfile((await response.json()) as ProProfileResponse);
    setAboutStatus("saved");
  }

  async function handleServiceSave(type: ServiceType) {
    const form = services[type];
    patchService(type, { status: "saving", error: "" });
    const priceMinor = Math.round(Number(form.price.replace(",", ".")) * 100);
    const response = await apiFetch(`/pros/me/services/${type}`, {
      method: "PUT",
      body: JSON.stringify({
        priceMinor,
        currency: form.currency,
        venueLabel: form.venueLabel,
        venueLat: form.venueLat ?? undefined,
        venueLng: form.venueLng ?? undefined,
        active: true,
      }),
    });
    if (!response.ok) {
      patchService(type, {
        status: "error",
        error: await errorMessage(response),
      });
      return;
    }
    setProfile((await response.json()) as ProProfileResponse);
    patchService(type, { status: "saved" });
  }

  async function handleServiceRemove(type: ServiceType) {
    const wasSaved = profile.services.some((s) => s.type === type);
    if (wasSaved) {
      const response = await apiFetch(`/pros/me/services/${type}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setProfile((await response.json()) as ProProfileResponse);
      }
    }
    patchService(type, { ...serviceFormFrom(undefined), offered: false });
  }

  async function handleVerifySubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!contactTelegram.trim() && !contactPhone.trim()) {
      setVerifyStatus("error");
      setVerifyError(t("verification.contactRequired"));
      return;
    }
    setVerifyStatus("submitting");
    setVerifyError("");
    const response = await apiFetch("/pros/me/verification", {
      method: "POST",
      body: JSON.stringify({ credentials, contactTelegram, contactPhone }),
    });
    if (!response.ok) {
      setVerifyStatus("error");
      setVerifyError(await errorMessage(response));
      return;
    }
    setProfile((await response.json()) as ProProfileResponse);
    setVerifyStatus("idle");
  }

  const canSubmitVerification =
    profile.status === ProProfileStatus.Draft ||
    profile.status === ProProfileStatus.Rejected;

  return (
    <>
      {/* Status banner */}
      <div
        className={`mt-6 rounded-card px-4 py-3 text-sm ${STATUS_STYLES[profile.status]}`}
      >
        {profile.status === ProProfileStatus.Rejected
          ? t("status.rejected", {
              note: profile.latestVerification?.adminNote ?? "",
            })
          : t(`status.${profile.status}`)}
      </div>

      <Card title={t("about.title")}>
        <form onSubmit={handleAboutSubmit} noValidate>
          <Label htmlFor="pro-bio">{t("about.text")}</Label>
          <textarea
            id="pro-bio"
            rows={5}
            placeholder={t("about.textPlaceholder")}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className="mb-1 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text"
          />
          <p className="mb-3 text-[12px] text-text-tertiary">
            {t("about.optionalHint")}
          </p>
          <div className="mb-3">
            <Label>{t("about.languages")}</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {SUPPORTED_LOCALES.map((code) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-text"
                >
                  <input
                    type="checkbox"
                    checked={languages.includes(code)}
                    onChange={(event) =>
                      setLanguages((current) =>
                        event.target.checked
                          ? [...current, code]
                          : current.filter((value) => value !== code),
                      )
                    }
                  />
                  {LOCALE_LABELS[code]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={aboutStatus === "saving"}>
              {aboutStatus === "saving" ? t("about.saving") : t("about.save")}
            </Button>
            {aboutStatus === "saved" ? (
              <span className="text-[13px] text-text-secondary">
                {t("about.saved")}
              </span>
            ) : null}
            {aboutStatus === "error" ? (
              <span className="text-[13px] text-[#E03E3E]">
                {t("about.error")}
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      <Card title={t("services.title")}>
        {SERVICE_TYPES.map((type) => {
          const form = services[type];
          return (
            <div
              key={type}
              className="mb-3 rounded-lg border border-border p-4 last:mb-0"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.offered}
                  onChange={(event) => {
                    if (event.target.checked) {
                      patchService(type, { offered: true });
                    } else {
                      void handleServiceRemove(type);
                    }
                  }}
                />
                <span className="font-medium text-text">
                  {t(`services.${type}`)}
                </span>
                <span className="text-[13px] text-text-tertiary">
                  {t(`services.${type}Description`)}
                </span>
              </label>
              {form.offered ? (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <Label htmlFor={`price-${type}`}>
                        {t("services.price")}
                      </Label>
                      <Input
                        id={`price-${type}`}
                        inputMode="decimal"
                        placeholder="40"
                        value={form.price}
                        onChange={(event) =>
                          patchService(type, { price: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`currency-${type}`}>
                        {t("services.currency")}
                      </Label>
                      <select
                        id={`currency-${type}`}
                        value={form.currency}
                        onChange={(event) =>
                          patchService(type, { currency: event.target.value })
                        }
                        className="w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text"
                      >
                        {CURRENCIES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {type === ServiceType.Game ? (
                    <div className="mt-3">
                      <VenuePicker
                        id={`venue-${type}`}
                        value={{
                          label: form.venueLabel,
                          lat: form.venueLat,
                          lng: form.venueLng,
                        }}
                        onChange={(venue) =>
                          patchService(type, {
                            venueLabel: venue.label,
                            venueLat: venue.lat,
                            venueLng: venue.lng,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3">
                    <Button
                      type="button"
                      size="sm"
                      disabled={form.status === "saving"}
                      onClick={() => void handleServiceSave(type)}
                    >
                      {form.status === "saving"
                        ? t("services.saving")
                        : t("services.save")}
                    </Button>
                    {form.status === "saved" ? (
                      <span className="text-[13px] text-text-secondary">
                        {t("services.saved")}
                      </span>
                    ) : null}
                    {form.status === "error" ? (
                      <span className="text-[13px] text-[#E03E3E]">
                        {form.error || t("services.error")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>

      <Card title={t("verification.title")}>
        {canSubmitVerification ? (
          <form onSubmit={handleVerifySubmit} noValidate>
            <Label htmlFor="pro-credentials">
              {t("verification.credentials")}
            </Label>
            <textarea
              id="pro-credentials"
              rows={3}
              required
              placeholder={t("verification.credentialsPlaceholder")}
              value={credentials}
              onChange={(event) => setCredentials(event.target.value)}
              className="mb-3 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text"
            />
            <div className="mb-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pro-contact-telegram">
                  {t("verification.contactTelegram")}
                </Label>
                <Input
                  id="pro-contact-telegram"
                  placeholder="@username"
                  value={contactTelegram}
                  onChange={(event) => setContactTelegram(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pro-contact-phone">
                  {t("verification.contactPhone")}
                </Label>
                <Input
                  id="pro-contact-phone"
                  type="tel"
                  placeholder="+49 151 1234567"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                />
              </div>
            </div>
            <p className="mb-3 text-[12px] text-text-tertiary">
              {t("verification.contactHint")}
            </p>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={verifyStatus === "submitting"}>
                {verifyStatus === "submitting"
                  ? t("verification.submitting")
                  : t("verification.submit")}
              </Button>
              {verifyStatus === "error" ? (
                <span className="text-[13px] text-[#E03E3E]">
                  {verifyError || t("verification.error")}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-text-secondary">
            {profile.status === ProProfileStatus.Verified
              ? t("verification.alreadyVerified")
              : t("verification.pendingInfo")}
          </p>
        )}
      </Card>
    </>
  );
}
