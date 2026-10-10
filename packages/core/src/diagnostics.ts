// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Diagnostics reach the user, so a flood of near-identical ones is itself a defect. After the whole
// pipeline has run, the same problem on the same field is said once with a count, and no rule
// shows more than a handful of entries.

import type { Diagnostic } from "./outputs";

/** Entries of one rule and severity shown before the rest are summarised. */
export const RULE_LIMIT = 25;

export function condense(list: Diagnostic[]): Diagnostic[] {
  const merged = new Map<string, Diagnostic>();
  for (const d of list) {
    const key = [d.severity, d.rule, d.joint ?? "", d.part ?? "", d.field ?? "", d.message].join(
      "\u0000",
    );
    const found = merged.get(key);
    if (found) found.count = (found.count ?? 1) + (d.count ?? 1);
    else merged.set(key, { ...d });
  }

  const shown = new Map<string, number>();
  const hidden = new Map<string, { sample: Diagnostic; total: number }>();
  const out: Diagnostic[] = [];
  for (const d of merged.values()) {
    const rule = `${d.severity}|${d.rule}`;
    const n = shown.get(rule) ?? 0;
    if (n < RULE_LIMIT) {
      out.push(d);
      shown.set(rule, n + 1);
    } else {
      const entry = hidden.get(rule) ?? { sample: d, total: 0 };
      entry.total += d.count ?? 1;
      hidden.set(rule, entry);
    }
  }
  for (const { sample, total } of hidden.values()) {
    out.push({
      severity: sample.severity,
      rule: sample.rule,
      message: `${total} more "${sample.rule}" problems were found and are not listed.`,
      count: total,
    });
  }
  return out;
}
