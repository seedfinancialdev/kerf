// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type MilestoneId = "M1" | "M2" | "M3" | "M4" | "M5";

const MILESTONES_PATH = fileURLToPath(new URL("../../../milestones.json", import.meta.url));

/** Reads milestones.json at the repo root. Flip an entry to true to activate a milestone. */
export function isMilestoneActive(id: MilestoneId): boolean {
  const flags = JSON.parse(readFileSync(MILESTONES_PATH, "utf8")) as Record<string, boolean>;
  const flag = flags[id];
  if (typeof flag !== "boolean") throw new Error(`milestones.json has no boolean entry for ${id}`);
  return flag;
}
