// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { test } from "vitest";
import { isMilestoneActive, type MilestoneId } from "./milestones";

type Body = () => void | Promise<void>;

/**
 * A test that belongs to a milestone. While the milestone is inactive it runs as an expected
 * failure (`test.fails`): CI stays green, and the test would turn CI red if it passed early.
 * Activating a milestone in milestones.json makes it an ordinary test.
 */
export function milestone(id: MilestoneId, name: string, body: Body, timeout?: number): void {
  const run = isMilestoneActive(id) ? test : test.fails;
  run(`[${id}] ${name}`, body, timeout);
}
