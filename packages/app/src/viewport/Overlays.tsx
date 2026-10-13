// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// Lines drawn over the model, not part of it: the grain on the hovered board and the Tape's guide
// lines (Interaction spec, "Viewport (center)" and "Tape").

import type { PlacedPart } from "@kerf/core";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { inches, matrixOf, toScene } from "../scene/frames";
import { useKerf } from "../state/useKerf";

/** A line along the hovered board's length, on its show face: the grain direction. */
export function GrainLine({ placed, color }: { placed: PlacedPart; color: string }) {
  const geometry = useMemo(() => {
    const m = matrixOf(placed.frame);
    const v = inches(placed.size.width) / 2;
    const w = inches(placed.size.thickness) + 0.02;
    const at = (u: number): number[] =>
      [0, 1, 2].map(
        (r) => (m[r] ?? 0) * u + (m[4 + r] ?? 0) * v + (m[8 + r] ?? 0) * w + (m[12 + r] ?? 0),
      );
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([...at(0), ...at(inches(placed.size.length))]), 3),
    );
    return g;
  }, [placed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** The Tape's guide lines, dashed, kept for the session (ADR 015, D6). */
export function Guides({ color }: { color: string }) {
  const guides = useKerf((s) => s.guides);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const points = guides.flatMap(([a, b]) => [...toScene(a), ...toScene(b)].map(inches));
    g.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return g;
  }, [guides]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (guides.length === 0) return null;
  return (
    <lineSegments geometry={geometry} onUpdate={(line) => line.computeLineDistances()}>
      <lineDashedMaterial color={color} dashSize={1} gapSize={0.5} />
    </lineSegments>
  );
}
