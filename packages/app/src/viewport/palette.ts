// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The scene's colours come from the design tokens, so the model follows the theme. They are read
// from the page whenever it changes its theme; WebGL cannot use CSS variables directly.

import { useEffect, useState } from "react";

export interface Palette {
  sheet: string;
  solid: string;
  error: string;
  accent: string;
  grain: string;
}

function read(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  return {
    sheet: token("--color-wood-sheet"),
    solid: token("--color-wood-solid"),
    error: token("--color-error"),
    accent: token("--color-accent"),
    grain: token("--color-focus"),
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
