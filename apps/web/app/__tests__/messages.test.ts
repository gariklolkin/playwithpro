import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import ru from "../../messages/ru.json";
import zh from "../../messages/zh.json";

const CATALOGS: Record<string, Record<string, unknown>> = { de, fr, ru, zh };

function flatten(value: unknown, prefix = ""): Map<string, string> {
  if (typeof value !== "object" || value === null) {
    return new Map([[prefix, String(value)]]);
  }
  const entries = Object.entries(value).flatMap(([key, child]) => [
    ...flatten(child, prefix ? `${prefix}.${key}` : key),
  ]);
  return new Map(entries);
}

describe("message catalogs", () => {
  const enFlat = flatten(en);
  const enKeys = [...enFlat.keys()].sort();

  it.each(Object.keys(CATALOGS))("%s matches the en key set", (locale) => {
    expect([...flatten(CATALOGS[locale]).keys()].sort()).toEqual(enKeys);
  });

  it.each(Object.keys(CATALOGS))(
    "%s keeps ICU placeholders and rich-text tags",
    (locale) => {
      const localizedFlat = flatten(CATALOGS[locale]);
      for (const [key, enValue] of enFlat) {
        const tokens = enValue.match(/\{\w+\}|<\/?\w+>/g) ?? [];
        for (const token of tokens) {
          expect(
            localizedFlat.get(key),
            `${locale}: ${key} is missing ${token}`,
          ).toContain(token);
        }
      }
    },
  );
});
