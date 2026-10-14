// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Shop language": no form field reaches the screen under its engine key.

import { STOCK_OPTIONS, TEMPLATES } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { optionLabel } from "./labels";

describe("optionLabel()", () => {
  it("words every option a template sets, so no engine key is shown", () => {
    const keys = TEMPLATES.flatMap((t) => Object.keys(t.structure.options ?? {}));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(optionLabel(key), key).not.toBe(key);
  });

  it("words every stock field a form reads", () => {
    for (const key of STOCK_OPTIONS) expect(optionLabel(key), key).not.toBe(key);
  });
});
