"use client";

import {
  ACCOUNT_DELETION_CONFIRMATION_WORD,
  ACCOUNT_ERROR_DELETION_BLOCKED,
  ACCOUNT_ERROR_REAUTH_REQUIRED,
  Role,
  type DeletionBlocker,
  type DeletionStatusResponse,
  type MeResponse,
} from "@playwithpro/shared";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";

type Outcome = "idle" | "wrong" | "blocked" | "error";

/**
 * "Delete account": blockers first (with links), otherwise what goes, what
 * stays and the grace period, then the credential (password, or an emailed
 * code for Google-only accounts) and the typed confirmation word. On
 * success the page refreshes into the grace screen.
 */
export function DeleteAccountCard({ user }: { user: MeResponse }) {
  const t = useTranslations("account.delete");
  const tCatalog = useTranslations("catalog");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<DeletionStatusResponse | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");

  useEffect(() => {
    let active = true;
    void apiFetch("/users/me/deletion").then(async (response) => {
      if (active && response.ok) {
        setStatus((await response.json()) as DeletionStatusResponse);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (user.role === Role.Admin) {
    return <p className="text-sm text-text-secondary">{t("adminNote")}</p>;
  }
  if (!status) return null;
  if (status.scheduledFor) {
    return (
      <p className="text-sm text-text-secondary">
        {t("scheduled", {
          date: format.dateTime(new Date(status.scheduledFor), {
            dateStyle: "long",
          }),
        })}
      </p>
    );
  }

  const reauth = status.reauth;
  const credential = reauth === "password" ? password : code;
  const ready =
    credential.length > 0 &&
    word.trim().toUpperCase() === ACCOUNT_DELETION_CONFIRMATION_WORD;

  async function sendCode() {
    setCodeState("sending");
    const response = await apiFetch("/users/me/deletion/code", {
      method: "POST",
    });
    setCodeState(response.ok ? "sent" : "idle");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setOutcome("idle");
    const response = await apiFetch("/users/me/deletion", {
      method: "POST",
      body: JSON.stringify(
        reauth === "password" ? { password } : { code: code.trim() },
      ),
    });
    setBusy(false);
    if (response.ok) {
      router.refresh();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as {
      code?: string;
      blockers?: DeletionBlocker[];
    };
    if (body.code === ACCOUNT_ERROR_DELETION_BLOCKED && body.blockers) {
      setStatus({ ...status!, blockers: body.blockers });
      setOutcome("blocked");
    } else if (
      body.code === ACCOUNT_ERROR_REAUTH_REQUIRED ||
      response.status === 400
    ) {
      setOutcome("wrong");
    } else {
      setOutcome("error");
    }
  }

  if (status.blockers.length > 0) {
    return (
      <div data-testid="deletion-blockers">
        <h3 className="text-sm font-semibold text-text">
          {t("blockersTitle")}
        </h3>
        <p className="mt-1 text-sm text-text-secondary">{t("blockersIntro")}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {status.blockers.map((blocker) => (
            <li
              key={`${blocker.kind}:${blocker.sessionId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="text-text">
                {blocker.kind === "session"
                  ? t("blockerSession", {
                      service: tCatalog(`service.${blocker.serviceType}`),
                      date: format.dateTime(new Date(blocker.startsAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                      role: blocker.role,
                    })
                  : t("blockerPayment", {
                      amount: formatMoney(
                        blocker.amountMinor,
                        blocker.currency,
                        locale,
                      ),
                    })}
              </span>
              <Link
                href="/dashboard/sessions"
                className="text-[13px] text-accent"
              >
                {t("openSession")} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <p className="text-sm text-text-secondary">{t("intro")}</p>
      <h3 className="mt-4 text-sm font-semibold text-text">{t("goesTitle")}</h3>
      <p className="mt-1 text-sm text-text-secondary">{t("goes")}</p>
      <h3 className="mt-3 text-sm font-semibold text-text">
        {t("staysTitle")}
      </h3>
      <p className="mt-1 text-sm text-text-secondary">{t("stays")}</p>
      <p className="mt-3 text-sm text-text-secondary">
        {t("grace", { days: status.graceDays })}
      </p>
      {user.role === Role.Professional ? (
        <p className="mt-2 text-sm text-text-secondary">{t("coachNote")}</p>
      ) : null}

      <div className="mt-5">
        {reauth === "password" ? (
          <>
            <Label htmlFor="delete-password">{t("password")}</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mb-3"
            />
          </>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={codeState === "sending"}
                onClick={() => void sendCode()}
              >
                {codeState === "sending" ? t("sendingCode") : t("sendCode")}
              </Button>
              {codeState === "sent" ? (
                <span className="text-[13px] text-text-secondary">
                  {t("codeSent")}
                </span>
              ) : null}
            </div>
            <Label htmlFor="delete-code">{t("code")}</Label>
            <Input
              id="delete-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mb-3"
            />
          </>
        )}
        <Label htmlFor="delete-confirm">
          {t("confirmLabel", { word: ACCOUNT_DELETION_CONFIRMATION_WORD })}
        </Label>
        <Input
          id="delete-confirm"
          autoComplete="off"
          value={word}
          onChange={(event) => setWord(event.target.value)}
          className="mb-3"
        />
        <Button
          type="submit"
          disabled={!ready || busy}
          className="bg-[#C4554D] hover:bg-[#A8433C]"
        >
          {busy ? t("submitting") : t("submit")}
        </Button>
        {outcome !== "idle" ? (
          <p className="mt-2 text-[13px] text-[#C4554D]">
            {outcome === "wrong"
              ? t("wrongCredential")
              : outcome === "blocked"
                ? t("blocked")
                : t("error")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
