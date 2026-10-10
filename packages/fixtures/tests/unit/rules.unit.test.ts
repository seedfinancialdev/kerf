// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Every diagnostic rule has a triggering input, severity and field (Unit standard, Tier 5).
// Boards are 3/4" ply unless noted. "Host" is 12" x 6" x 3/4" at the origin; a "Guest" stands on
// its top face unless a case says otherwise.

import { type Project, solve } from "@kerf/core";
import { describe, expect, it } from "vitest";
import { boards, type InstanceSpec, type JointSpec, type PartSpec } from "../../src/builders";
import { loadProject, loadShopProfile } from "../../src/index";

const shop = loadShopProfile();
const rules = (p: Project) => solve(p, shop).diagnostics.map((d) => `${d.severity}:${d.rule}`);

const host: PartSpec = { name: "Host", length: "12in", width: "6in", thickness: "3/4in" };
const guest: PartSpec = { name: "Guest", length: "4in", width: "5in", thickness: "1/2in" };
const hostAt: InstanceSpec = { name: "Host", part: "Host", at: ["0in", "0in", "0in"] };
/** Standing on the host's top face: orientation 16 puts its length up, its width along X. */
const standing = (at: [string, string, string], name = "Guest"): InstanceSpec => ({
  name,
  part: "Guest",
  at,
  orientation: 16,
});

function with_(joint: JointSpec, g: InstanceSpec = standing(["2in", "2in", "3/4in"])): Project {
  return boards([host, guest], [hostAt, g], [joint]);
}
const dado = (params: Record<string, string> = {}): JointSpec => ({
  type: "dado",
  host: "Host",
  guest: "Guest",
  params,
});
const rabbet = (params: Record<string, string> = {}): JointSpec => ({
  type: "rabbet",
  host: "Host",
  guest: "Guest",
  params,
});

describe("a valid dado", () => {
  it("raises nothing and adds the depth at the guest's end", () => {
    const result = solve(with_(dado()), shop);
    expect(result.diagnostics).toEqual([]);
    // Guest 4" long + 1/4" (thickness / 3 snapped down, 3/4" / 3) at its seated end.
    expect(result.cutList.lines.find((l) => l.parts[0]?.name === "Guest")?.length).toBe(
      (4.25 * 203200) | 0,
    );
  });
});

describe("dado rules", () => {
  it("joint-no-contact: the parts do not touch", () => {
    expect(rules(with_(dado(), standing(["2in", "2in", "2in"])))).toContain(
      "error:joint-no-contact",
    );
  });

  it("joint-overlap: the guest is inside the host", () => {
    expect(rules(with_(dado(), standing(["2in", "2in", "1/2in"])))).toContain(
      "error:joint-overlap",
    );
  });

  it("dado-needs-face: the guest meets the host's end, not its face", () => {
    const atEnd: InstanceSpec = { name: "Guest", part: "Guest", at: ["12in", "0.5in", "0.125in"] };
    expect(rules(with_(dado(), atEnd))).toContain("error:dado-needs-face");
  });

  it("dado-not-perpendicular: the guest lies flat on the face", () => {
    const flat: InstanceSpec = { name: "Guest", part: "Guest", at: ["2in", "1in", "3/4in"] };
    expect(rules(with_(dado(), flat))).toContain("error:dado-not-perpendicular");
  });

  it("dado-outside-face: the guest end reaches past the host's face", () => {
    expect(rules(with_(dado(), standing(["10in", "2in", "3/4in"])))).toContain(
      "error:dado-outside-face",
    );
  });

  it("dado-too-deep: as deep as the board is thick", () => {
    for (const depth of ["3/4in", "1in"]) {
      expect(rules(with_(dado({ depth })))).toContain("error:dado-too-deep");
    }
  });

  it("dado-deep: more than half the board is a warning, and the part still solves", () => {
    const found = rules(with_(dado({ depth: "1/2in" })));
    expect(found).toContain("warning:dado-deep");
    expect(found.filter((r) => r.startsWith("error:"))).toEqual([]);
  });

  it("exactly half the board is allowed", () => {
    expect(rules(with_(dado({ depth: "3/8in" })))).not.toContain("warning:dado-deep");
  });

  it("dado-stop: a stop distance outside the board is an error; a valid stop is accepted", () => {
    expect(rules(with_(dado({ stop: "20in" })))).toContain("error:dado-stop");
    expect(rules(with_(dado({ stop: "1in" })))).toEqual([]);
  });

  it("dado-overlap: two dados cut into each other (a loose fit makes them wider)", () => {
    const p = boards(
      [host, guest],
      [hostAt, standing(["2in", "2in", "3/4in"], "G1"), standing(["2in", "3in", "3/4in"], "G2")],
      [
        { type: "dado", host: "Host", guest: "G1", params: { fit: "1in" } },
        { type: "dado", host: "Host", guest: "G2", params: { fit: "1in" } },
      ],
    );
    expect(rules(p)).toContain("error:dado-overlap");
  });

  it("type-mismatch: a joint depth that is not a length", () => {
    const found = solve(with_(dado({ depth: "3" })), shop).diagnostics.find(
      (d) => d.rule === "type-mismatch",
    );
    expect(found?.severity).toBe("error");
    expect(found?.joint).toBeDefined();
  });

  it("expression-syntax: a joint depth that does not parse", () => {
    expect(rules(with_(dado({ depth: "1in +" })))).toContain("error:expression-syntax");
  });
});

