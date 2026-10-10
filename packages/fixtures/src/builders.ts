// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Small hand-built projects for tests that need a precise geometric situation (two boards that
// touch in a particular way). The golden reference projects are for proving the spec's numbers;
// edge cases use these instead.

import type { Instance, Joint, MatchSet, PartDef, Pattern, Project, Stock } from "@kerf/core";
import { INCH } from "@kerf/core";

export const uid = (n: number): string =>
  `01K7M3Q8ZD00000000F3${n.toString(16).toUpperCase().padStart(6, "0")}`;

export interface PartSpec {
  name: string;
  length: string;
  width: string;
  thickness: string;
  stock?: "ply" | "wood";
  ops?: PartDef["ops"];
  /** Grain pins the part's length along the sheet. Defaults to true. */
  locked?: boolean;
}

export interface InstanceSpec {
  name: string;
  part: string;
  at: [string, string, string];
  orientation?: number;
  mirrored?: boolean;
}

export interface JointSpec {
  type: Joint["type"];
  host: string;
  guest: string;
  params?: Record<string, string>;
}

export interface Extras {
  patterns?: Array<{
    source: string;
    count: string;
    axis: Pattern["axis"];
    spacing: Pattern["spacing"];
  }>;
  matchSets?: Array<{
    name: string;
    type: MatchSet["type"];
    members: string[];
    axis?: MatchSet["axis"];
  }>;
  woodLengths?: number[];
  woodMaxWidth?: number;
  woodAllowanceLength?: number;
  /** Wood stock with no board sizes: it cannot be nested. */
  woodWithoutSizes?: boolean;
  plyGrain?: "along-length" | "none";
  units?: "imperial" | "metric";
}

export const PLY_ID = uid(1);
export const WOOD_ID = uid(2);

/** Names refer to parts and instances; ids are assigned in order. */
export function boards(
  parts: PartSpec[],
  instances: InstanceSpec[],
  joints: JointSpec[] = [],
  extras: Extras = {},
): Project {
  const stock: Stock[] = [
    {
      id: PLY_ID,
      name: "3/4 ply",
      kind: "sheet",
      thickness: (INCH * 3) / 4,
      sheet: { length: 96 * INCH, width: 48 * INCH, grain: extras.plyGrain ?? "along-length" },
      allowance: { length: 0, width: 0 },
    },
    {
      id: WOOD_ID,
      name: "4/4 wood",
      kind: "solid",
      thickness: INCH / 2,
      ...(extras.woodWithoutSizes
        ? {}
        : {
            solid: {
              standardLengths: extras.woodLengths ?? [96 * INCH],
              maxWidth: extras.woodMaxWidth ?? 8 * INCH,
            },
          }),
      allowance: { length: extras.woodAllowanceLength ?? 0, width: 0 },
    },
  ];
  const partId = new Map(parts.map((p, i) => [p.name, uid(100 + i)]));
  const instanceId = new Map(instances.map((x, i) => [x.name, uid(200 + i)]));
  const patternId = new Map<string, string>();

  const patterns: Pattern[] = (extras.patterns ?? []).map((p, i) => {
    const id = uid(400 + i);
    patternId.set(p.source, id);
    return {
      id,
      source: instanceId.get(p.source) as string,
      count: p.count,
      axis: p.axis,
      spacing: p.spacing,
    };
  });
  const resolve = (name: string): string => patternId.get(name) ?? (instanceId.get(name) as string);

  return {
    schemaVersion: 1,
    name: "Test",
    units: extras.units ?? "imperial",
    params: [],
    stock,
    parts: parts.map((p) => ({
      id: partId.get(p.name) as string,
      name: p.name,
      stock: p.stock === "wood" ? WOOD_ID : PLY_ID,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      grainLocked: p.locked ?? true,
      ops: p.ops ?? [],
    })),
    instances: instances.map(
      (x): Instance => ({
        id: instanceId.get(x.name) as string,
        def: partId.get(x.part) as string,
        name: x.name,
        position: { x: x.at[0], y: x.at[1], z: x.at[2] },
        orientation: x.orientation ?? 0,
        mirrored: x.mirrored ?? false,
      }),
    ),
    patterns,
    joints: joints.map((j, i) => ({
      id: uid(300 + i),
      type: j.type,
      host: resolve(j.host),
      guest: resolve(j.guest),
      params: j.params ?? {},
    })),
    matchSets: (extras.matchSets ?? []).map((m, i) => ({
      id: uid(500 + i),
      name: m.name,
      type: m.type,
      members: m.members.map((name) => instanceId.get(name) as string),
      ...(m.axis ? { axis: m.axis } : {}),
    })),
    structures: [],
  };
}
