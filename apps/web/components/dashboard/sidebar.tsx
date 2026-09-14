"use client";

import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

export interface SidebarItem {
  key: string;
  emoji: string;
  label: string;
  /** Absent while the section's change hasn't landed yet. */
  href?: string;
  /**
   * Query-only item: links to the current page with these parameters set
   * (used for the settings dialog). Never highlighted as active.
   */
  query?: Record<string, string>;
}

const ITEM_CLASS =
  "mb-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm";

export function DashboardSidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="hidden border-r border-border bg-bg-secondary px-3 py-5 md:block">
      {items.map((item, index) => {
        const active = item.href
          ? pathname === item.href
          : index === 0 && pathname === "/dashboard";
        const stateClass = active
          ? "bg-black/5 font-medium text-text"
          : "text-text-secondary";
        if (item.query) {
          const query = {
            ...Object.fromEntries(searchParams.entries()),
            ...item.query,
          };
          return (
            <Link
              key={item.key}
              href={{ pathname, query }}
              className={`${ITEM_CLASS} text-text-secondary no-underline transition-colors hover:bg-black/5 hover:text-text`}
            >
              <span aria-hidden>{item.emoji}</span>
              {item.label}
            </Link>
          );
        }
        if (!item.href) {
          return (
            <div
              key={item.key}
              aria-disabled
              className={`${ITEM_CLASS} ${stateClass} opacity-60`}
            >
              <span aria-hidden>{item.emoji}</span>
              {item.label}
            </div>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${ITEM_CLASS} ${stateClass} no-underline transition-colors hover:bg-black/5 hover:text-text`}
          >
            <span aria-hidden>{item.emoji}</span>
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
