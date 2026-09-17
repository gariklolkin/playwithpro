export enum DisputeStatus {
  Open = "open",
  Resolved = "resolved",
}

/** Admin resolution: release escrow to the coach or refund the player. */
export enum DisputeOutcome {
  Release = "release",
  Refund = "refund",
}

/** Who opened the dispute: the player, or the system from attendance evidence. */
export enum DisputeKind {
  PlayerReported = "player_reported",
  CoachNoShow = "coach_no_show",
  NoAttendance = "no_attendance",
  EvidenceGap = "evidence_gap",
}

/** The player's reason for a reported dispute. */
export enum DisputeReasonCategory {
  CoachNoShow = "coach_no_show",
  CoachLateOrLeftEarly = "coach_late_or_left_early",
  TechnicalProblem = "technical_problem",
  Other = "other",
}

/** Who resolved the dispute. */
export enum DisputeResolvedVia {
  Admin = "admin",
  System = "system",
  PlayerConfirmation = "player_confirmation",
}

/** Fixed reason of a system resolution; rendered from the catalogs. */
export enum DisputeSystemNote {
  NoCoachResponse = "no_coach_response",
}

/** Attendance decision for an online session, frozen at join-window close. */
export enum AttendanceOutcome {
  Held = "held",
  PlayerNoShow = "player_no_show",
  CoachNoShow = "coach_no_show",
  NoAttendance = "no_attendance",
  EvidenceGap = "evidence_gap",
}

/** The coach's required answer for an in-person game. */
export enum CoachGameAnswer {
  TookPlace = "took_place",
  PlayerAbsent = "player_absent",
}
