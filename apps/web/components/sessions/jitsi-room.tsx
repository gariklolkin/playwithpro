"use client";

/**
 * Embedded Jitsi call as a plain iframe. We deliberately skip Jitsi's
 * external_api.js: it hardcodes https (breaking the cert-free plain-HTTP
 * dev stack on localhost) and executes third-party script in our page.
 * The room URL alone is enough — attendance is tracked by our own API
 * calls, not by Jitsi events.
 */
export function JitsiRoom({
  domain,
  roomName,
  displayName,
}: {
  /** Bare host (https assumed) or full origin like http://localhost:8000. */
  domain: string;
  roomName: string;
  displayName: string;
}) {
  const base = domain.includes("://") ? domain : `https://${domain}`;
  const src = `${base}/${roomName}#userInfo.displayName=${encodeURIComponent(
    JSON.stringify(displayName),
  )}`;

  return (
    <iframe
      src={src}
      allow="camera; microphone; display-capture; autoplay; clipboard-write; screen-wake-lock"
      className="h-[520px] w-full rounded-card border border-border bg-black"
      title={roomName}
    />
  );
}
