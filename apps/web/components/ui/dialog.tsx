"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui-style Dialog on Base UI (project style `base-nova`), restyled
 * to the Notion tokens. Base UI handles focus trapping, Escape/backdrop
 * dismissal, scroll locking and nested dialogs (an inner dialog stacks above
 * and hands focus back to the outer popup when it closes).
 */
export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn("text-[15px] font-semibold text-text", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn("text-[13px] text-text-secondary", className)}
      {...props}
    />
  );
}

export interface DialogContentProps extends React.ComponentProps<
  typeof BaseDialog.Popup
> {
  /** Below the `sm` breakpoint the popup fills the viewport (mobile sheet). */
  fullScreenBelowSm?: boolean;
}

/** Portal + backdrop + centered popup. Put a `DialogTitle` inside. */
export function DialogContent({
  className,
  fullScreenBelowSm = false,
  children,
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-bg p-5 text-text shadow-card outline-none transition-[opacity,scale] duration-150 data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
          fullScreenBelowSm &&
            "max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}
