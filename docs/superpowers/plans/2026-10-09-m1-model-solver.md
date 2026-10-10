# M1 Model + solver: implementation plan

Scope (Build plan, M1): units, rationals, expressions, part graph, patterns, solve pipeline steps
1-3, `.kerf` I/O. No joinery, cut list, nesting or machining (M2).

Acceptance (Build plan): "Domain invariants pass; load → save byte-identical; parameter cycles
reported." Concretely, these M1-gated tests become real passes when `M1` is set to `true` in
`milestones.json`:

- `units-expressions.unit.test.ts`: 13 tests (parse, format, snap, expressions, cycle)
- `project-io.unit.test.ts`: 6 tests (byte-identical round trip, no derived data, `.kerf` zip; both projects)
- `domain-invariants.prop.test.ts`: 3 tests, 1,000 random edits each (integers only, byte-identical, no derived data)

Every M2-M5 test must keep failing for the right reason (`NotImplemented`); the milestone audit
from M0 (activate all, read the errors) is repeated before the PR.

## Decisions to settle before code

| # | Decision | Proposal |
| --- | --- | --- |
| D1 | Orientation index table (0-23) is undefined in the spec | 6 directions for local X (+X, -X, +Y, -Y, +Z, -Z) × 4 spins about it; index 0 is identity; full table written into ADR 003 and signed off first |
| D2 | `distribute` spacing: are `from`/`to` the span or the first/last positions? | The span being divided; N members are spaced evenly inside it |
| D3 | Canonical JSON key order | Keys sorted by code point, 2-space indent, trailing newline (what the fixtures already use) |
| D4 | `solve` at M1 | Add `solveModel` (steps 1-3: parameters, part sizes, instances and patterns). `solve` stays `NotImplemented` until M2, so M2 tests cannot pass by accident. The cycle test calls `solveModel` |
| D5 | `evaluateExpression` scope carries each value's kind (length / count / ratio) | Scope values become `{ value: Rational, kind }`; one M1 test adjusted to match |

## Task order (each: failing test → implementation → property check where one exists)

1. **Rationals and lengths.** bigint rationals, always reduced; parse and format imperial and metric; snap once, half to even.
2. **Expression engine.** Lexer, parser, evaluator; literals, operators, references, functions; length/count/ratio type rules; errors point at the field.
3. **Parameter graph.** Dependency order, cycle detection naming every member, diagnostics.
4. **Part sizes and patterns.** Evaluate length/width/thickness and snap; expand patterns into instances; mirrored and orientation handled via D1.
5. **Canonical project file.** `serializeProject` / `parseProject` with shape validation (reject floats and unknown schema versions).
6. **`.kerf` zip.** `readKerf` / `writeKerf` in `io` (adds `fflate`); `meta.json`; migration hook that only migrates forward.
7. **Acceptance.** Activate M1, full suite, repeat the milestone audit, update ADR 003, PR.

## Quality rules for this milestone

- `core` stays free of floats for lengths, DOM, and other packages (dependency-cruiser enforces).
- One concern per module; no `any`; exhaustive `switch`es; errors are typed classes, never bare strings.
- Every public function has a doc comment citing the spec section it implements.
- Fixtures are not edited. Any needed change is raised as a `FIXTURE:` proposal.
