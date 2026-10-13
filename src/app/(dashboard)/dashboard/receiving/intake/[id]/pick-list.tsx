"use client";

import { useState } from "react";
import { CUSTOM_NOTE_LABEL, PICK_SECTION_BY_KEY, optionsFor, slug, togglePick, type PickSectionKey } from "@/lib/receiving-picks";
import type { ReceivingFormConfig } from "@/lib/receiving-form-config";
import { field } from "./intake-parts";

/**
 * One Receiving Intake Form pick list: tappable chips (one or many), and a "Custom note" tab at the end for anything the options do not
 * cover. What was ticked stays visible even if the company has since hidden that option, so an old record never loses a tick.
 */
export function PickList({
  section,
  config,
  selected,
  note,
  disabled,
  onChange,
}: {
  section: PickSectionKey;
  config: ReceivingFormConfig;
  selected: string[];
  note: string;
  disabled: boolean;
  onChange: (labels: string[], note: string) => void;
}) {
  const def = PICK_SECTION_BY_KEY[section];
  const offered = optionsFor(section, config);
  const offeredLabels = new Set(offered.map((o) => o.label));
  // Ticked earlier but hidden since: still shown, so it can be seen and un-ticked.
  const legacy = selected.filter((l) => !offeredLabels.has(l));
  const [noteOpen, setNoteOpen] = useState(note.trim().length > 0);
  const showNote = noteOpen || note.trim().length > 0;

  const chip = (label: string, on: boolean, own: boolean) => (
    <label
      key={label}
      className={`inline-flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm leading-snug transition-colors focus-within:ring-2 focus-within:ring-amber-500 ${
        on
          ? "border-amber-600 bg-amber-100 font-medium text-amber-950 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-50"
          : "border-slate-300 bg-white text-slate-800 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      } ${disabled ? "cursor-default opacity-80" : ""}`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-amber-600"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(togglePick(section, selected, label, e.target.checked), note)}
        data-testid={`pick-${section}-${slug(label)}`}
      />
      <span>{label}{own && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">yours</span>}</span>
    </label>
  );

  return (
    <div data-testid={`picks-${section}`}>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{def.help}</p>
      <div className="flex flex-wrap gap-2">
        {offered.map((o) => chip(o.label, selected.includes(o.label), o.own))}
        {legacy.map((l) => chip(l, true, false))}
        {!disabled && !showNote && (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex min-h-9 items-center rounded-full border border-dashed border-slate-400 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-600 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid={`pick-${section}-custom-open`}
          >
            + Custom note
          </button>
        )}
      </div>
      {showNote && (
        <div className="mt-3">
          <label htmlFor={`pick-note-${section}`} className="block text-xs font-medium text-slate-600 dark:text-slate-400">{CUSTOM_NOTE_LABEL[section]}</label>
          <textarea
            id={`pick-note-${section}`}
            rows={2}
            className={field}
            value={note}
            maxLength={1000}
            disabled={disabled}
            placeholder="Only if none of the options above fit."
            onChange={(e) => onChange(selected, e.target.value)}
            data-testid={`pick-${section}-custom`}
          />
        </div>
      )}
    </div>
  );
}
