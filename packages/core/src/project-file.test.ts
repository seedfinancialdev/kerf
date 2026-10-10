// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { ProjectFormatError, parseProject, serializeProject } from "./project-file";
import type { Project } from "./types";

/** Narrows a value that a test fixture is known to provide. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("fixture value is missing");
  return value;
}

const id = (n: number) => `01K7M3Q8ZD00000000A1${n.toString(16).toUpperCase().padStart(6, "0")}`;

const project: Project = {
  schemaVersion: 1,
  name: "Test",
  units: "metric",
  params: [{ id: id(1), name: "width", expr: "600mm", kind: "length" }],
  stock: [
    {
      id: id(2),
      name: "18 ply",
      kind: "sheet",
      thickness: 144000,
      sheet: { length: 19507200, width: 9753600, grain: "along-length" },
      allowance: { length: 0, width: 0 },
    },
  ],
  parts: [
    {
      id: id(3),
      name: "Panel",
      stock: id(2),
      length: "width",
      width: "300mm",
      grainLocked: true,
      ops: [{ id: id(4), type: "roundover", edges: ["edge1/face1"], radius: "3mm" }],
      source: { structure: id(9), role: "shelf" },
      detached: false,
    },
  ],
  instances: [
    {
      id: id(5),
      def: id(3),
      name: "Panel",
      position: { x: "0mm", y: "0mm", z: "0mm" },
      orientation: 7,
      mirrored: true,
    },
  ],
  patterns: [
    {
      id: id(6),
      source: id(5),
      count: "3",
      axis: "z",
      spacing: { mode: "distribute", from: "0mm", to: "900mm" },
    },
  ],
  joints: [{ id: id(7), type: "dado", host: id(5), guest: id(6), params: { depth: "6mm" } }],
  matchSets: [
    { id: id(8), name: "Wrap", type: "continuousGrain", members: [id(5)], axis: "length" },
  ],
  structures: [
    {
      id: id(9),
      type: "case",
      size: { w: "600mm", h: "900mm", d: "300mm" },
      options: { back: "inset-rabbet", grainWraps: true },
      openings: [
        {
          id: id(10),
          division: { type: "shelves", count: "3", spacing: "even" },
          children: [{ id: id(11), division: { type: "partition", at: "300mm" }, children: [] }],
        },
      ],
    },
  ],
};

describe("serializeProject", () => {
  it("writes sorted keys, 2-space indent and a trailing newline", () => {
    const text = serializeProject(project);
    expect(text.endsWith("}\n")).toBe(true);
    const keys = Object.keys(JSON.parse(text));
    expect(keys).toEqual([...keys].sort());
    expect(text).toContain('\n  "joints": [');
  });

  it("is a fixed point: parse then serialize gives the same text", () => {
    const text = serializeProject(project);
    expect(serializeProject(parseProject(text))).toBe(text);
    expect(parseProject(text)).toEqual(project);
  });

  it("refuses to save a float", () => {
    const bad = { ...project, stock: [{ ...(project.stock[0] as object), thickness: 1.5 }] };
    expect(() => serializeProject(bad as unknown as Project)).toThrow(/whole number/);
  });

  it("refuses to save fields the schema does not know (no derived data)", () => {
    const bad = { ...project, cutList: [] };
    expect(() => serializeProject(bad as unknown as Project)).toThrow(/unknown field/);
  });
});

describe("parseProject", () => {
  const text = serializeProject(project);
  type Raw = Record<string, unknown>;
  const first = (list: unknown): Raw => {
    const item = (list as Raw[])[0];
    if (!item) throw new Error("fixture list is empty");
    return item;
  };
  const tweak = (change: (raw: Raw) => void): string => {
    const raw = JSON.parse(text) as Record<string, unknown>;
    change(raw);
    return JSON.stringify(raw);
  };

  it("rejects invalid JSON", () => {
    expect(() => parseProject("{")).toThrow(ProjectFormatError);
  });

  it("rejects a newer schema version with a clear message", () => {
    expect(() =>
      parseProject(
        tweak((r) => {
          r.schemaVersion = 2;
        }),
      ),
    ).toThrow(/newer version/);
  });

  it("rejects an id that is not a ULID", () => {
    const raw = tweak((r) => {
      first(r.params).id = "param-1";
    });
    expect(() => parseProject(raw)).toThrow(/ULID/);
  });

  it("rejects an orientation outside 0-23, naming the field", () => {
    const raw = tweak((r) => {
      first(r.instances).orientation = 24;
    });
    expect(() => parseProject(raw)).toThrow(/instances\[0\]\.orientation/);
  });

  it("rejects an unknown unit system and an unknown joint type", () => {
    expect(() =>
      parseProject(
        tweak((r) => {
          r.units = "furlongs";
        }),
      ),
    ).toThrow(/units/);
    const raw = tweak((r) => {
      first(r.joints).type = "mortise";
    });
    expect(() => parseProject(raw)).toThrow(/joints\[0\]\.type/);
  });
});

describe("integrity checks at load", () => {
  const text = serializeProject(project);
  type Raw = Record<string, unknown>;
  const edit = (change: (raw: Raw) => void): string => {
    const raw = JSON.parse(text) as Raw;
    change(raw);
    return JSON.stringify(raw);
  };
  const list = (raw: Raw, key: string): Raw[] => raw[key] as Raw[];

  it("rejects a repeated id anywhere in the file", () => {
    const raw = edit((r) => {
      must(list(r, "stock")[0]).id = must(list(r, "params")[0]).id;
    });
    expect(() => parseProject(raw)).toThrow(/duplicate id/);
  });

  it.each([
    [
      "a part's stock",
      (r: Raw) => {
        must(list(r, "parts")[0]).stock = id(99);
      },
      /stock/,
    ],
    [
      "an instance's part",
      (r: Raw) => {
        must(list(r, "instances")[0]).def = id(99);
      },
      /def/,
    ],
    [
      "an instance's parent",
      (r: Raw) => {
        must(list(r, "instances")[0]).parent = id(99);
      },
      /parent/,
    ],
    [
      "a pattern's source",
      (r: Raw) => {
        must(list(r, "patterns")[0]).source = id(99);
      },
      /source/,
    ],
    [
      "a joint's host",
      (r: Raw) => {
        must(list(r, "joints")[0]).host = id(99);
      },
      /host/,
    ],
    [
      "a joint's guest",
      (r: Raw) => {
        must(list(r, "joints")[0]).guest = id(99);
      },
      /guest/,
    ],
    [
      "a match set member",
      (r: Raw) => {
        must(list(r, "matchSets")[0]).members = [id(99)];
      },
      /members/,
    ],
  ])("rejects a dangling reference: %s", (_label, change, pattern) => {
    expect(() => parseProject(edit(change))).toThrow(pattern);
  });

  it("keeps a __proto__ key instead of silently dropping it", () => {
    const withProto = text.replace(
      '"depth": "6mm"',
      '"__proto__": "1mm",\n          "depth": "6mm"',
    );
    const parsed = parseProject(withProto);
    const params = parsed.joints[0]?.params ?? {};
    expect(Object.keys(params).sort()).toEqual(["__proto__", "depth"]);
    expect(serializeProject(parsed)).toBe(serializeProject(parseProject(serializeProject(parsed))));
    expect(serializeProject(parsed)).toContain('"__proto__": "1mm"');
  });

  it("sorts keys by code point, not by UTF-16 unit", () => {
    const astral = "\u{1F600}";
    const sorted = serializeProject({
      ...project,
      structures: [
        {
          ...(project.structures[0] as object),
          options: { [astral]: "a", "\uFFFF": "b" },
        } as never,
      ],
    });
    expect(sorted.indexOf("\uFFFF")).toBeLessThan(sorted.indexOf(astral));
  });

  it("reports excessive opening nesting as a format error, not a crash", () => {
    let nested: Raw = { id: id(200), children: [] };
    for (let i = 0; i < 500; i += 1) nested = { id: id(201 + i), children: [nested] };
    const raw = edit((r) => {
      const structure = must(list(r, "structures")[0]);
      structure.openings = [nested];
    });
    expect(() => parseProject(raw)).toThrow(ProjectFormatError);
    expect(() => parseProject(raw)).toThrow(/too deeply nested/);
  });

  it("round-trips the optional shapes: list spacing, bays, fixed pattern, solid stock, price, parent, notes", () => {
    const rich = edit((r) => {
      const structure = must(list(r, "structures")[0]);
      structure.openings = [
        {
          id: id(300),
          division: { type: "shelves", count: "2", spacing: ["1in", "2in"] },
          children: [],
        },
        { id: id(301), division: { type: "bays", count: "3" }, children: [] },
      ];
      must(list(r, "patterns")[0]).spacing = { mode: "fixed", step: "10mm" };
      const stock = must(list(r, "stock")[0]);
      stock.solid = { standardLengths: [19507200], maxWidth: 1625600 };
      stock.price = { per: "boardFoot", cents: 1250 };
      must(list(r, "instances")[0]).parent = must(list(r, "instances")[0]).id;
      must(list(r, "parts")[0]).notes = "Glue up two boards";
    });
    const parsed = parseProject(rich);
    expect(serializeProject(parsed)).toBe(serializeProject(parseProject(serializeProject(parsed))));
    expect(parsed.parts[0]?.notes).toBe("Glue up two boards");
    expect(parsed.stock[0]?.price).toEqual({ per: "boardFoot", cents: 1250 });
  });

  it("rejects an edge ref that is not an edge/face pair and a non-string joint parameter", () => {
    const badEdge = edit((r) => {
      must((must(list(r, "parts")[0]).ops as Raw[])[0]).edges = ["edge2/face0"];
    });
    expect(() => parseProject(badEdge)).toThrow(/edge/);
    const badParam = edit((r) => {
      must(list(r, "joints")[0]).params = { depth: 6 };
    });
    expect(() => parseProject(badParam)).toThrow(/params\.depth/);
  });

  it("names a null optional field instead of calling it unknown", () => {
    const raw = edit((r) => {
      must(list(r, "parts")[0]).notes = null;
    });
    expect(() => parseProject(raw)).toThrow(/notes.*(null|expected a string)/);
  });
});
