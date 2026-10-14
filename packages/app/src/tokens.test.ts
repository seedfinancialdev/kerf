// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Design spec, "Design tokens": every text/background pair reads at 4.5:1 in both themes (WCAG 2.1
// contrast ratio: (L1 + 0.05) / (L2 + 0.05), relative luminance from sRGB).

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

const PAIRS: Array<[string, string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "surface-raised"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["text-muted", "surface-raised"],
  ["accent", "surface"],
  ["error", "surface"],
  ["error", "bg"],
  ["warning", "surface"],
  ["step-active-text", "accent"],
  ["text", "hover"],
];

describe.each([
  ["dark", ':root[data-theme="dark"] {'],
  ["light", ':root[data-theme="light"] {'],
])("the %s theme", (_name, selector) => {
  const t = theme(selector);
  it.each(PAIRS)("reads %s on %s at 4.5:1 or better", (fg, bg) => {
    expect(t[fg], `--color-${fg} missing`).toBeDefined();
    expect(t[bg], `--color-${bg} missing`).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
});
