export enum Locale {
  En = "en",
  Fr = "fr",
  De = "de",
  Ru = "ru",
  Zh = "zh",
}

export const DEFAULT_LOCALE = Locale.En;

export const SUPPORTED_LOCALES = Object.values(Locale);
