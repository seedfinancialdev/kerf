// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Interaction spec, "Shop language", and CLAUDE.md's banned words: a problem the engine reports is
// shown as it is written, so it names joints and their settings in shop words, never by the
// engine's keys ("throughDovetail", "pin", a rule id). Code review I2 and its re-review.

import { condense, type Diagnostic, type Project, RULE_LIMIT, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type PartSpec } from "../../src/builders";
import { loadShopProfile } from "../../src/index";

const shop = loadShopProfile();

/** CLAUDE.md, "Hard rules": the words the interface never shows, and their plurals and forms. */
const BANNED = /\b(mesh|vert(ex|ices)|components?|instances?|materials?|extru\w*|booleans?)\b/i;
/** An engine key: a lower-case word with an upper-case letter inside it, or a quoted rule id. */
const KEY = /\b[a-z]+[A-Z]\w*\b|"[a-z]+(-[a-z]+)+"/;

function plain(message: string | undefined): void {
  expect(message).toBeTypeOf("string");
  expect(message).not.toMatch(BANNED);
  expect(message).not.toMatch(KEY);
}

const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const dado = (params: Record<string, string>): Project =>
  boards(
    [host, guest],
    [
      { name: "Host", part: "Host", at: ["0in", "0in", "0in"] },
      { name: "Guest", part: "Guest", at: ["2in", "2in", "3/4in"], orientation: 16 },
    ],
    [{ type: "dado", host: "Host", guest: "Guest", params }],
  );
const dovetail = (params: Record<string, string>): Project =>
  boards(
    [
      { name: "Pins", length: "10in", width: "4in", thickness: "1/2in", stock: "wood" },
      { name: "Tails", length: "6in", width: "4in", thickness: "1/2in", stock: "wood" },
    ],
    [
      { name: "Pins", part: "Pins", at: ["0in", "0in", "0in"], orientation: 1 },
      { name: "Tails", part: "Tails", at: ["0in", "0in", "0in"], orientation: 12 },
    ],
    [{ type: "throughDovetail", host: "Pins", guest: "Tails", params }],
  );
const first = (p: Project, rule: Diagnostic["rule"]): string | undefined =>
  solve(p, shop).diagnostics.find((d) => d.rule === rule)?.message;

describe("a joint setting the engine refuses is named in shop words", () => {
  it("a dovetail pin that is not a length", () => {
    const message = first(dovetail({ pin: "3" }), "type-mismatch");
    expect(message).toBe("The pin width of the through dovetail must be a length.");
    plain(message);
  });

  it("a dado depth that does not read", () => {
    const message = first(dado({ depth: "1in +" }), "expression-syntax");
    expect(message).toMatch(/^The depth of the dado can't be worked out: /);
    plain(message);
  });

  it("a dovetail pin beyond the largest length", () => {
    const message = first(dovetail({ pin: "100001in" }), "out-of-range");
    expect(message).toBe(
      "The pin width of the through dovetail is too large: the limit is 100,000 inches.",
    );
    plain(message);
  });

  it("a dovetail standing proud by less than nothing", () => {
    const message = first(dovetail({ proud: "-1in" }), "invalid-parameter");
    expect(message).toBe("The proud amount of the through dovetail cannot be negative.");
    plain(message);
  });

  it("a dado fit below zero", () => {
    const message = first(dado({ fit: "-1in" }), "invalid-parameter");
    expect(message).toBe("The fit allowance of the dado in Host cannot be negative.");
    plain(message);
  });
});

describe("problems past the per-rule limit", () => {
  it("are summed up with an example in shop words, not by their rule id", () => {
    // RULE_LIMIT more one-of-a-kind overlaps, plus one: the last is summed up, not listed.
    const many: Diagnostic[] = Array.from({ length: RULE_LIMIT + 1 }, (_, i) => ({
      severity: "error",
      rule: "overlap",
      message: `Board ${i} and Board ${i + 1} occupy the same space and are not joined.`,
    }));
    const overflow = condense(many).at(-1);
    // One is past the limit: the words are singular and give that one as the example.
    expect(overflow?.message).toBe(
      `1 more problem like this one is not listed, such as: Board ${RULE_LIMIT} and Board ${
        RULE_LIMIT + 1
      } occupy the same space and are not joined.`,
    );
    plain(overflow?.message);
  });
});
