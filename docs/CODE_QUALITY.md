# Code quality standard

Kerf is open source. Anyone can read every line, so the code is part of what we ship, and the
bar is that reading it is a pleasure: a stranger should be able to open any file, understand what
it is for in a minute, and trust it. This document says what that means in practice. It sits
beside the testing standards (`docs/testing/`) and the architecture decisions (`docs/adr/`).

## The bar

> Would a skeptical expert, reading this file on GitHub with no context, think the author cared?

If the honest answer is "not yet", the change is not done.

## Rules

### Shape
1. **One job per module.** A file's header comment says what it is for in one or two sentences and
   points at the spec section it implements. If the header needs "and", split the file.
2. **Small functions.** A function fits on one screen and does one thing. Extract with a name that
   explains the step; a long function with section comments is a short function waiting to be born.
3. **No dead code.** No unused exports, parameters, branches, feature flags or commented-out code.
   Git remembers.
4. **No scratch.** No debug output, no `TODO` without an issue number, no files that are not part of
   the product, the tests, the docs or the tooling.

### Names
5. **Domain words.** A woodworker's term wins over a programmer's: `shoulder`, `dado`, `rabbet`,
   `offcut`, `kerf`. Units are in the name or the type when they could be confused.
6. **Say what, not how.** `snapToGrid`, not `roundIt`; `seatOf`, not `getStuff`.

### Types and errors
7. **Make illegal states unrepresentable** where the language allows; prefer a union to a bag of
   optionals. Integers for lengths, exact rationals for ratios, never floats.
8. **Typed errors with an instruction.** An error names what is wrong and what to do about it, in
   shop language. A function that accepts untrusted input returns a diagnostic or throws a typed
   error; it never leaks a raw `TypeError`.
9. **No silent fallbacks.** If the code cannot honour a request it says so (a diagnostic, a typed
   error). Nothing is quietly ignored.

### Comments and docs
10. **Why, not what.** Comments carry intent, rules, and links to the spec or ADR. A comment that
    restates the next line is deleted; a comment that has become false is a bug.
11. **Public API is documented.** Every exported function states what it does, its units, and what
    it can throw, in the form a user of the library needs.
12. **Decisions are written down.** A rule the spec does not give is an ADR entry with its reasons
    and a plain statement that the maintainer must confirm it.

### Behaviour
13. **Pure and deterministic.** `core` has no clock, randomness, I/O or hidden state. The same input
    gives byte-identical output.
14. **Boundaries are explicit.** Packages depend in one direction (`docs/adr/`, dependency rules in
    CI). Nothing reaches across them.
15. **Fast enough, and measured.** Budgets from the spec are benchmarks that fail CI.

### Tooling (enforced, not hoped for)
16. **Lint, format and types clean with warnings treated as errors.** `pnpm lint` and
    `pnpm typecheck` pass with no warning of any kind.
17. **Every source file has the licence header**, checked in CI.
18. **Tests read as documentation** and follow `docs/testing/`: expected values from the spec or a
    hand calculation; one scenario per test; names state the behaviour.

## Before opening a pull request

- Read the diff as a stranger. Delete what is not needed. Rename what is unclear.
- No warnings, no stray files, no leftover scratch tests.
- Public functions documented; ADR updated for any rule you chose.
- State plainly in the PR what is *not* done.
