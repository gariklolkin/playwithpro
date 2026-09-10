"use client";

import { ANNOTATION_PALETTE } from "@playwithpro/shared";
import { useTranslations } from "next-intl";
import type { LayerTool } from "@/components/sessions/annotation-layer";

const TOOLS: { tool: LayerTool; icon: string }[] = [
  { tool: "select", icon: "🖱️" },
  { tool: "pen", icon: "✏️" },
  { tool: "line", icon: "📏" },
  { tool: "angle", icon: "📐" },
];

/**
 * Tool, color, undo and clear controls for the annotation layer. Tool
 * activation is owned by the parent (it pauses the video first).
 */
export function AnnotationToolbar({
  tool,
  onToolChange,
  color,
  defaultColor,
  onColorChange,
  onUndo,
  onClear,
  canUndo,
  canClear,
}: {
  tool: LayerTool;
  onToolChange: (tool: LayerTool) => void;
  color: string;
  /** The role default, listed first in the palette. */
  defaultColor: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canClear: boolean;
}) {
  const t = useTranslations("sessions.room.annotations");
  const palette = [
    defaultColor,
    ...ANNOTATION_PALETTE.filter((c) => c !== defaultColor),
  ];

  return (
    <div
      role="toolbar"
      aria-label={t("toolbarLabel")}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <div className="flex items-center gap-1">
        {TOOLS.map(({ tool: value, icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={tool === value}
            onClick={() => onToolChange(value)}
            title={t(`tools.${value}`)}
            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
              tool === value
                ? "border-border-strong bg-bg-secondary text-text"
                : "border-border text-text-secondary hover:text-text"
            }`}
          >
            <span aria-hidden="true">{icon}</span>{" "}
            <span className="hidden sm:inline">{t(`tools.${value}`)}</span>
            <span className="sr-only sm:hidden">{t(`tools.${value}`)}</span>
          </button>
        ))}
      </div>
      <div
        role="radiogroup"
        aria-label={t("colorLabel")}
        className="flex items-center gap-1"
      >
        {palette.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={color === value}
            aria-label={value}
            onClick={() => onColorChange(value)}
            className={`h-5 w-5 rounded-full border-2 ${
              color === value ? "border-text" : "border-border-strong"
            }`}
            style={{ backgroundColor: value }}
          />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:text-text disabled:opacity-40 disabled:hover:text-text-secondary"
        >
          ↩️ {t("undo")}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:text-text disabled:opacity-40 disabled:hover:text-text-secondary"
        >
          🗑️ {t("clear")}
        </button>
      </div>
      {tool !== "select" ? (
        <p className="w-full text-xs text-text-tertiary">{t(`hint.${tool}`)}</p>
      ) : null}
    </div>
  );
}
