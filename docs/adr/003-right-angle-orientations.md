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
