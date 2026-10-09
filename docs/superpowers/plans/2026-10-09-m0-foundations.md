# M0 Foundations: implementation plan

Scope: Build plan, milestone M0. No feature code; every `core` function is a typed stub that throws
`NotImplemented`. Acceptance: "CI runs; every golden and E2E test exists and fails" (as expected failures).

Approved decisions: spec file mapping (docs/spec/); dado deeper than half the host is a warning; kerf
lives in the shop profile; two fixture variants per project (`project.json`, `structure.json`);
box cut list as a numbered match-set block; golden box expects the half-pin warning; unspecified
numbers are placeholders listed in `packages/fixtures/README.md`.

## Tasks

1. Repo: git init, GPL-3.0 LICENSE, import spec, branch `m0-foundations`, `git mv` into docs/spec, README, CLAUDE.md verbatim.
2. Workspace: pnpm, six packages, strict TypeScript, GPL header in every source file.
3. Tooling: Biome, Vitest (unit, golden, prop, bench projects), fast-check, Playwright, dependency-cruiser; scripts.
4. ADRs 001-011.
5. Core: types.ts from Domain model v0, INCH/MM, NotImplemented, typed stubs, output types.
6. Fixtures: both projects in two variants, shop profile, expected JSON, integrity tests.
7. Milestone helper + milestones.json; unit, golden, property, benchmark tests.
8. Playwright: 6-step bookcase flow plus resize to 30", PDF export; shell smoke test.
9. App shell: Vite + React, dark default, light theme, tokens, five module names.
10. CI: GitHub Actions on Depot runners.
11. Verify locally; push and confirm CI; finish branch.
