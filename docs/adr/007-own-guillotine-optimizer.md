# ADR 007: Own guillotine optimizer; OpenCutList as benchmark

Status: Accepted

## Context

"OpenCutList's engine is Ruby, tied to SketchUp's data model, and currently being rewritten in C++; our version needs integer units, grain locks and match sets built in from the start." (Cut list & nesting)

"OpenCutList is GPL-3.0, compatible with the planned GPL core, so porting its nesting logic is legally clean with attribution." (Product spec)

## Decision

"We implement a standard guillotine bin-packing heuristic in TypeScript rather than porting OpenCutList." "Known pattern, flagged: guillotine packing with multi-start heuristics is textbook; the value is in the woodworking constraints around it, not the algorithm."

## Consequences

- "OpenCutList's results on the reference projects are the bar to match or beat."
- The optimizer lives in `core` (Build plan: nesting is part of `core`). The Product spec's earlier "WASM module" wording for the optimizer is superseded by this decision.
- Budget: runs off the main thread, debounced after edits; under 1 second for 100 parts.
- Free-form CNC nesting is v2.
