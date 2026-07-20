"use client";

import { SUPPORTED_LOCALES, ServiceType } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { Input } from "@/components/ui/input";

/** push = discrete choice (history entry); replace = debounced typing. */
export type NavigateMode = "push" | "replace";

export interface CatalogFilterValues {
  /** ISO 639-1 codes (any-of). */
  languages: string[];
  /** Service type values (any-of). */
  serviceTypes: string[];
  /** Major units, as typed by the visitor; empty = no cap. */
  maxPrice: string;
}

const EMPTY_FILTERS: CatalogFilterValues = {
  languages: [],
  serviceTypes: [],
  maxPrice: "",
};

const PRICE_DEBOUNCE_MS = 400;

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function buildQuery(values: CatalogFilterValues): string {
  const params = new URLSearchParams();
  if (values.languages.length) {
    params.set("languages", values.languages.join(","));
  }
  if (values.serviceTypes.length) {
    params.set("serviceTypes", values.serviceTypes.join(","));
  }
  if (values.maxPrice) params.set("maxPrice", values.maxPrice);
  return params.toString();
}

function CheckboxGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-[13px] font-medium text-text-secondary">
        {legend}
      </legend>
      <div className="space-y-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-text hover:bg-bg-hover"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Filters apply themselves: instantly for checkboxes, debounced for price. */
export function CatalogFilters({
  initial,
  onNavigate,
}: {
  initial: CatalogFilterValues;
  onNavigate: (query: string, mode: NavigateMode) => void;
}) {
  const t = useTranslations("catalog");
  const [values, setValues] = useState(initial);
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPriceTimer = () => {
    if (priceTimer.current) {
      clearTimeout(priceTimer.current);
      priceTimer.current = null;
    }
  };
  useEffect(() => cancelPriceTimer, []);

  function applyNow(next: CatalogFilterValues) {
    cancelPriceTimer();
    onNavigate(buildQuery(next), "push");
  }

  function update(patch: Partial<CatalogFilterValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    if ("maxPrice" in patch) {
      // Fire once the visitor stops typing, without stacking history entries.
      cancelPriceTimer();
      priceTimer.current = setTimeout(
        () => onNavigate(buildQuery(next), "replace"),
        PRICE_DEBOUNCE_MS,
      );
    } else {
      applyNow(next);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        applyNow(values);
      }}
    >
      <CheckboxGroup
        legend={t("filters.language")}
        options={SUPPORTED_LOCALES.map((locale) => ({
          value: locale,
          label: LOCALE_LABELS[locale],
        }))}
        selected={values.languages}
        onToggle={(value) =>
          update({ languages: toggle(values.languages, value) })
        }
      />

      <CheckboxGroup
        legend={t("filters.service")}
        options={Object.values(ServiceType).map((type) => ({
          value: type,
          label: t(`service.${type}`),
        }))}
        selected={values.serviceTypes}
        onToggle={(value) =>
          update({ serviceTypes: toggle(values.serviceTypes, value) })
        }
      />

      <div>
        <label className="mb-1 block text-[13px] font-medium text-text-secondary">
          {t("filters.maxPrice")}
        </label>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder={t("filters.maxPricePlaceholder")}
          value={values.maxPrice}
          onChange={(event) => update({ maxPrice: event.target.value })}
        />
      </div>

      <button
        type="button"
        className="text-[13px] text-text-secondary underline hover:text-text"
        onClick={() => {
          setValues(EMPTY_FILTERS);
          applyNow(EMPTY_FILTERS);
        }}
      >
        {t("filters.reset")}
      </button>
    </form>
  );
}
