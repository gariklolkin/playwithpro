/** Who cancelled a paid session. */
export enum CancelledBy {
  Player = "player",
  Coach = "coach",
  Admin = "admin",
}

/** free = full refund, partial = the late-refund percentage, none = no refund. */
export enum CancellationTier {
  Free = "free",
  Partial = "partial",
  None = "none",
}