describe("rabbet rules", () => {
  /** At the host's back edge: patch touches edge0, 1/2" wide (the guest's thickness). */
  const seated = standing(["2in", "0in", "3/4in"]);

  it("a valid rabbet adds its depth at the guest's end", () => {
    const result = solve(with_(rabbet(), seated), shop);
    expect(result.diagnostics).toEqual([]);
    // Default depth: half the board, 3/8".
    expect(result.cutList.lines.find((l) => l.parts[0]?.name === "Guest")?.length).toBe(
      (4.375 * 203200) | 0,
    );
  });

  it("rabbet-needs-face: the guest meets the host's end", () => {
    const atEnd: InstanceSpec = { name: "Guest", part: "Guest", at: ["12in", "0.5in", "0.125in"] };
    expect(rules(with_(rabbet(), atEnd))).toContain("error:rabbet-needs-face");
  });

  it("rabbet-not-seated: the guest lies flat, or sits away from any end or edge", () => {
    const flat: InstanceSpec = { name: "Guest", part: "Guest", at: ["2in", "1in", "3/4in"] };
    expect(rules(with_(rabbet(), flat))).toContain("error:rabbet-not-seated");
    expect(rules(with_(rabbet()))).toContain("error:rabbet-not-seated"); // interior of the face
  });

  it("rabbet-too-deep: as deep as the board is thick", () => {
    expect(rules(with_(rabbet({ depth: "3/4in" }), seated))).toContain("error:rabbet-too-deep");
  });

  it("rabbet-too-wide: wider than half the host's width", () => {
    expect(rules(with_(rabbet({ width: "4in" }), seated))).toContain("error:rabbet-too-wide");
  });
});

describe("roundover rules", () => {
  const rounded = (radius: string, edges: string[]): Project => {
    const part: PartSpec = {
      ...host,
      ops: [{ id: "01K7M3Q8ZD00000000F3000900", type: "roundover", edges: edges as never, radius }],
    };
    return boards([part], [hostAt]);
  };

  it('a 1/8" roundover on the front edge solves cleanly', () => {
    expect(rules(rounded("1/8in", ["edge1/face1"]))).toEqual([]);
  });

  it("roundover-too-large: bigger than the board is thick", () => {
    expect(rules(rounded("1in", ["edge1/face1"]))).toContain("error:roundover-too-large");
  });

  it("roundover-radii-too-large: both faces of one edge together exceed the thickness", () => {
    expect(rules(rounded("1/2in", ["edge1/face0", "edge1/face1"]))).toContain(
      "error:roundover-radii-too-large",
    );
  });

  it("two edges on one face together exceed the thickness", () => {
    expect(rules(rounded("3/8in", ["edge0/face1", "edge1/face1"]))).toEqual([]); // 3/4 = thickness
    expect(rules(rounded("1/2in", ["edge0/face1", "edge1/face1"]))).toContain(
      "error:roundover-radii-too-large",
    );
  });
});

