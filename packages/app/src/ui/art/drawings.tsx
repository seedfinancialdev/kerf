// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Line drawings of tools, wood and pieces (design spec, "The look"): thin strokes in the current
// colour, so a chosen card turns them amber. Decorative only; every drawing sits beside its name.

import type { ReactNode } from "react";

const PATHS = {
  tableSaw: (
    <>
      <path d="M14 40h92l-6 8H20z" />
      <path d="M60 40c0-12 9-20 18-20" />
      <path d="M60 40a14 14 0 0 1 28 0" strokeDasharray="2 4" />
      <path d="M30 33h4v7h-4zM88 31h3v9h-3z" />
      <path d="M24 48l-6 32M96 48l6 32M40 48l-3 32M80 48l3 32" />
      <path d="M22 66h76" />
    </>
  ),
  dadoStack: (
    <>
      <ellipse cx="60" cy="30" rx="34" ry="10" />
      <path d="M26 30v10c0 5.5 15 10 34 10s34-4.5 34-10V30" />
      <path d="M26 40v10c0 5.5 15 10 34 10s34-4.5 34-10V40" />
      <path d="M26 50v8c0 5.5 15 10 34 10s34-4.5 34-10v-8" />
      <ellipse cx="60" cy="30" rx="6" ry="2" />
      <path d="M34 26l-4-3M44 22l-2-4M76 22l2-4M86 26l4-3" />
    </>
  ),
  router: (
    <>
      <rect x="44" y="12" width="32" height="44" rx="8" />
      <path d="M50 22h20M50 30h20" />
      <path d="M44 36H28a6 6 0 0 0 0 12h16M76 36h16a6 6 0 0 1 0 12H76" />
      <path d="M38 56h44l4 8H34z" />
      <path d="M58 64v10M62 64v10" />
      <path d="M56 74h8l-4 6z" />
    </>
  ),
  trackSaw: (
    <>
      <path d="M8 66h104v6H8z" />
      <path d="M30 66V44a6 6 0 0 1 6-6h38l14 14v14" />
      <circle cx="60" cy="54" r="9" />
      <path d="M74 38c8-14 22-14 26-6l-12 6" />
      <path d="M40 38v-6h14v6" />
    </>
  ),
  drill: (
    <>
      <path d="M30 22h48a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H30z" />
      <path d="M88 30h14M102 26v8" />
      <path d="M44 46l-6 28h20l4-28" />
      <path d="M36 74h26" />
      <path d="M50 22v-6h16v6" />
    </>
  ),
  chisels: (
    <>
      <path d="M30 14l10 4-14 38-8-3z" />
      <path d="M18 53l-6 20 4 2 10-19" />
      <path d="M62 10h10v34H62z" />
      <path d="M62 44l2 30h6l2-30" />
      <path d="M98 16l8 6-22 32-7-5z" />
      <path d="M77 49l-12 18 3 3 16-15" />
    </>
  ),
  dovetailSaw: (
    <>
      <path d="M14 30h66v24H14z" />
      <path d="M14 54l4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 2-6" />
      <path d="M80 26h12a14 14 0 0 1 14 14v6a10 10 0 0 1-10 10H80z" />
      <path d="M86 34h8a6 6 0 0 1 6 6v2a4 4 0 0 1-4 4h-10z" />
    </>
  ),
  sheet: (
    <>
      <path d="M14 30l58-14 36 16-58 14z" />
      <path d="M14 30v8l36 16v-8M50 54l58-14v-8" />
      <path d="M14 34l36 16 58-14" />
    </>
  ),
  thinSheet: (
    <>
      <path d="M14 36l58-14 36 16-58 14z" />
      <path d="M14 36v3l36 16v-3M50 55l58-14v-3" />
    </>
  ),
  boards: (
    <>
      <path d="M10 30l80-14 20 6-80 14z" />
      <path d="M10 30v8l20 6v-8M30 44l80-14v-8" />
      <path d="M14 52l80-14 16 5-80 14z" />
      <path d="M14 52v7l16 5v-7M30 64l80-14v-7" />
    </>
  ),
  bookcase: (
    <>
      <path d="M38 6h44v80H38z" />
      <path d="M38 26h44M38 46h44M38 66h44" />
      <path d="M44 26v-12M49 26v-10M54 26v-12M60 26l3-11M47 46v-12M52 46v-9M66 46v-11M71 46v-11" />
    </>
  ),
  cabinet: (
    <>
      <path d="M26 16h68v62H26z" />
      <path d="M60 16v62" />
      <path d="M55 44v8M65 44v8" />
      <path d="M30 78v6M90 78v6" />
      <path d="M22 16h76" />
    </>
  ),
  box: (
    <>
      <path d="M22 40l38-12 38 12-38 12z" />
      <path d="M22 40v24l38 14 38-14V40" />
      <path d="M60 52v26" />
      <path d="M22 40l-6-14 38-12 6 14" />
    </>
  ),
  table: (
    <>
      <ellipse cx="60" cy="28" rx="46" ry="12" />
      <path d="M14 28v4c0 6.6 20.6 12 46 12s46-5.4 46-12v-4" />
      <path d="M40 42l-6 40M80 42l6 40M52 44l-2 36M68 44l2 36" />
    </>
  ),
  dresser: (
    <>
      <path d="M24 12h72v66H24z" />
      <path d="M24 34h72M24 56h72" />
      <path d="M54 23h12M54 45h12M54 67h12" />
      <path d="M28 78l-2 8M92 78l2 8" />
    </>
  ),
  idea: (
    <>
      <path d="M60 14a20 20 0 0 1 12 36v8H48v-8a20 20 0 0 1 12-36z" />
      <path d="M50 64h20M52 70h16" />
      <path d="M60 4v4M88 16l-3 3M32 16l3 3M98 36h-4M22 36h4" />
    </>
  ),
  photo: (
    <>
      <rect x="20" y="20" width="80" height="56" rx="6" />
      <circle cx="48" cy="42" r="7" />
      <path d="M24 70l22-20 14 12 12-10 24 18" />
      <path d="M84 12v16M76 20h16" />
    </>
  ),
  blank: (
    <>
      <rect x="22" y="12" width="76" height="66" rx="4" strokeDasharray="6 6" />
      <path d="M60 34v22M49 45h22" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/** The name of one drawing. */
export type DrawingName = keyof typeof PATHS;

/** Every drawing's name, for tests and galleries. */
export const DRAWING_NAMES = Object.keys(PATHS) as DrawingName[];

/** A line drawing in the current text colour; hidden from screen readers (its card names it). */
export function Drawing({ name, className }: { name: DrawingName; className?: string }) {
  return (
    <svg
      className={className ? `drawing ${className}` : "drawing"}
      viewBox="0 0 120 90"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
