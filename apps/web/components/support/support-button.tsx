"use client";

import { useTranslations } from "next-intl";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useSupport } from "@/lib/observability/context";
import type { SupportContext } from "@/lib/observability/support";

/** An entry point into the support panel; renders nothing when support is off. */
export function SupportButton({
  context,
  ...props
}: { context: SupportContext } & Omit<ButtonProps, "onClick" | "children">) {
  const t = useTranslations("support");
  const support = useSupport();
  if (!support.available) return null;
  return (
    <Button type="button" {...props} onClick={() => support.open(context)}>
      💬 {t("open")}
    </Button>
  );
}
