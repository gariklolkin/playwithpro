"use client";

import { ANNOTATION_PALETTE } from "@playwithpro/shared";
import {
  MousePointer2,
  Pencil,
  Slash,
  Trash2,
  TriangleRight,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { LayerTool } from "@/components/sessions/annotation-layer";

const TOOLS: { tool: LayerTool; Icon: typeof Pencil }[] = [
  { tool: "select", Icon: MousePointer2 },
  { tool: "pen", Icon: Pencil },
  { tool: "line", Icon: Slash },
  { tool: "angle", Icon: TriangleRight },
];

const RAIL_BUTTON =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-[639px]:h-11 max-[639px]:w-11";

/**
 * Tool, color, undo and clear controls for the annotation layer, as a
 * vertical rail over the frame's left edge. Tool activation is owned by the
 * parent (it pauses the video first).
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [paletteOpen]);

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("toolbarLabel")}
      className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-lg bg-black/65 p-1 text-white"
    >
      {TOOLS.map(({ tool: value, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={tool === value}
          aria-label={t(`tools.${value}`)}
          title={t(`tools.${value}`)}
          onClick={() => onToolChange(value)}
          className={`${RAIL_BUTTON} ${
            tool === value ? "bg-blue-600 text-white" : "hover:bg-white/15"
          }`}
        >
          <Icon size={16} />
        </button>
      ))}
      <span aria-hidden="true" className="my-0.5 h-px w-5 bg-white/25" />
      <button
        type="button"
        aria-label={t("undo")}
        title={t("undo")}
        onClick={onUndo}
        disabled={!canUndo}
        className={`${RAIL_BUTTON} hover:bg-white/15`}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        aria-label={t("clear")}
        title={t("clear")}
        onClick={onClear}
        disabled={!canClear}
        className={`${RAIL_BUTTON} hover:bg-white/15`}
      >
        <Trash2 size={16} />
      </button>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={paletteOpen}
          aria-label={t("colorLabel")}
          title={t("colorLabel")}
          onClick={() => setPaletteOpen((open) => !open)}
          className={`${RAIL_BUTTON} hover:bg-white/15`}
        >
          <span
            className="h-4 w-4 rounded-full border-2 border-white"
            style={{ backgroundColor: color }}
          />
        </button>
        {paletteOpen ? (
          <div
            role="radiogroup"
            aria-label={t("colorLabel")}
            className="absolute left-full top-1/2 ml-2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-black/75 p-1.5"
          >
            {palette.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={color === value}
                aria-label={value}
                onClick={() => {
                  onColorChange(value);
                  setPaletteOpen(false);
                }}
                className={`h-5 w-5 cursor-pointer rounded-full border-2 ${
                  color === value ? "border-white" : "border-white/30"
                }`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
        ) : null}
      </div>
      {tool !== "select" ? (
        <p className="pointer-events-none absolute bottom-0 left-full ml-2 w-56 rounded bg-black/75 px-2 py-1 text-[11px] leading-snug text-white">
          {t(`hint.${tool}`)}
        </p>
      ) : null}
    </div>
  );
}
