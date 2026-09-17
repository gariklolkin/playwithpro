import { formatIcu, icuArguments, parseIcu } from './icu';

describe('icu', () => {
  it('substitutes arguments and leaves unknown ones empty', () => {
    expect(formatIcu('Hi {name}, {x}!', 'en', { name: 'Anna' })).toBe(
      'Hi Anna, !',
    );
  });

  it('selects plural categories per locale with exact matches first', () => {
    const en = '{count, plural, =0 {none} one {# clip} other {# clips}}';
    expect(formatIcu(en, 'en', { count: 0 })).toBe('none');
    expect(formatIcu(en, 'en', { count: 1 })).toBe('1 clip');
    expect(formatIcu(en, 'en', { count: 3 })).toBe('3 clips');
    const ru =
      '{n, plural, one {# час} few {# часа} many {# часов} other {# часа}}';
    expect(formatIcu(ru, 'ru', { n: 1 })).toBe('1 час');
    expect(formatIcu(ru, 'ru', { n: 3 })).toBe('3 часа');
    expect(formatIcu(ru, 'ru', { n: 24 })).toBe('24 часа');
    expect(formatIcu(ru, 'ru', { n: 5 })).toBe('5 часов');
  });

  it('selects by key with nested arguments and falls back to other', () => {
    const p =
      '{by, select, player {You cancelled} other {{coach} cancelled}} it';
    expect(formatIcu(p, 'en', { by: 'player', coach: 'Li' })).toBe(
      'You cancelled it',
    );
    expect(formatIcu(p, 'en', { by: 'coach', coach: 'Li' })).toBe(
      'Li cancelled it',
    );
  });

  it('lists every argument, nested included', () => {
    expect(
      icuArguments(
        '{by, select, a {{coach}} other {x}} {n, plural, other {# {unit}}}',
      ),
    ).toEqual(['by', 'coach', 'n', 'unit']);
  });

  it('rejects unsupported or malformed patterns', () => {
    expect(() => parseIcu('{d, date}')).toThrow(/Unsupported/);
    expect(() => parseIcu('{n, plural, one {x}}')).toThrow(/other/);
    expect(() => parseIcu('{a')).toThrow();
  });
});
