"use client";

import {
  LEGAL_ERROR_REACCEPTANCE_REQUIRED,
  type LegalStatusItem,
  type LegalStatusResponse,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { isRoomPath } from "./site-footer";

const DISMISSED_KEY = "legal-notice-dismissed";

/** Where the gate never blocks: the documents themselves, and the room. */
function isExempt(pathname: string): boolean {
  return /^\/[a-z]{2}\/legal(\/|$)/.test(pathname) || isRoomPath(pathname);
}

/** Dismissed notice versions live in localStorage; read hydration-safely. */
function subscribeDismissed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/**
 * The re-acceptance interstitial for a signed-in user whose acceptance of a
 * document went stale after a material change (or who never accepted one),
 * and the dismissible banner for a minor update. Renders nothing for
 * visitors, on legal pages and in the room. Exported error code reused by
 * callers that hit the API gate directly.
 */
export function LegalGate({
  initialStatus,
  locale,
}: {
  initialStatus: LegalStatusResponse | null;
  locale: string;
}) {
  const t = useTranslations("legal.gate");
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dismissedRaw = useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    () => "[]",
  );
  const [dismissedNow, setDismissedNow] = useState<string[]>([]);
  const dismissed = new Set<string>([
    ...(JSON.parse(dismissedRaw) as string[]),
    ...dismissedNow,
  ]);

  const accept = useCallback(
    async (items: LegalStatusItem[]) => {
      setBusy(true);
      setFailed(false);
      const response = await apiFetch("/legal/accept", {
        method: "POST",
        headers: { "x-locale": locale },
        body: JSON.stringify({
          accepted: items.map(({ document, version }) => ({
            document,
            version,
          })),
        }),
      });
      setBusy(false);
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setStatus((await response.json()) as LegalStatusResponse);
      router.refresh();
    },
    [locale, router],
  );

  if (!status || isExempt(pathname)) return null;

  if (status.stale.length > 0) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-gate-title"
        data-testid="legal-interstitial"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      >
        <div className="w-full max-w-[520px] rounded-card bg-bg p-6 shadow-card">
          <h2 id="legal-gate-title" className="text-[20px] font-bold text-text">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">{t("intro")}</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {status.stale.map((item) => (
              <li key={item.document}>
                <Link
                  href={`/legal/${item.document}/${item.version}`}
                  className="text-accent"
                  target="_blank"
                >
                  {t(`documents.${item.document}`)}
                </Link>{" "}
                <span className="text-text-tertiary">
                  {t("version", { version: item.version })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-text-tertiary">{t("paused")}</p>
          {failed ? (
            <p className="mt-2 text-[13px] text-[#C4554D]">{t("error")}</p>
          ) : null}
          <Button
            size="full"
            className="mt-4"
            disabled={busy}
            onClick={() => void accept(status.stale)}
          >
            {t("accept")}
          </Button>
        </div>
      </div>
    );
  }

  const notices = status.notices.filter(
    (item) => !dismissed.has(`${item.document}:${item.version}`),
  );
  if (notices.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="legal-notice"
      className="border-b border-[#EAD8A3] bg-[#FDF7E7] px-5 py-2 text-[13px] text-[#8A6C1B]"
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {t("noticeIntro")}{" "}
          {notices.map((item, index) => (
            <span key={item.document}>
              {index > 0 ? ", " : ""}
              <Link href={`/legal/${item.document}`} className="underline">
                {t(`documents.${item.document}`)}
              </Link>
            </span>
          ))}
        </span>
        <button
          type="button"
          className="cursor-pointer underline-offset-2 hover:underline"
          onClick={() => {
            const next = [
              ...dismissed,
              ...notices.map((item) => `${item.document}:${item.version}`),
            ];
            setDismissedNow(next);
            try {
              localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
            } catch {
              // Private mode: the banner simply returns next time.
            }
          }}
        >
          {t("dismiss")}
        </button>
      </div>
    </div>
  );
}

export { LEGAL_ERROR_REACCEPTANCE_REQUIRED };
