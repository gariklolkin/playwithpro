import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        // In-app primary: Notion ink (design proposal .btn-primary)
        primary: "bg-text text-white hover:bg-black",
        ghost:
          "border border-border-strong bg-transparent text-text hover:bg-bg-hover",
        // Marketing blue pair (design proposal .btn-blue / .btn-blue-soft)
        blue: "bg-[#2E7DE1] font-semibold text-white hover:bg-[#2569C3]",
        blueSoft:
          "bg-[#EAF2FD] font-semibold text-[#2A5FC7] hover:bg-[#DCEAFB]",
        google:
          "w-full border border-border-strong bg-bg text-text hover:bg-bg-secondary",
      },
      size: {
        default: "px-3.5 py-[9px]",
        full: "w-full px-3.5 py-2.5",
        sm: "px-2.5 py-1.5 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
