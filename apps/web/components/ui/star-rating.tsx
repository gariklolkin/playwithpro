"use client";

import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from "@playwithpro/shared";
import { useState } from "react";

const STARS = Array.from(
  { length: REVIEW_RATING_MAX },
  (_, index) => index + REVIEW_RATING_MIN,
);

/** Read-only star row; `value` is a 1–5 rating (fractions floor per star). */
export function StarRating({
  value,
  size = "sm",
}: {
  value: number;
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={`select-none leading-none ${size === "lg" ? "text-xl" : "text-[15px]"}`}
    >
      {STARS.map((star) => (
        <span
          key={star}
          className={star <= value ? "text-[#D9A514]" : "text-border-strong"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

/** Accessible star picker: a radio group of five stars. */
export function StarRatingInput({
  value,
  onChange,
  disabled,
  groupLabel,
  starLabel,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
  groupLabel: string;
  /** Localized label of one star option, e.g. "3 of 5". */
  starLabel: (star: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;
  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className="flex gap-0.5"
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={starLabel(star)}
          disabled={disabled}
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(star)}
          className={`cursor-pointer text-2xl leading-none transition-colors disabled:cursor-not-allowed ${
            star <= shown ? "text-[#D9A514]" : "text-border-strong"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
