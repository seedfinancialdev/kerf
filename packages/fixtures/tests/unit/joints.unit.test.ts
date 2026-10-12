// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Operation specs: dado/groove, rabbet, roundover, through dovetail. Milestone M2.
// Only numbers the spec states are asserted; removal-primitive coordinates are not in the spec.

import { deriveJointCuts, type Joint, type Project, solve } from "@kerf/core";
import { dovetailLayout } from "@kerf/core/internal";
import { describe, expect } from "vitest";
import { loadExpected, loadProject, loadShopProfile, withParam } from "../../src/index";
import { milestone } from "../../src/milestone";

const shop = loadShopProfile();
const INCH = 203200;

function joint(project: Project, pick: (j: Joint) => boolean): Joint {
  const found = project.joints.find(pick);
  if (!found) throw new Error("fixture joint not found");
  return found;
}
const severities = (project: Project) => solve(project, shop).diagnostics.map((d) => d.severity);

describe("dado / groove", () => {
  milestone("M2", 'guest cut length grows by the dado depth (1/4")', () => {
    const bookcase = loadProject("bookcase");
    const cuts = deriveJointCuts(bookcase, joint(bookcase, (j) => j.type === "dado").id);
    expect(cuts.guestCutAdd).toEqual({ length: INCH / 4, width: 0 });
  });

  milestone("M2", "deeper than half the host thickness is a warning, not an error", () => {
    const deep = withParam(loadProject("bookcase"), "dado_depth", "3/8in");
    expect(severities(deep)).toContain("warning");
    expect(severities(deep)).not.toContain("error");
  });

  milestone("M2", "depth at or beyond the host thickness is an error", () => {
    const through = withParam(loadProject("bookcase"), "dado_depth", "23/32in");
    expect(severities(through)).toContain("error");
  });

  milestone("M2", "the bookcase golden dados and rabbets raise no warning or error", () => {
    expect(solve(loadProject("bookcase"), shop).diagnostics).toEqual([]);
  });
});

describe("rabbet", () => {
  milestone("M2", "an end rabbet adds its depth to the guest's cut length", () => {
    const bookcase = loadProject("bookcase");
    const topRabbet = joint(
      bookcase,
      (j) => j.type === "rabbet" && j.params.depth === "rabbet_depth",
    );
    expect(deriveJointCuts(bookcase, topRabbet.id).guestCutAdd).toEqual({
      length: INCH / 4,
      width: 0,
    });
  });

  milestone("M2", "an edge rabbet adds its depth (3/8\") to the guest's cut width", () => {
    const bookcase = loadProject("bookcase");
    const backRabbet = joint(bookcase, (j) => j.params.depth === "back_rabbet_depth");
    expect(deriveJointCuts(bookcase, backRabbet.id).guestCutAdd).toEqual({
      length: 0,
      width: (INCH * 3) / 8,
    });
  });

  milestone("M2", "width beyond half the host's width is an error", () => {
    const bookcase = loadProject("bookcase");
    const target = joint(bookcase, (j) => j.params.depth === "back_rabbet_depth");
    const wide: Project = {
      ...bookcase,
      joints: bookcase.joints.map((j) =>
        j.id === target.id ? { ...j, params: { ...j.params, width: "7in" } } : j,
      ),
    };
    expect(severities(wide)).toContain("error");
  });
});

describe("roundover", () => {
  milestone("M2", "has no effect on the cut list", () => {
    const bookcase = loadProject("bookcase");
    const plain: Project = {
      ...bookcase,
      parts: bookcase.parts.map((p) => ({ ...p, ops: [] })),
    };
    expect(solve(bookcase, shop).cutList).toEqual(solve(plain, shop).cutList);
  });

  milestone("M2", "two radii on one face that sum past the thickness are an error", () => {
    const bookcase = loadProject("bookcase");
    const rounded: Project = {
      ...bookcase,
      parts: bookcase.parts.map((p) =>
        p.name === "Shelf"
          ? {
              ...p,
              ops: [
                {
                  id: "01K7M3Q8ZD00000000B1000F01",
                  type: "roundover",
                  edges: ["edge0/face1", "edge1/face1"],
                  radius: "3/8in",
                },
              ],
            }
          : p,
      ),
    };
    expect(severities(rounded)).toContain("error");
  });
});

describe("through dovetail", () => {
  milestone("M2", 'keepsake box layout: wide 1", offset 1/16", narrow 7/8"', () => {
    const { input, layout } = loadExpected<{
      input: Parameters<typeof dovetailLayout>[0];
      layout: ReturnType<typeof dovetailLayout>;
    }>("box", "dovetail-layout");
    expect(dovetailLayout(input)).toEqual(layout);
  });

  milestone("M2", "corner joints add nothing to cut length", () => {
    const box = loadProject("box");
    const cuts = deriveJointCuts(box, joint(box, (j) => j.type === "throughDovetail").id);
    expect(cuts.guestCutAdd).toEqual({ length: 0, width: 0 });
  });

  milestone("M2", 'a pin narrower than 1/8" is an error', () => {
    const thin = withParam(loadProject("box"), "pin_width", "1/16in");
    expect(severities(thin)).toContain("error");
  });

  milestone("M2", 'a narrow tail under 1/8" is an error', () => {
    const crowded = withParam(loadProject("box"), "tails", "10");
    expect(severities(crowded)).toContain("error");
  });

  milestone("M2", "a slope outside 1:5 to 1:10 is an error", () => {
    const box = loadProject("box");
    const steep: Project = {
      ...box,
      joints: box.joints.map((j) =>
        j.type === "throughDovetail" ? { ...j, params: { ...j.params, slope: "1:12" } } : j,
      ),
    };
    expect(severities(steep)).toContain("error");
  });
});
