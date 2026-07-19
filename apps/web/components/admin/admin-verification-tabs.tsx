"use client";

import type {
  AdminBookingItem,
  AdminSlotItem,
  AdminVerificationItem,
} from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BookingsList } from "./bookings-list";
import { SlotsManager } from "./slots-manager";
import { VerificationQueue } from "./verification-queue";

const TABS = ["queue", "slots", "bookings"] as const;
type Tab = (typeof TABS)[number];

export function AdminVerificationTabs({
  initialQueue,
  initialSlots,
  initialBookings,
}: {
  initialQueue: AdminVerificationItem[];
  initialSlots: AdminSlotItem[];
  initialBookings: AdminBookingItem[];
}) {
  const t = useTranslations("adminScheduling.tabs");
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <div>
      <div className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-t-lg px-3.5 py-2 text-sm transition-colors ${
              tab === key
                ? "border-b-2 border-text font-semibold text-text"
                : "text-text-secondary hover:text-text"
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "queue" ? (
          <VerificationQueue initialItems={initialQueue} />
        ) : null}
        {tab === "slots" ? <SlotsManager initialSlots={initialSlots} /> : null}
        {tab === "bookings" ? (
          <BookingsList initialBookings={initialBookings} />
        ) : null}
      </div>
    </div>
  );
}
