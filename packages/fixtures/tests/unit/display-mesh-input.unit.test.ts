// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

import { INCH } from "@kerf/core";
import { buildDisplayMesh, initGeometry, MeshError } from "@kerf/geometry";
import { beforeAll, describe, expect, it } from "vitest";

const inch = (n: number): number => n * INCH;

describe("the display mesh rejects unknown input with a MeshError", () => {
  beforeAll(async () => {
    await initGeometry();
  });
  const blank = { length: inch(12), width: inch(6), thickness: inch(0.75) };

  it.each([
    ["an unknown primitive kind", { kind: "sphere" }],
    [
      "an unknown prism plane",
      {
        kind: "trapezoidPrism",
        plane: "foo",
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        range: [0, 1],
      },
    ],
    ["a null entry", null],
    ["a box with fractional coordinates", { kind: "box", min: [0.5, 0, 0], max: [1, 1, 1] }],
  ])("%s", (_label, removal) => {
    expect(() => buildDisplayMesh(blank, [removal as never])).toThrow(MeshError);
  });
});
