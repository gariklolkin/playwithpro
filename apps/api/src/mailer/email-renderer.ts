import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@playwithpro/shared';
import { formatIcu } from './icu';
import de from './messages/de.json';
import en from './messages/en.json';
import fr from './messages/fr.json';
import ru from './messages/ru.json';
import zh from './messages/zh.json';

export type EmailParams = Record<string, string | number | Date | undefined>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Catalog = Record<string, unknown>;

export const EMAIL_CATALOGS: Record<string, Catalog> = { en, fr, de, ru, zh };

/** Flattens a nested catalog into `a.b.c` → message. */
export function flattenCatalog(
  value: unknown,
  prefix = '',
): Map<string, string> {
  if (typeof value !== 'object' || value === null) {
    return new Map([[prefix, String(value)]]);
  }
  const out = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    for (const [k, v] of flattenCatalog(
      child,
      prefix ? `${prefix}.${key}` : key,
    )) {
      out.set(k, v);
    }
  }
  return out;
}

const FLAT: Record<string, Map<string, string>> = Object.fromEntries(
  Object.entries(EMAIL_CATALOGS).map(([locale, catalog]) => [
    locale,
    flattenCatalog(catalog),
  ]),
);

/** Locale-prefixed web URL (the default locale stays unprefixed, per routing). */
export function localizedPath(
  webAppUrl: string,
  locale: string,
  path: string,
): string {
  const prefix = locale === (DEFAULT_LOCALE as string) ? '' : `/${locale}`;
  return `${webAppUrl}${prefix}${path}`;
}

/** "Wednesday, 16 September 2026 at 18:00 (Europe/Berlin)" in the recipient's locale and zone. */
export function formatWhen(
  date: Date,
  locale: string,
  timezone: string,
): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
  return `${formatted} (${timezone})`;
}

export function formatDateOnly(
  date: Date,
  locale: string,
  timezone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: timezone,
  }).format(date);
}

export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    minor / 100,
  );
}

/**
 * Renders every email the API sends from the ICU catalogs, in the
 * recipient's locale. Text is the source; the HTML version is the same
 * text in a single-column template with the links made clickable.
 */
@Injectable()
export class EmailRenderer {
  private readonly webAppUrl: string;

  private readonly operatorName: string;

  constructor(config: ConfigService) {
    this.webAppUrl =
      config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
    this.operatorName = config.get<string>('OPERATOR_NAME') ?? 'PlayWithPro';
  }

  /** Resolves an unknown or unsupported locale to the default. */
  resolveLocale(locale: string | null | undefined): string {
    return locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)
      ? locale
      : DEFAULT_LOCALE;
  }

  /** A single catalog message, ICU-formatted. Falls back to English. */
  message(locale: string, key: string, params: EmailParams = {}): string {
    const resolved = this.resolveLocale(locale);
    const pattern = FLAT[resolved].get(key) ?? FLAT[DEFAULT_LOCALE].get(key);
    if (pattern === undefined) {
      throw new Error(`Missing email message: ${key}`);
    }
    return formatIcu(pattern, resolved, params);
  }

  link(locale: string, path: string): string {
    return localizedPath(this.webAppUrl, this.resolveLocale(locale), path);
  }

  /**
   * `<key>.subject` and `<key>.text` from the catalog, wrapped with the
   * greeting and signature; `unsubscribeUrl` adds the footer line for
   * optional emails.
   */
  render(
    locale: string,
    key: string,
    params: EmailParams,
    options: { unsubscribeUrl?: string } = {},
  ): RenderedEmail {
    const resolved = this.resolveLocale(locale);
    const subject = this.message(resolved, `${key}.subject`, params);
    const body = this.message(resolved, `${key}.text`, params);
    const lines = [
      body.trimEnd(),
      '',
      this.message(resolved, 'common.signature'),
    ];
    if (options.unsubscribeUrl) {
      lines.push(
        '',
        this.message(resolved, 'common.unsubscribe', {
          url: options.unsubscribeUrl,
        }),
      );
    }
    // Every email ends with the operator and the legal links.
    lines.push(
      '',
      this.message(resolved, 'common.legalFooter', {
        operator: this.operatorName,
        imprintUrl: this.link(resolved, '/legal/imprint'),
        privacyUrl: this.link(resolved, '/legal/privacy'),
      }),
    );
    const text = lines.join('\n');
    return { subject, text, html: toHtml(text, subject) };
  }
}

/** Plain text → minimal HTML: escaped, paragraphs on blank lines, links clickable. */
export function toHtml(text: string, title: string): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const linkify = (value: string) =>
    value.replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
      (url) => `<a href="${url}" style="color:#2e6be6">${url}</a>`,
    );
  const paragraphs = text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;line-height:1.5">${linkify(escape(block)).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
  return [
    '<!doctype html>',
    `<html><head><meta charset="utf-8"><title>${escape(title)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:15px;color:#37352f">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">',
    paragraphs,
    '</div></body></html>',
  ].join('');
}
