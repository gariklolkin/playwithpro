import type { ConfigService } from '@nestjs/config';
import { icuArguments, parseIcu } from './icu';
import {
  EMAIL_CATALOGS,
  EmailRenderer,
  flattenCatalog,
  formatWhen,
  localizedPath,
  toHtml,
} from './email-renderer';

const config = {
  get: (name: string) => ({ WEB_APP_URL: 'https://play-with.pro' })[name],
} as unknown as ConfigService;

describe('email catalogs', () => {
  const en = flattenCatalog(EMAIL_CATALOGS.en);

  it.each(['fr', 'de', 'ru', 'zh'])(
    '%s has the same keys and ICU arguments as en',
    (locale) => {
      const other = flattenCatalog(EMAIL_CATALOGS[locale]);
      expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
      const drift = [...en.entries()]
        .filter(
          ([key, pattern]) =>
            JSON.stringify(icuArguments(other.get(key) ?? '')) !==
            JSON.stringify(icuArguments(pattern)),
        )
        .map(([key]) => key);
      expect(drift).toEqual([]);
    },
  );

  it('parses every message in every locale', () => {
    const broken: string[] = [];
    for (const [locale, catalog] of Object.entries(EMAIL_CATALOGS)) {
      for (const [key, pattern] of flattenCatalog(catalog)) {
        try {
          parseIcu(pattern);
        } catch {
          broken.push(`${locale}: ${key}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('EmailRenderer', () => {
  const renderer = new EmailRenderer(config);

  it('renders subject and text in the recipient locale with plurals', () => {
    const mail = renderer.render('ru', 'session.reminder', {
      name: 'Анна',
      service: 'консультация',
      counterpart: 'Иван',
      when: 'завтра',
      where: 'x',
      clipsHint: '',
      sessionsLine: 'y',
      hours: 24,
    });
    expect(mail.subject).toBe(
      'Напоминание: сессия «консультация» через 24 часа',
    );
    expect(mail.text).toContain('Здравствуйте, Анна!');
    expect(mail.text).toContain('— PlayWithPro');
    expect(mail.html).toContain('<p style=');
  });

  it('falls back to English for an unknown locale and adds the unsubscribe line', () => {
    const mail = renderer.render(
      'xx',
      'review.received',
      {
        name: 'Li',
        player: 'Anna',
        rating: 4,
        service: 'game',
        date: 'today',
        url: 'u',
      },
      { unsubscribeUrl: 'https://play-with.pro/unsubscribe?token=t' },
    );
    expect(mail.subject).toBe('New 4-star review from Anna');
    expect(mail.text).toContain(
      'Turn it off with one click: https://play-with.pro/unsubscribe?token=t',
    );
    expect(mail.html).toContain(
      '<a href="https://play-with.pro/unsubscribe?token=t"',
    );
  });

  it('builds locale-prefixed links (default locale unprefixed)', () => {
    expect(
      localizedPath('https://play-with.pro', 'en', '/dashboard/sessions'),
    ).toBe('https://play-with.pro/dashboard/sessions');
    expect(renderer.link('de', '/privacy')).toBe(
      'https://play-with.pro/de/privacy',
    );
  });

  it('formats times in the recipient timezone with the zone shown', () => {
    const when = formatWhen(
      new Date('2026-09-20T14:00:00Z'),
      'de',
      'Europe/Berlin',
    );
    expect(when).toContain('16:00');
    expect(when).toContain('(Europe/Berlin)');
  });

  it('escapes HTML and keeps the text as the source', () => {
    const html = toHtml('Hi <b>,\n\nsee https://x.test/a?b=1.', 'T & S');
    expect(html).toContain('Hi &lt;b&gt;,');
    expect(html).toContain('<a href="https://x.test/a?b=1"');
    expect(html).toContain('<title>T &amp; S</title>');
  });
});
