import { API_URL } from "@/lib/api";

/** Full-page navigation into the API's Google OAuth flow. */
export function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href={`${API_URL}/auth/google`}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg py-[9px] text-sm font-medium text-text transition-colors hover:bg-bg-secondary"
    >
      <span aria-hidden>🇬</span> {label}
    </a>
  );
}
