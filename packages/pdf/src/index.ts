// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { type BuildPlan, notImplemented } from "@kerf/core";

/** Build plan PDF (M5). */
export function buildPlanPdf(_plan: BuildPlan): Promise<Uint8Array> {
  return notImplemented("buildPlanPdf");
}
