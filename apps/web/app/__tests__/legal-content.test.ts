import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_KEYS,
  LegalDocument,
  SUPPORTED_LOCALES,
  currentLegalVersion,
  latestMaterialVersion,
} from "@playwithpro/shared";
import { describe, expect, it } from "vitest";
import {
  fillTokens,
  parseMarkdown,
  unsupportedLines,
} from "@/lib/legal/markdown";

const ROOT = path.join(process.cwd(), "content", "legal");

/** The CI check: every registered version exists in every locale, in the supported subset. */
describe("legal content registry", () => {
  for (const document of LEGAL_DOCUMENT_KEYS) {
    for (const { version } of LEGAL_DOCUMENTS[document].versions) {
      for (const locale of SUPPORTED_LOCALES) {
        it(`${document} ${version} has a ${locale} file within the Markdown subset`, () => {
          const file = path.join(ROOT, document, version, `${locale}.md`);
          expect(
            existsSync(file),
            `missing ${document}/${version}/${locale}.md`,
          ).toBe(true);
          const source = readFileSync(file, "utf8");
          expect(unsupportedLines(source)).toEqual([]);
          const blocks = parseMarkdown(source);
          expect(blocks[0]).toMatchObject({ kind: "heading", level: 1 });
        });
      }
    }
  }

  it("orders versions chronologically and knows the current one", () => {
    for (const document of LEGAL_DOCUMENT_KEYS) {
      const versions = LEGAL_DOCUMENTS[document].versions.map((v) => v.version);
      expect([...versions].sort()).toEqual(versions);
      expect(currentLegalVersion(document).version).toBe(versions.at(-1));
    }
    expect(latestMaterialVersion(LegalDocument.Terms)?.version).toBe(
      "2026-09-18",
    );
    expect(latestMaterialVersion(LegalDocument.Imprint)).toBeNull();
  });

  it("never hard-codes a policy number: the numbers are tokens", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const policy = readFileSync(
        path.join(ROOT, "booking-policy", "2026-09-18", `${locale}.md`),
        "utf8",
      );
      expect(policy).toContain("{{cancellationFreeHours}}");
      expect(policy).toContain("{{cancellationLateRefundPercent}}");
      expect(policy).not.toMatch(/\b50\s?%/);
      const agreement = readFileSync(
        path.join(ROOT, "coach-agreement", "2026-09-18", `${locale}.md`),
        "utf8",
      );
      expect(agreement).toContain("{{feePercent}}");
    }
  });
});

describe("markdown subset", () => {
  it("parses headings, paragraphs, lists, bold and links", () => {
    const blocks = parseMarkdown(
      "# Title\n\n## Section\nOne **strong** line\ncontinues.\n\n- first [link](/legal/terms)\n- second\n\nAfter.",
    );
    expect(blocks).toEqual([
      { kind: "heading", level: 1, inlines: [{ kind: "text", text: "Title" }] },
      {
        kind: "heading",
        level: 2,
        inlines: [{ kind: "text", text: "Section" }],
      },
      {
        kind: "paragraph",
        inlines: [
          { kind: "text", text: "One " },
          { kind: "bold", text: "strong" },
          { kind: "text", text: " line continues." },
        ],
      },
      {
        kind: "list",
        items: [
          [
            { kind: "text", text: "first " },
            { kind: "link", text: "link", href: "/legal/terms" },
          ],
          [{ kind: "text", text: "second" }],
        ],
      },
      { kind: "paragraph", inlines: [{ kind: "text", text: "After." }] },
    ]);
  });

  it("fills known tokens and leaves unknown ones visible", () => {
    expect(
      fillTokens("Fee {{feePercent}}% and {{unknown}}", { feePercent: 10 }),
    ).toBe("Fee 10% and {{unknown}}");
  });

  it("names lines outside the subset", () => {
    expect(
      unsupportedLines("#### deep\n* star\n> quote\n| table |\n![img](x)"),
    ).toHaveLength(5);
  });
});
