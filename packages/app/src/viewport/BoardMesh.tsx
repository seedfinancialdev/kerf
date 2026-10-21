// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// How one placed board looks in 3D, and nothing else: its cuts (or its plain blank), where the
// engine places it, in its wood's colour. It reads no store and hears no pointer, so the Workshop's
// model (Board.tsx) and New project's preview (Preview.tsx) draw boards the same way.

import { useEffect, useMemo } from "react";
import { Matrix4 } from "three";
import { matrixOf } from "../scene/frames";
import { geometryOf } from "./board-geometry";
import type { BoardLook } from "./board-looks";
import type { MeshResult } from "./meshes";

/**
 * One board drawn from `look`: the cut shape `built` (from `meshFor`) when it was built, else the
 * plain blank of the board's size; coloured `color`, and lit with `glow` when given (a CSS colour).
 */
export function BoardMesh({
  look,
  color,
  built,
  glow,
}: {
  look: BoardLook;
  color: string;
  built: MeshResult | undefined;
  glow?: string;
}) {
  const { placed } = look;
  const { length, width, thickness } = placed.size;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the size is read through its three numbers, so an equal size from a new solve keeps the geometry.
  const geometry = useMemo(() => geometryOf(built, placed.size), [built, length, width, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const matrix = useMemo(() => new Matrix4().fromArray(matrixOf(placed.frame)), [placed.frame]);
  return (
    <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false}>
      <meshStandardMaterial
        color={color}
        emissive={glow ?? color}
        emissiveIntensity={glow ? 0.35 : 0}
      />
    </mesh>
  );
}
