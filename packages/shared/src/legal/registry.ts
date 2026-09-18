import { Locale } from "../enums/locale";

/** The platform's legal documents. Guidelines are a section of the terms; the cookie policy a section of the privacy policy. */
export enum LegalDocument {
  Terms = "terms",
  Privacy = "privacy",
  Imprint = "imprint",
  BookingPolicy = "booking-policy",
  CoachAgreement = "coach-agreement",
}

/** Where an acceptance or acknowledgment was given. */
export enum LegalAcceptanceContext {
  Registration = "registration",
  OauthComplete = "oauth_complete",
  VerificationSubmit = "verification_submit",
  Checkout = "checkout",
  Reaccept = "reaccept",
}

export interface LegalVersion {
  /** `YYYY-MM-DD`; also the content folder name. Later versions sort later. */
  version: string;
  effectiveAt: string;
  /**
   * A material change makes earlier acceptances stale (interstitial + gate);
   * a non-material one only informs.
   */
  material: boolean;
}

export interface LegalDocumentEntry {
  /** Oldest first. */
  versions: LegalVersion[];
  /** Placeholder text awaiting counsel: every page shows the draft marker. */
  draft: boolean;
  /** The locale whose text prevails; the others carry a convenience note. */
  authoritativeLocale: Locale;
  /** The document is accepted (a checkbox) rather than only acknowledged/read. */
  accepted: boolean;
}

/**
 * The single registry the web and the API read. Publishing a version is a
 * code change: a new entry here plus one Markdown file per locale under
 * `apps/web/content/legal/<document>/<version>/`. Nothing in the database
 * describes the documents.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocument, LegalDocumentEntry> = {
  [LegalDocument.Terms]: {
    versions: [
      { version: "2026-09-18", effectiveAt: "2026-09-18", material: true },
    ],
    draft: true,
    authoritativeLocale: Locale.En,
    accepted: true,
  },
  [LegalDocument.Privacy]: {
    versions: [
      { version: "2026-09-18", effectiveAt: "2026-09-18", material: false },
    ],
    draft: true,
    authoritativeLocale: Locale.En,
    accepted: false,
  },
  [LegalDocument.Imprint]: {
    versions: [
      { version: "2026-09-18", effectiveAt: "2026-09-18", material: false },
    ],
    draft: true,
    authoritativeLocale: Locale.En,
    accepted: false,
  },
  [LegalDocument.BookingPolicy]: {
    versions: [
      { version: "2026-09-18", effectiveAt: "2026-09-18", material: false },
    ],
    draft: true,
    authoritativeLocale: Locale.En,
    accepted: false,
  },
  [LegalDocument.CoachAgreement]: {
    versions: [
      { version: "2026-09-18", effectiveAt: "2026-09-18", material: true },
    ],
    draft: true,
    authoritativeLocale: Locale.En,
    accepted: true,
  },
};

export const LEGAL_DOCUMENT_KEYS = Object.values(LegalDocument);

export function isLegalDocument(value: string): value is LegalDocument {
  return (LEGAL_DOCUMENT_KEYS as string[]).includes(value);
}

export function legalVersions(document: LegalDocument): LegalVersion[] {
  return LEGAL_DOCUMENTS[document].versions;
}

/** The version in force now (the registry lists versions oldest first). */
export function currentLegalVersion(document: LegalDocument): LegalVersion {
  const versions = legalVersions(document);
  const current = versions[versions.length - 1];
  if (!current) {
    throw new Error(`Legal document ${document} has no registered version`);
  }
  return current;
}

/** The latest version flagged material: acceptances older than it are stale. */
export function latestMaterialVersion(
  document: LegalDocument,
): LegalVersion | null {
  const material = legalVersions(document).filter((v) => v.material);
  return material[material.length - 1] ?? null;
}

export function findLegalVersion(
  document: LegalDocument,
  version: string,
): LegalVersion | null {
  return legalVersions(document).find((v) => v.version === version) ?? null;
}

/** Versions are `YYYY-MM-DD`, so string order is chronological. */
export function isOlderVersion(a: string, b: string): boolean {
  return a < b;
}

/** The documents a user of this role must have accepted (the gate's input). */
export function requiredLegalDocuments(options: {
  professional: boolean;
  verificationSubmitted: boolean;
}): LegalDocument[] {
  return options.professional && options.verificationSubmitted
    ? [LegalDocument.Terms, LegalDocument.CoachAgreement]
    : [LegalDocument.Terms];
}
