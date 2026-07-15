import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-[12.5px] font-medium text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}
