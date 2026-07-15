import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-card bg-bg p-7 shadow-card", className)}>
      <h2 className="text-xl font-semibold text-text">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-[13.5px] text-text-secondary">{subtitle}</p>
      ) : null}
      <div className="mt-[18px]">{children}</div>
    </div>
  );
}

export function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3.5 flex items-center gap-2.5 text-xs text-text-tertiary before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      {children}
    </div>
  );
}

export function AuthFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3.5 text-center text-[13px] text-text-secondary [&_a]:text-accent [&_a]:no-underline">
      {children}
    </div>
  );
}
