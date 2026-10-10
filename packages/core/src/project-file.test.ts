// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from "vitest";
import { ProjectFormatError, parseProject, serializeProject } from "./project-file";
import type { Project } from "./types";

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
