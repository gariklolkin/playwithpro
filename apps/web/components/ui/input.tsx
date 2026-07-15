import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] text-sm text-text placeholder:text-text-tertiary focus:border-transparent focus:outline-2 focus:outline-accent",
        className,
      )}
      {...props}
    />
  );
}
