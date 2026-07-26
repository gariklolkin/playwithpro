export enum DisputeStatus {
  Open = "open",
  Resolved = "resolved",
}

/** Admin resolution: release escrow to the coach or refund the player. */
export enum DisputeOutcome {
  Release = "release",
  Refund = "refund",
}
