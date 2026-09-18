import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LEGAL_DOCUMENTS, type LegalDocument } from "@playwithpro/shared";

/** `apps/web/content/legal/<document>/<version>/<locale>.md`, resolved from the app root. */
export const LEGAL_CONTENT_ROOT = path.join(process.cwd(), "content", "legal");

export function legalContentPath(
  document: LegalDocument,
  version: string,
  locale: string,
): string {
  return path.join(LEGAL_CONTENT_ROOT, document, version, `${locale}.md`);
}

/** The document's Markdown, or null when this locale has no file (a CI failure elsewhere). */
export async function readLegalDocument(
  document: LegalDocument,
  version: string,
  locale: string,
): Promise<string | null> {
  if (!LEGAL_DOCUMENTS[document].versions.some((v) => v.version === version)) {
    return null;
  }
  try {
    return await readFile(legalContentPath(document, version, locale), "utf8");
  } catch {
    return null;
  }
}
