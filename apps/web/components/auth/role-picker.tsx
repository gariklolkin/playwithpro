"use client";

import { Role, type SignupRole } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function RolePicker({
  value,
  onChange,
}: {
  value: SignupRole;
  onChange: (role: SignupRole) => void;
}) {
  const t = useTranslations("auth.register");
  const options: {
    role: SignupRole;
    emoji: string;
    title: string;
    description: string;
  }[] = [
    {
      role: Role.Amateur,
      emoji: "🏓",
      title: t("rolePlayer"),
      description: t("rolePlayerDescription"),
    },
    {
      role: Role.Professional,
      emoji: "🏆",
      title: t("rolePro"),
      description: t("roleProDescription"),
    },
  ];

  return (
    <div className="mb-3.5 grid grid-cols-2 gap-2.5">
      {options.map((option) => (
        <button
          key={option.role}
          type="button"
          aria-pressed={value === option.role}
          onClick={() => onChange(option.role)}
          className={cn(
            "cursor-pointer rounded-[10px] border-[1.5px] px-2 py-3 text-center transition-colors",
            value === option.role
              ? "border-text bg-bg-secondary"
              : "border-border hover:bg-bg-secondary",
          )}
        >
          <div className="text-2xl">{option.emoji}</div>
          <div className="mt-1 text-[13.5px] font-semibold text-text">
            {option.title}
          </div>
          <div className="text-[11.5px] text-text-tertiary">
            {option.description}
          </div>
        </button>
      ))}
    </div>
  );
}
