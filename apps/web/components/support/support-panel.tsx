"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useObservability } from "@/lib/observability/context";
import {
  fetchSupportMessages,
  isSupportAvailable,
  markSupportRead,
  sendSupportMessage,
  SUPPORT_POLL_MS,
  verifySupportIdentity,
  type SupportContext,
  type SupportMessage,
} from "@/lib/observability/support";

export const SUPPORT_EMAIL = "support@play-with.pro";
/** How long to wait for the vendor bundle before offering the email fallback. */
const AVAILABILITY_WAIT_MS = 6_000;

type Availability = "checking" | "ready" | "unavailable";

/**
 * In-app support drawer: our UI and strings over the vendor's conversations
 * API. Polls for replies only while open and visible. Signed-in users get
 * a server-verified identity; anonymous visitors provide an email first.
 * Without consent (no vendor client) it asks for consent or offers email.
 */
export function SupportPanel({
  context,
  onClose,
}: {
  context: SupportContext;
  onClose: () => void;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const { consent, grant, user } = useObservability();
  const [availability, setAvailability] = useState<Availability>("checking");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasTicket, setHasTicket] = useState(false);
  const identityVerified = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const granted = consent === "granted";

  // Wait for the vendor extension (loaded after consent) before enabling
  // the composer; give up after a while and offer the email channel.
  useEffect(() => {
    if (!granted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const check = () => {
      if (cancelled) return;
      if (isSupportAvailable()) {
        setAvailability("ready");
        return;
      }
      if (Date.now() - startedAt > AVAILABILITY_WAIT_MS) {
        setAvailability("unavailable");
        return;
      }
      timer = setTimeout(check, 500);
    };
    // Deferred: the extension loads asynchronously after the client starts.
    timer = setTimeout(check, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [granted]);

  useEffect(() => {
    if (availability !== "ready" || !user || identityVerified.current) return;
    identityVerified.current = true;
    void verifySupportIdentity(user.email);
  }, [availability, user]);

  const refresh = useCallback(async () => {
    const next = await fetchSupportMessages();
    if (next === null) return;
    setHasTicket(true);
    setMessages(next);
    void markSupportRead();
  }, []);

  // Poll only while the panel is open and the tab is visible.
  useEffect(() => {
    if (availability !== "ready") return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, SUPPORT_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [availability, refresh]);

  useEffect(() => {
    closeButton.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const body = draft.trim();
    if (body === "" || sending) return;
    if (!user && !hasTicket && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFailed(true);
      return;
    }
    setSending(true);
    setFailed(false);
    try {
      const ticketId = await sendSupportMessage(body, {
        context,
        email: user ? undefined : email.trim(),
        name: user?.displayName,
      });
      if (!ticketId) {
        setFailed(true);
        return;
      }
      setDraft("");
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  const emailLink = (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent">
      {SUPPORT_EMAIL}
    </a>
  );

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="support-panel-title"
      className="fixed bottom-0 right-0 z-50 flex h-[min(560px,100dvh)] w-full flex-col rounded-t-card bg-bg shadow-card sm:bottom-4 sm:right-4 sm:w-[380px] sm:rounded-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex-1">
          <h2
            id="support-panel-title"
            className="text-[15px] font-semibold text-text"
          >
            💬 {t("title")}
          </h2>
          <p className="text-[12px] text-text-tertiary">{t("intro")}</p>
        </div>
        <button
          ref={closeButton}
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="cursor-pointer rounded-md px-2 py-1 text-text-secondary hover:bg-bg-hover"
        >
          ✕
        </button>
      </div>

      {!granted ? (
        <div className="flex flex-1 flex-col gap-3 p-4 text-sm text-text-secondary">
          <p>{t("consentNeeded")}</p>
          <Button size="sm" onClick={grant}>
            {t("consentAccept")}
          </Button>
          <p>{t.rich("emailFallback", { link: () => emailLink })}</p>
        </div>
      ) : availability === "unavailable" ? (
        <div className="flex flex-1 flex-col gap-3 p-4 text-sm text-text-secondary">
          <p>{t("unavailable")}</p>
          <p>{t.rich("emailFallback", { link: () => emailLink })}</p>
        </div>
      ) : (
        <>
          <div
            role="log"
            aria-live="polite"
            className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
          >
            {availability === "checking" ? (
              <p className="text-[13px] text-text-tertiary">{t("loading")}</p>
            ) : messages.length === 0 ? (
              <p className="text-[13px] text-text-tertiary">{t("empty")}</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.author === "customer"
                      ? "self-end rounded-lg bg-[#EAF2FD] px-3 py-2 text-sm text-text"
                      : "self-start rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text"
                  }
                >
                  <div className="text-[11px] text-text-tertiary">
                    {message.author === "customer"
                      ? t("you")
                      : (message.authorName ?? t("team"))}{" "}
                    ·{" "}
                    {new Date(message.createdAt).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="whitespace-pre-wrap" dir="auto">
                    {message.body}
                  </div>
                </div>
              ))
            )}
          </div>
          <form
            className="border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {!user && !hasTicket ? (
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPlaceholder")}
                aria-label={t("emailLabel")}
                className="mb-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none"
              />
            ) : null}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              rows={3}
              maxLength={2000}
              disabled={availability !== "ready"}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:border-border-strong focus:outline-none disabled:opacity-60"
            />
            {failed ? (
              <p className="mt-1 text-[13px] text-[#C4554D]">{t("error")}</p>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-text-tertiary">
                {t.rich("emailFallback", { link: () => emailLink })}
              </span>
              <Button
                size="sm"
                type="submit"
                disabled={
                  availability !== "ready" || sending || draft.trim() === ""
                }
              >
                {sending ? t("sending") : t("send")}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
