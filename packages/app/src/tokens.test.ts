// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Design tokens": every text/background pair reads at 4.5:1 and every control boundary at
// 3:1 in both themes (WCAG 2.1 contrast ratio: (L1 + 0.05) / (L2 + 0.05), relative luminance from sRGB).

// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function theme(selector: string): Record<string, string> {
  const block = css.split(selector)[1]?.split("}")[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

// Text on its background (WCAG 2.1 SC 1.4.3): 4.5:1. The tightest, by hand from the formula above:
// light error #b4421b on bg #eae6dd: L = 0.1368 and 0.7931, (0.7931 + 0.05) / (0.1368 + 0.05) = 4.51.
const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-raised"],
  ["text", "viewport"],
  ["text", "selection"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["text-muted", "surface-raised"],
  ["text-muted", "viewport"],
  ["accent", "surface"],
  ["accent", "surface-raised"],
  ["error", "bg"],
  ["error", "surface"],
  ["error", "surface-raised"],
  ["warning", "surface"],
  ["warning", "surface-raised"],
  ["step-active-text", "accent"],
  ["step-active-text", "error"],
  ["on-wood-sheet", "wood-sheet"],
];

// A control's boundary and the focus ring against what they sit on (WCAG 2.1 SC 1.4.11): 3:1. The
// tightest: dark border-strong #7a756e on surface-raised #2f2d29: L = 0.1799 and 0.0264,
// (0.1799 + 0.05) / (0.0264 + 0.05) = 3.01.
const CONTROL_PAIRS: Array<[string, string]> = [
  ["border-strong", "bg"],
  ["border-strong", "surface"],
  ["border-strong", "surface-raised"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "surface-raised"],
  ["focus", "viewport"],
  ["focus", "selection"],
];

describe.each([
  ["dark", ':root[data-theme="dark"] {'],
  ["light", ':root[data-theme="light"] {'],
])("the %s theme", (_name, selector) => {
  const t = theme(selector);
  it.each(TEXT_PAIRS)("reads %s on %s at 4.5:1 or better", (fg, bg) => {
    expect(t[fg], `--color-${fg} missing`).toBeDefined();
    expect(t[bg], `--color-${bg} missing`).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(CONTROL_PAIRS)("shows %s against %s at 3:1 or better", (fg, bg) => {
    expect(t[fg], `--color-${fg} missing`).toBeDefined();
    expect(t[bg], `--color-${bg} missing`).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(3);
  });
});

describe("styles.css", () => {
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const defined = new Set([...css.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
  const used = [...new Set([...styles.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1] as string))];

  // A missing custom property makes CSS fall back silently (no error, transparent or inherited colour).
  it.each(used)("uses %s, which tokens.css defines", (name) => {
    expect(defined.has(name)).toBe(true);
  });
});
