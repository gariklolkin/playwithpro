/**
 * A user whose deletion is scheduled or executed: gone from everything
 * public and from the counterpart's access at request time. Use the filter
 * in Prisma `where` clauses on a `user` relation, the predicate on a loaded row.
 */
export const PRESENT_USER = {
  deletionScheduledFor: null,
  deletedAt: null,
} as const;

export function isDeparting(user: {
  deletionScheduledFor: Date | null;
  deletedAt: Date | null;
}): boolean {
  return user.deletionScheduledFor !== null || user.deletedAt !== null;
}
