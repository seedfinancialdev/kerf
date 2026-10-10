# ADR 001: TypeScript core, pure, no UI dependencies

Status: Accepted

## Context

- Product spec: "Furniture models are hundreds of parts, not millions of faces, so TypeScript is fast enough, and one language keeps agent-driven development simple."
- Product spec: "The core has no UI or rendering dependencies, so it runs in tests, on a server (plan previews), and could be ported to Rust later without touching the UI."
- Stack option B (Rust core compiled to WASM + native) is "Slower iteration, two languages at the UI boundary"; verdict: "Revisit if A hits performance limits".

## Decision

Core language: "TypeScript, pure core with no UI dependencies." Why: "One language, fastest iteration; port to Rust only if benchmarks fail" (Prototype plan, Decisions locked).

"The core package is pure TypeScript and is the only source of truth; everything else depends on it, never the reverse." (Build plan)

## Consequences

- `packages/core` imports nothing from other packages, the DOM, React or three.js. dependency-cruiser enforces this (Build plan, Tooling).
- Agents must not "introduce floats, a new geometry kernel, or a state library inside `core`" (Build plan).
- Benchmarks (solve under 100 ms on the bookcase; nesting under 1 s for 100 parts) are the trigger for revisiting Rust.
