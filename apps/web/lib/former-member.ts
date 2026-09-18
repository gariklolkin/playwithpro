/**
 * A deleted account keeps an empty display name (the tombstone); every place
 * that shows a session party, review author or ledger party renders the
 * localized "Former member" label instead. The label comes from the
 * `account.formerMember` catalog key, never from the database.
 */
export function formerMember(displayName: string, label: string): string {
  return displayName.trim() ? displayName : label;
}
