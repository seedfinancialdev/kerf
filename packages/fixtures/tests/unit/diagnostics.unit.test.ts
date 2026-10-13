// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { condense, type Diagnostic } from "@kerf/core";
import { describe, expect, it } from "vitest";

describe("condense", () => {
  const d = (over: Partial<Diagnostic>): Diagnostic => ({
    severity: "error",
    rule: "overlap",
    message: "m",
    ...over,
  });
  it("shows 25 per rule, then one summary counting the rest by their own counts", () => {
    const list = Array.from({ length: 25 }, (_, i) => d({ field: `f${i}` }));
    list.push(d({ field: "x1", count: 3 }), d({ field: "x2", count: 3 }));
    const out = condense(list);
    expect(out).toHaveLength(26);
    expect(out[25]).toMatchObject({ severity: "error", rule: "overlap", count: 6, summary: true });
    // The words say how many are not listed and give one as an example, with no rule id.
    expect(out[25]?.message).toBe(
      `6 more problems like this one are not listed, such as: ${list[25]?.message}`,
    );
  });
  it("26 entries leave exactly one in the summary", () => {
    const out = condense(Array.from({ length: 26 }, (_, i) => d({ field: `f${i}` })));
    expect(out).toHaveLength(26);
    expect(out[25]?.count).toBe(1);
  });
  it("repeats merge by adding their counts", () => {
    const out = condense([d({}), d({}), d({ count: 3 })]);
    expect(out).toEqual([d({ count: 5 })]);
  });
  it("same rule and field but a different message stay separate", () => {
    expect(condense([d({ message: "a" }), d({ message: "b" })])).toHaveLength(2);
  });
  it("an error and a warning of one rule stay separate", () => {
    expect(condense([d({}), d({ severity: "warning" })])).toHaveLength(2);
  });
  it("the same message on different parts stays separate", () => {
    expect(condense([d({ part: "p1" }), d({ part: "p2" })])).toHaveLength(2);
  });
  it("the same message from different joints stays separate", () => {
    expect(condense([d({ joint: "j1" }), d({ joint: "j2" })])).toHaveLength(2);
  });
  it("warnings do not use up the errors' quota of one rule", () => {
    const list = [
      ...Array.from({ length: 25 }, (_, i) => d({ field: `e${i}` })),
      ...Array.from({ length: 25 }, (_, i) => d({ severity: "warning", field: `w${i}` })),
    ];
    expect(condense(list)).toHaveLength(50);
  });
});
