# ADR 009: OpenSKP for .skp import, not the Trimble SDK

Status: Accepted

## Context

Product spec, risk "`.skp` import blocked by license": "Official SDK ruled out: native Windows/Mac only, no Linux, web or server use, public redistribution unresolved."

## Decision

"Use OpenSKP (MIT, TypeScript, reverse-engineered, reads SketchUp 2013+); fallback is OBJ/DAE export." (Product spec)

Prototype plan: ".skp import | OpenSKP (MIT) | Official SDK has no web, Linux or server build".

## Consequences

- "Imports parts and assemblies, not joinery."
- "Remaining risk: parser breaks on a new SketchUp release."
- Prototype spike: 8 of 10 woodworking files from 3D Warehouse import with correct part dimensions; if it fails, "Ship OBJ/DAE fallback only" (Prototype plan, question 6).
- Lives in the `io` package (M5).
