/** Seconds → `m:ss`, or `h:mm:ss` from one hour on. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
}

/** Bytes → a short human size in the viewer's locale (`1.5 GB`, `240 MB`). */
export function formatBytes(bytes: number, locale: string): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  const format = (value: number, unit: string, digits: number) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${unit}`;
  if (bytes >= GB) return format(bytes / GB, "GB", 1);
  return format(Math.max(1, Math.round(bytes / MB)), "MB", 0);
}
