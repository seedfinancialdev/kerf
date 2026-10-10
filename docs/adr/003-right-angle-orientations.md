# ADR 003: Right-angle orientations only in the prototype

Status: Accepted (signed off Oct 9, 2026)

## Context

Positions must stay exact integers (ADR 002).

## Decision

"Axis-aligned parts only in the prototype. Every part sits in one of 24 right-angle orientations. Angled and splayed parts are v2. This keeps positions exact integers." (Domain model, decision 2)

## Consequences

- `Instance.orientation` is an index, 0-23.
- "Angled parts, curved 2D profiles, assemblies beyond one level" are out of the prototype; "each is an additive schema change, so none forces a rewrite."
- Dovetail slopes are stored as ratios (1:6, 1:8), not degrees.

## Addendum (M1, decision D1): the orientation index table

The spec stores `Instance.orientation` as an index 0-23 without saying which rotation each index is.
Index = 4 × direction + spin.

- **direction** (0-5): where the part's local X (length) axis points in the parent frame: +X, -X, +Y, -Y, +Z, -Z.
- **spin** (0-3): quarter turns about that direction. Spin 0 puts local Y on a reference axis (+Y for X directions, +Z for Y directions, +X for Z directions); each step is a right-handed quarter turn about the new X axis.
- Local Z is always X × Y, so every orientation is a proper rotation (no mirroring; mirroring is the separate `mirrored` flag). Index 0 is the identity.

A part's position is the minimum corner of its bounding box in the parent frame.

| Index | Local X → | Local Y → | Local Z → |
| --- | --- | --- | --- |
| 0 | +X | +Y | +Z |
| 1 | +X | +Z | -Y |
| 2 | +X | -Y | -Z |
| 3 | +X | -Z | +Y |
| 4 | -X | +Y | -Z |
| 5 | -X | -Z | -Y |
| 6 | -X | -Y | +Z |
| 7 | -X | +Z | +Y |
| 8 | +Y | +Z | +X |
| 9 | +Y | +X | -Z |
| 10 | +Y | -Z | -X |
| 11 | +Y | -X | +Z |
| 12 | -Y | +Z | -X |
| 13 | -Y | -X | -Z |
| 14 | -Y | -Z | +X |
| 15 | -Y | +X | +Z |
| 16 | +Z | +X | +Y |
| 17 | +Z | +Y | -X |
| 18 | +Z | -X | -Y |
| 19 | +Z | -Y | +X |
| 20 | -Z | +X | -Y |
| 21 | -Z | -Y | -X |
| 22 | -Z | -X | +Y |
| 23 | -Z | +Y | +X |
