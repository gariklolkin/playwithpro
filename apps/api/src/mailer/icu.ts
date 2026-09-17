/**
 * The ICU MessageFormat subset the email catalogs use, without an ESM-only
 * dependency: `{arg}`, `{arg, plural, =0 {…} one {…} few {…} many {…} other {…}}`
 * with `#`, and `{arg, select, key {…} other {…}}`, nested to any depth.
 * Plural categories come from `Intl.PluralRules`. Anything else is a
 * catalog error surfaced by the completeness test.
 */
export type IcuValue = string | number | Date | undefined | null;

export type IcuNode =
  | { type: 'text'; value: string }
  | { type: 'argument'; name: string }
  | { type: 'pound' }
  | {
      type: 'plural' | 'select';
      name: string;
      options: Record<string, IcuNode[]>;
    };

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): IcuNode[] {
    const nodes = this.parseUntil(null);
    if (this.pos < this.src.length) {
      throw new Error(`Unexpected "}" at ${this.pos}`);
    }
    return nodes;
  }

  /** Parses until the closing brace of the enclosing option (or the end). */
  private parseUntil(inPlural: 'plural' | 'select' | null): IcuNode[] {
    const nodes: IcuNode[] = [];
    let text = '';
    const flush = () => {
      if (text) nodes.push({ type: 'text', value: text });
      text = '';
    };
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '}') {
        if (inPlural === null) break;
        flush();
        return nodes;
      }
      if (ch === '#' && inPlural === 'plural') {
        flush();
        nodes.push({ type: 'pound' });
        this.pos += 1;
        continue;
      }
      if (ch === '{') {
        flush();
        nodes.push(this.parseArgument());
        continue;
      }
      text += ch;
      this.pos += 1;
    }
    flush();
    if (inPlural !== null) throw new Error('Unterminated option');
    return nodes;
  }

  private parseArgument(): IcuNode {
    this.pos += 1; // {
    const close = this.src.indexOf('}', this.pos);
    if (close === -1) throw new Error('Unterminated argument');
    const comma = this.src.indexOf(',', this.pos);
    if (comma === -1 || close < comma) {
      const name = this.src.slice(this.pos, close).trim();
      if (!name) throw new Error('Empty argument name');
      this.pos = close + 1;
      return { type: 'argument', name };
    }
    const name = this.src.slice(this.pos, comma).trim();
    this.pos = comma + 1;
    const nextComma = this.src.indexOf(',', this.pos);
    const typeEnd = nextComma === -1 || nextComma > close ? close : nextComma;
    const type = this.src.slice(this.pos, typeEnd).trim();
    if (type !== 'plural' && type !== 'select') {
      throw new Error(`Unsupported argument type "${type}" for {${name}}`);
    }
    this.pos = typeEnd + 1;
    const options: Record<string, IcuNode[]> = {};
    for (;;) {
      this.skipSpaces();
      if (this.src[this.pos] === '}') {
        this.pos += 1;
        break;
      }
      const brace = this.src.indexOf('{', this.pos);
      if (brace === -1) throw new Error(`Unterminated options of {${name}}`);
      const key = this.src.slice(this.pos, brace).trim();
      if (!key || key.includes('}')) {
        throw new Error(`Option without a selector in {${name}}`);
      }
      this.pos = brace + 1;
      options[key] = this.parseUntil(type);
      this.pos += 1; // closing brace of the option
    }
    if (!options.other) throw new Error(`{${name}} needs an "other" option`);
    return { type, name, options };
  }

  private skipSpaces(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) {
      this.pos += 1;
    }
  }
}

export function parseIcu(pattern: string): IcuNode[] {
  return new Parser(pattern).parse();
}

/** Every argument a pattern reads, nested options included, sorted. */
export function icuArguments(pattern: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: IcuNode[]) => {
    for (const node of nodes) {
      if (node.type === 'argument') names.add(node.name);
      if (node.type === 'plural' || node.type === 'select') {
        names.add(node.name);
        for (const option of Object.values(node.options)) walk(option);
      }
    }
  };
  walk(parseIcu(pattern));
  return [...names].sort();
}

export function formatIcu(
  pattern: string,
  locale: string,
  params: Record<string, IcuValue>,
): string {
  const rules = new Intl.PluralRules(locale);
  const render = (nodes: IcuNode[], pound: number | null): string =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'text':
            return node.value;
          case 'pound':
            return pound === null ? '#' : String(pound);
          case 'argument':
            return stringify(params[node.name]);
          case 'plural': {
            const value = Number(params[node.name] ?? 0);
            const option =
              node.options[`=${value}`] ??
              node.options[rules.select(value)] ??
              node.options.other;
            return render(option, value);
          }
          case 'select': {
            const key = stringify(params[node.name]);
            return render(node.options[key] ?? node.options.other, pound);
          }
        }
      })
      .join('');
  return render(parseIcu(pattern), null);
}

function stringify(value: IcuValue): string {
  if (value === undefined || value === null) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}
