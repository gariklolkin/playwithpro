/**
 * The Markdown subset the legal documents use — headings, paragraphs, `-`
 * lists, `**bold**`, `[text](url)` and `{{token}}` placeholders. Small enough
 * to render without a dependency, and the completeness test rejects
 * anything outside it (unknown syntax would silently become prose).
 */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; items: Inline[][] };

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Replaces `{{token}}` placeholders; unknown tokens stay visible so they get noticed. */
export function fillTokens(
  text: string,
  facts: Record<string, string | number>,
): string {
  return text.replace(TOKEN, (match, name: string) =>
    name in facts ? String(facts[name]) : match,
  );
}

export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last)
      inlines.push({ kind: "text", text: text.slice(last, index) });
    if (match[1] !== undefined) {
      inlines.push({ kind: "bold", text: match[1] });
    } else {
      inlines.push({ kind: "link", text: match[2], href: match[3] });
    }
    last = index + match[0].length;
  }
  if (last < text.length)
    inlines.push({ kind: "text", text: text.slice(last) });
  return inlines;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({
        kind: "paragraph",
        inlines: parseInlines(paragraph.join(" ")),
      });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: "list", items: list });
      list = null;
    }
  };
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        inlines: parseInlines(heading[2]),
      });
      continue;
    }
    if (line.startsWith("- ")) {
      if (paragraph.length > 0) flush();
      list ??= [];
      list.push(parseInlines(line.slice(2)));
      continue;
    }
    if (list) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

/** Lines the subset cannot express: the completeness test names them. */
export function unsupportedLines(source: string): string[] {
  return source.split("\n").filter((line) => {
    const trimmed = line.trim();
    return (
      /^#{4,}\s/.test(trimmed) ||
      /^(\*|\+|\d+\.)\s/.test(trimmed) ||
      /^>/.test(trimmed) ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("|") ||
      /!\[/.test(trimmed) ||
      /<[a-z]+[\s>]/i.test(trimmed)
    );
  });
}
