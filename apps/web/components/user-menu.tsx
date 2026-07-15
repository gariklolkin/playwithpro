"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UserMenuLabels {
  dashboard: string;
  settings: string;
  logout: string;
}

export function UserMenu({
  displayName,
  labels,
}: {
  displayName: string;
  labels: UserMenuLabels;
}) {
  const router = useRouter();
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
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-bg-secondary text-sm font-semibold text-text"
      >
        {displayName.trim().charAt(0).toUpperCase() || "🏓"}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-10 w-44 rounded-lg bg-bg p-1.5 shadow-card">
          <div className="truncate px-2.5 py-1.5 text-[13px] font-medium text-text">
            {displayName}
          </div>
          <Link
            href="/dashboard"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {labels.dashboard}
          </Link>
          <Link
            href="/settings/account"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {labels.settings}
          </Link>
          <button onClick={() => void handleLogout()} className={itemClass}>
            {labels.logout}
          </button>
        </div>
      ) : null}
    </div>
  );
}
