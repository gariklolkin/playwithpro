import { DEFAULT_LOCALE, Locale } from '@playwithpro/shared';

const LOCALES = Object.values(Locale) as string[];

/**
 * The site locale a request came from — an explicit body/header value, never
 * `Accept-Language` guesswork — so the evidence says which text was shown.
 */
export function requestLocale(value: string | undefined | null): string {
  return value && LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}
