// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The scene's colours come from the design tokens, so the model follows the theme. They are read
// from the page whenever it changes its theme; WebGL cannot use CSS variables directly.

import { useEffect, useState } from "react";

/** The colours the view draws with, read from the theme's tokens. */
export interface Palette {
  /** A board cut from sheet stock. */
  sheet: string;
  /** A board cut from solid wood. */
  solid: string;
  /** A board the engine reports an error on. */
  error: string;
  /** The badge on a board drawn without its cuts (ADR 015, rule 10). */
  warning: string;
  /** The glow of a selected board. */
  accent: string;
  /** The grain line on the hovered board. */
  grain: string;
  /** The Tape's guide lines. */
  guide: string;
  /** The light from below, softly. */
  ground: string;
}

function read(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  return {
    sheet: token("--color-wood-sheet"),
    solid: token("--color-wood-solid"),
    error: token("--color-error"),
    warning: token("--color-warning"),
    accent: token("--color-accent"),
    grain: token("--color-focus"),
    guide: token("--color-focus"),
    ground: token("--color-border"),
  };
}

/** The scene colours for the page's current theme; redrawn when the theme changes. */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(read);
  useEffect(() => {
    const watcher = new MutationObserver(() => setPalette(read()));
    watcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    setPalette(read());
    return () => watcher.disconnect();
  }, []);
  return palette;
}
