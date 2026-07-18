"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VenueMap = dynamic(() => import("./venue-map"), { ssr: false });

export interface VenueValue {
  label: string;
  lat: number | null;
  lng: number | null;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * Venue picker for the in-person game service: address search (Nominatim /
 * OpenStreetMap) sets the label + coordinates; the pin stays draggable.
 */
export function VenuePicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: VenueValue;
  onChange: (value: VenueValue) => void;
}) {
  const t = useTranslations("proProfile.services");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(text: string) {
    onChange({ ...value, label: text });
    if (debounce.current) {
      clearTimeout(debounce.current);
    }
    if (text.trim().length < 3) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(text)}`,
        { headers: { Accept: "application/json" } },
      )
        .then((response) => (response.ok ? response.json() : []))
        .then((found: NominatimResult[]) => setResults(found))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
  }

  function pick(result: NominatimResult) {
    setResults([]);
    onChange({
      label: result.display_name,
      lat: Number(result.lat),
      lng: Number(result.lon),
    });
  }

  return (
    <div>
      <Label htmlFor={id}>{t("venue")}</Label>
      <div className="relative">
        <Input
          id={id}
          autoComplete="off"
          placeholder={t("venuePlaceholder")}
          value={value.label}
          onChange={(event) => search(event.target.value)}
        />
        {results.length > 0 ? (
          <ul className="absolute z-[1000] mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-bg py-1 shadow-card">
            {results.map((result) => (
              <li key={`${result.lat}:${result.lon}`}>
                <button
                  type="button"
                  onClick={() => pick(result)}
                  className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-hover hover:text-text"
                >
                  {result.display_name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] text-text-tertiary">
        {searching ? t("venueSearching") : t("venueHint")}
      </p>
      {value.lat !== null && value.lng !== null ? (
        <div className="mt-2">
          <VenueMap
            lat={value.lat}
            lng={value.lng}
            onMove={(lat, lng) => onChange({ ...value, lat, lng })}
          />
        </div>
      ) : null}
    </div>
  );
}