describe("dovetail rules", () => {
  const pins: PartSpec = {
    name: "Pins",
    length: "10in",
    width: "4in",
    thickness: "1/2in",
    stock: "wood",
  };
  const tails: PartSpec = {
    name: "Tails",
    length: "6in",
    width: "4in",
    thickness: "1/2in",
    stock: "wood",
  };
  const pinsAt: InstanceSpec = {
    name: "Pins",
    part: "Pins",
    at: ["0in", "0in", "0in"],
    orientation: 1,
  };
  const tailsAt: InstanceSpec = {
    name: "Tails",
    part: "Tails",
    at: ["0in", "0in", "0in"],
    orientation: 12,
  };
  const corner = (
    params: Record<string, string> = {},
    parts = [pins, tails],
    at = tailsAt,
  ): Project =>
    boards(
      parts,
      [pinsAt, at],
      [{ type: "throughDovetail", host: "Pins", guest: "Tails", params }],
    );

  it('a default dovetail (3 tails, 1/4" pins, 1:8) solves cleanly with no length added', () => {
    const result = solve(corner(), shop);
    expect(result.diagnostics).toEqual([]);
    expect(result.cutList.lines.map((l) => l.length)).toEqual([10 * 203200, 6 * 203200]);
  });

  it("proud adds its length to both boards", () => {
    const result = solve(corner({ proud: "1/8in" }), shop);
    expect(result.cutList.lines.map((l) => l.length)).toEqual([10.125 * 203200, 6.125 * 203200]);
  });

  it("dovetail-slope: outside 1:5 to 1:10, or not written as a ratio", () => {
    for (const slope of ["1:12", "1:4", "steep"]) {
      expect(rules(corner({ slope }))).toContain("error:dovetail-slope");
    }
    for (const slope of ["1:5", "1:6", "1:10"]) {
      expect(rules(corner({ slope }))).not.toContain("error:dovetail-slope");
    }
  });

  it('dovetail-thin-pin: narrower than 1/8"', () => {
    expect(rules(corner({ pin: "1/16in" }))).toContain("error:dovetail-thin-pin");
    expect(rules(corner({ pin: "1/8in" }))).not.toContain("error:dovetail-thin-pin");
  });

  it('dovetail-narrow-tail: the tails would be narrower than 1/8" at the neck', () => {
    expect(rules(corner({ tails: "10" }))).toContain("error:dovetail-narrow-tail");
  });

  it("dovetail-no-room: more tails and pins than the board can hold", () => {
    expect(rules(corner({ tails: "20" }))).toContain("error:dovetail-no-room");
  });

  it("dovetail-width-mismatch: boards of different widths", () => {
    const narrow: PartSpec = { ...tails, width: "3in" };
    expect(rules(corner({}, [pins, narrow]))).toContain("error:dovetail-width-mismatch");
  });

  it("dovetail-not-corner: the boards do not meet at a corner", () => {
    const away: InstanceSpec = { ...tailsAt, at: ["3in", "0in", "0in"] };
    expect(rules(corner({}, [pins, tails], away))).toContain("error:dovetail-not-corner");
  });

  it("type-mismatch: a tail count that is not a whole number", () => {
    expect(rules(corner({ tails: "5/2" }))).toContain("error:type-mismatch");
  });
});

describe("assembly rules", () => {
  it("overlap: two parts in the same space with no joint", () => {
    const p = boards(
      [host, host && { ...host, name: "Other" }],
      [hostAt, { name: "Other", part: "Other", at: ["1in", "1in", "0.25in"] }],
    );
    expect(rules(p)).toContain("error:overlap");
  });

  it("parts that only touch are not an overlap", () => {
    const p = boards(
      [host, { ...host, name: "Other" }],
      [hostAt, { name: "Other", part: "Other", at: ["0in", "0in", "3/4in"] }],
    );
    expect(rules(p)).toEqual([]);
  });

  it("definition-split: instances of one part that receive different cuts are told apart", () => {
    const bookcase = loadProject("bookcase");
    const lopsided: Project = {
      ...bookcase,
      joints: bookcase.joints.filter(
        (j) => j.params.depth !== "back_rabbet_depth" || j.host !== bookcase.instances[1]?.id,
      ),
    };
    const found = solve(lopsided, shop).diagnostics.find((d) => d.rule === "definition-split");
    expect(found?.severity).toBe("info");
  });
});

describe("keepsake box: the groove must land inside the half-pin", () => {
  it('warns for the spec\'s box (groove 1/4" up, 1/4" wide)', () => {
    const warnings = rules(loadProject("box")).filter(
      (r) => r === "warning:groove-outside-bottom-half-pin",
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("does not warn when the groove sits at the bottom edge, inside the half-pin", () => {
    // Bottom at z = 0 puts the groove in the first 1/4" of the board's width.
    const box = loadProject("box");
    const lowered: Project = {
      ...box,
      instances: box.instances.map((i) =>
        i.name === "Bottom" ? { ...i, position: { ...i.position, z: "0in" } } : i,
      ),
    };
    expect(rules(lowered)).not.toContain("warning:groove-outside-bottom-half-pin");
  });
});

describe("hidden roundover", () => {
  it("warns when a joint fully hides the rounded edge", () => {
    // A shelf's back edge butts the host face; rounding it is invisible.
    const part: PartSpec = {
      ...guest,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000901",
          type: "roundover",
          edges: ["end0/face0"],
          radius: "1/8in",
        },
      ],
    };
    const p = boards([host, part], [hostAt, standing(["2in", "2in", "3/4in"])], [dado()]);
    expect(rules(p)).toContain("warning:roundover-hidden");
  });

  it("does not warn for an exposed edge", () => {
    const part: PartSpec = {
      ...guest,
      ops: [
        {
          id: "01K7M3Q8ZD00000000F3000902",
          type: "roundover",
          edges: ["end1/face0"],
          radius: "1/8in",
        },
      ],
    };
    const p = boards([host, part], [hostAt, standing(["2in", "2in", "3/4in"])], [dado()]);
    expect(rules(p)).not.toContain("warning:roundover-hidden");
  });
});
