"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { feedbackUrl } from "@/lib/feedback-url";
import { resetIdentity } from "@/lib/observability/client";
import { useSupport } from "@/lib/observability/context";
import { useSettingsHref } from "@/lib/use-settings-href";
import { UserAvatar } from "@/components/ui/user-avatar";

interface UserMenuLabels {
  settings: string;
  privacy: string;
  support: string;
  suggestIdea: string;
  logout: string;
}

export function UserMenu({
  displayName,
  avatarUrl,
  labels,
}: {
  displayName: string;
  avatarUrl: string | null;
  labels: UserMenuLabels;
}) {
  const router = useRouter();
  const settingsHref = useSettingsHref("profile");
  const support = useSupport();
  // Feedback board (change 25): external origin, new tab, hidden when unset.
  const ideaHref = feedbackUrl("user-menu");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" });
    // The next visitor on this device starts as a fresh anonymous person.
    resetIdentity();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const itemClass =
    "block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-text-secondary no-underline transition-colors hover:bg-bg-hover hover:text-text";

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label={displayName}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center justify-center rounded-full"
      >
        <UserAvatar displayName={displayName} avatarUrl={avatarUrl} />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-10 w-44 rounded-lg bg-bg p-1.5 shadow-card">
          <div className="truncate px-2.5 py-1.5 text-[13px] font-medium text-text">
            {displayName}
          </div>
          {/* Account-only menu: the logo is the way into the dashboard;
              settings open as a dialog over the current page. */}
          <Link
            href={settingsHref}
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {labels.settings}
          </Link>
          <Link
            href="/privacy"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {labels.privacy}
          </Link>
          {support.available ? (
            <button
              className={itemClass}
              onClick={() => {
                setOpen(false);
                support.open({ kind: "menu" });
              }}
            >
              {labels.support}
            </button>
          ) : null}
          {ideaHref ? (
            <a
              href={ideaHref}
              target="_blank"
              rel="noopener"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {labels.suggestIdea} ↗
            </a>
          ) : null}
          <button onClick={() => void handleLogout()} className={itemClass}>
            {labels.logout}
          </button>
        </div>
      ) : null}
    </div>
  );
}
