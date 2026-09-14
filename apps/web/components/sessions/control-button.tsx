"use client";

/** Round call control: neutral when `active`, "off" look otherwise. */
export function ControlButton({
  active,
  highlight,
  pending,
  label,
  expanded,
  onClick,
  children,
}: {
  /** Neutral look when true; "off" look (muted/disabled) when false. */
  active: boolean;
  highlight?: boolean;
  pending: boolean;
  label: string;
  /** Set when the button opens a popover; renders `aria-expanded`. */
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const look = highlight
    ? "border-accent bg-accent text-white hover:bg-accent/90"
    : active
      ? "border-border-strong bg-bg text-text hover:bg-bg-hover"
      : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={expanded === undefined ? !active : undefined}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      aria-expanded={expanded}
      title={label}
      disabled={pending}
      onClick={onClick}
      className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 max-[639px]:h-11 max-[639px]:w-11 ${look}`}
    >
      {children}
    </button>
  );
}
