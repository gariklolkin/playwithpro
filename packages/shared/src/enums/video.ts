export enum VideoStatus {
  Uploading = "uploading",
  Processing = "processing",
  Ready = "ready",
  Rejected = "rejected",
}

/** Machine-readable rejection keys; the UI localizes them. */
export enum VideoRejectionReason {
  NotAVideo = "not_a_video",
  TooLong = "too_long",
  TooLarge = "too_large",
  ProcessingFailed = "processing_failed",
}
