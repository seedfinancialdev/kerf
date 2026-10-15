// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Addresses an `<img>` can show for the PNG pictures of kept projects (design spec §2, "Recent
// files"). The library hands back fresh copies of the bytes every time Home lists the projects, so an
// address is shared by everything showing the same picture, made the first time it is drawn (no
// frame without it), and let go only once nothing shows it.

import { useLayoutEffect, useMemo } from "react";

/** One address and how many cards show it. */
interface Shown {
  url: string;
  holders: number;
}

/** Every address in use, by picture (`keyOf`). Module-wide so cards share one per picture. */
const shown = new Map<string, Shown>();

/** FNV-1a over `bytes`: equal pictures always agree, different ones all but never do. */
function fingerprint(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

/**
 * Lets go of the address for `key` once nothing holds it. Later, not now: React takes a card off
 * and puts it back at once in development (StrictMode), and an address let go of in between would
 * leave a broken picture.
 */
function letGoLater(key: string): void {
  setTimeout(() => {
    const entry = shown.get(key);
    if (entry && entry.holders === 0) {
      URL.revokeObjectURL(entry.url);
      shown.delete(key);
    }
  }, 0);
}

/**
 * An address for the PNG `png` of project `id`, or null without one. The same picture keeps its
 * address however often the bytes are copied; a new picture gets a new address and the old one is
 * let go of once no card shows it.
 */
export function usePictureUrl(id: string, png: Uint8Array | null): string | null {
  const key = useMemo(() => (png ? `${id}:${png.length}:${fingerprint(png)}` : null), [id, png]);
  let entry = key ? shown.get(key) : undefined;
  if (key && png && !entry) {
    // Made while drawing, so the first frame has the picture; a drawing never shown is let go of.
    entry = {
      url: URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" })),
      holders: 0,
    };
    shown.set(key, entry);
    letGoLater(key);
  }
  // A layout effect runs before the browser can run `letGoLater`'s timer, so a drawn card always
  // holds its address in time.
  useLayoutEffect(() => {
    const held = key ? shown.get(key) : undefined;
    if (!key || !held) return;
    held.holders += 1;
    return () => {
      held.holders -= 1;
      letGoLater(key);
    };
  }, [key]);
  return entry?.url ?? null;
}
