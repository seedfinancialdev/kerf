// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Testing standard, tier 5: every rule a diagnostic can name has a test that triggers it. This
// does not prove the tests are good, but a rule nobody mentions in a test is a rule nobody has
// checked, and a rule that nothing can raise is dead code.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULE_IDS } from "@kerf/core";
import { describe, expect, it } from "vitest";

const PACKAGES = fileURLToPath(new URL("../../../", import.meta.url));

/** Files under `dir` whose name satisfies `keep`, skipping dependencies. */
function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (name === "node_modules") return [];
    if (statSync(path).isDirectory()) return files(path, keep);
    return keep(name) ? [path] : [];
  });
}

const read = (list: string[]): string => list.map((file) => readFileSync(file, "utf8")).join("\n");
const root = PACKAGES.replace(/\/$/, "");

describe("rule ids", () => {
  const text = read(files(root, (name) => name.endsWith(".test.ts")));
  const source = read(
    files(`${root}/core/src`, (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).filter(
      (file) => !file.endsWith("/rules.ts"),
    ),
  );

  it.each([...RULE_IDS])("%s can be raised by the engine", (rule) => {
    expect(source).toContain(`"${rule}"`);
  });

  it.each([...RULE_IDS])("%s is exercised by a test", (rule) => {
    // As an id on its own ("overlap") or inside a severity-prefixed one ("error:overlap").
    const mentioned = new RegExp(`(^|[^a-z0-9-])${rule}([^a-z0-9-]|$)`);
    expect(text).toMatch(mentioned);
  });
});
