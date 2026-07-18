"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Combobox over the IANA zone list: clicking opens the full scrollable list
 * (like a native select), typing narrows it to matching zones.
 */
export function TimezoneSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    if (!filtering || !value) {
      return options;
    }
    const query = value.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [filtering, options, value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setFiltering(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const item = listRef.current?.children[Math.max(highlight, 0)];
    (item as HTMLElement | undefined)?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlight]);

  function openFullList() {
    setFiltering(false);
    setHighlight(Math.max(options.indexOf(value), 0));
    setOpen(true);
  }

  function select(option: string) {
    onChange(option);
    setOpen(false);
    setFiltering(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openFullList();
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) =>
        Math.min(Math.max(current + delta, 0), filtered.length - 1),
      );
    } else if (event.key === "Enter") {
      if (open && filtered[highlight]) {
        event.preventDefault();
        select(filtered[highlight]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setFiltering(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setFiltering(true);
          setHighlight(0);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            openFullList();
          }
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-border-strong bg-bg px-3 py-[9px] pr-8 text-sm text-text"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => (open ? setOpen(false) : openFullList())}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-text-tertiary"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          ref={listRef}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-bg py-1 shadow-card"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-text-tertiary">—</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(option);
                }}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  index === highlight
                    ? "bg-bg-hover text-text"
                    : "text-text-secondary"
                }`}
              >
                {option}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
