# Unit Test Standard

> A decision document, not a tutorial. Every rule answers a question that came up while building
> Kerf. For golden, property, benchmark and end-to-end tests, see
> [INTEGRATION_TEST_STANDARD.md](./INTEGRATION_TEST_STANDARD.md).
>
> Modelled on the leados standards, adapted to a pure-TypeScript codebase with no database and no
> external services. What changed and why is listed in [Section 12](#12-what-differs-from-leados).

---

## Why this exists

During M1 the first set of tests was written beside the code it tested. Two independent reviews
then found a dozen real defects the tests had missed: crashes on hostile input, silently accepted
nonsense, a whole module with no tests, and property tests that never ran the code. Each rule below
exists to stop one of those from happening again.

**Boy Scout rule (a completion gate, not a suggestion).** If you touch an area and meet a test that
breaks these rules (wrong name, missing scenario, expected value of unknown origin), fix it before
finishing. The only exception is a fix that needs files far outside your change; open a GitHub
issue and say so in the PR.

---

## 1. What "unit" means in Kerf

`packages/core` is pure: no DOM, no network, no clock, no randomness, no other package. A unit test
calls a function with data and checks the result. There is nothing to mock.

| Size | What | Runs with | Budget |
| --- | --- | --- | --- |
| Small (unit) | One module of one package | `pnpm test` (project `unit`) | < 100 ms per file |
| Medium | Several packages, fixtures, random edits, timing | `pnpm test:golden`, `test:prop`, `bench` | seconds |
| Large | The real app in a browser | `pnpm e2e` | tens of seconds |

Medium and Large are in [INTEGRATION_TEST_STANDARD.md](./INTEGRATION_TEST_STANDARD.md).

---

## 2. File location

| Test of | Lives in | Name |
| --- | --- | --- |
| A module in `packages/<pkg>/src/` that needs nothing from another package | Next to it | `<module>.test.ts` |
| Behaviour that spans packages, or that needs the fixtures | `packages/fixtures/tests/unit/` | `<topic>.unit.test.ts` |

- `packages/core` may not import another package, even in a test (dependency-cruiser enforces
  this). Anything that needs `@kerf/fixtures` therefore lives in `packages/fixtures/tests/unit/`.
- One test file per module. Name the file for the contract, never for a ticket.
- Always `.test.ts` / `.test.tsx`. Never `.spec.ts` (the Playwright files under `e2e/` use
  `.spec.ts` because Playwright requires its own suffix).

---

## 3. Mock policy

```
Is it code inside packages/core?          -> do not mock. Use the real thing.
Is it another Kerf package?               -> do not mock. Use the real thing.
Is it a file, network or clock boundary
  (only io / pdf / app / fixtures loaders) -> prefer an in-memory input (bytes, strings).
                                             Mock only if a real one is impossible, and say why.
```

A mock in `core` is a design smell: either the function is doing I/O it should not, or the test is
asserting on how the code works instead of what it does. Stop and ask before adding one.

Pure helpers are never mocked: `withParam`, `loadProject`, `loadExpected` and the `milestone`
helper are real code and are used as they are.

---

## 4. Where an expected value comes from (the Source Rule)

This is the most important rule in the document.

An expected value must come from, in order of preference:

1. **The spec.** A table row or sentence in `docs/spec/`. Cite it in a comment (file and section).
2. **A hand calculation** written out in a comment, short enough to check by eye
   (`// 36 - 2 x 23/32 = 34-9/16`).
3. **An independent oracle**: a second source that does not share the code under test (the ADR 003
   orientation table typed into the test, a metric value worked out separately).

It must **never** come from running the code and pasting the result. A test written that way only
proves the code agrees with itself.

Fixtures are copied from the spec exactly. Do not recompute them. If two spec tables disagree, stop
and ask.

```typescript
// Good: the number is traceable.
// Operation specs, "Golden test: bookcase": 36 - 2 x 23/32 + 2 x 1/4 = 35-1/16.
expect(shelf.cutLength).toBe(7_124_700);

// Bad: where did 7124700 come from?
expect(shelf.cutLength).toBe(7124700);
```

---

## 5. Red before green

Every new test is seen failing, for the right reason, before the code that makes it pass exists.
Say what you saw in the commit or PR ("failed with `NotImplemented`", "failed: expected 21, got 20").

Why "for the right reason": a test that fails because of a typo in the test passes the moment the
typo is fixed, proving nothing. The milestone mechanism (Integration standard, Section 7) and its
audit exist to catch exactly this.

---

## 6. A test must be able to fail

Reject any test that cannot fail. Common ways a test becomes vacuous, all of which happened:

| Smell | Example | Fix |
| --- | --- | --- |
| Checks a constant, not behaviour | `expect(INCH).toBe(203200)` standing in for "units work" | Call the function that uses it |
| Property test that never calls the code | Random edits only change strings that are never solved | Solve, then assert on the result |
| `toThrow()` with no type | Passes on `NotImplemented`, a `TypeError` crash, or the right error | Use `expectRealError`, or assert the error class |
| Assertion restates the fixture | Expected value read from the same file the input came from | Take it from the spec (Section 4) |
| The title lies | "6 non-shelf placements" asserting 9 | The title states the asserted fact |
| Tolerance hides the bug | `toBeLessThanOrEqual(1/64")` when exactness is the rule | Assert the exact integers |

---

## 7. Naming

```
describe('<function, class or module>')
  describe('<condition>')                 [only when several cases share it]
    it('<verb> <result> when <condition>')
```

- Present tense, declarative: `rejects a bare number`, `returns exact thirds`.
- No "should", no "correctly", no "properly": say the actual result.
- A bad name is one that does not tell you what broke: `works`, `handles errors`, `test snapping`.

Examples from this repo:

```typescript
describe('parseLength()')
  it('rejects a bare number, because a length needs a unit')
describe('solveModel()')
  it('names every member of a dependency cycle in one diagnostic')
```

---

## 8. Assertions

### Behaviour, not implementation

Ask: could this assertion fail if the internals were rewritten but the behaviour kept? If yes, it is
testing the implementation. In `core` there are no mocks to assert on, so this mostly means: assert
on returned data, never on private state or call order.

### Exactness

| Situation | Use |
| --- | --- |
| A length, count or index | `toBe` on the integer |
| A rational | `toEqual({ num, den })` with `bigint` |
| Part of an object | `toMatchObject` |
| A list in order | `toEqual([...])` (order is often part of the contract) |
| "Close enough" for a length | **Never.** The model is exact integers |

The only fuzzy number allowed is one the spec itself calls approximate (the "about 46%" sheet
efficiency).

### Errors and diagnostics

- Assert the **rule id, severity and field**, not the message wording.
- `solveModel` and the loaders return diagnostics; they must never throw for bad data. Test both:
  that the diagnostic is right, and that nothing was thrown.
- For code that does throw, assert the class (`ExpressionError`, `ProjectFormatError`,
  `KerfFormatError`), not just "something threw".

### One scenario per `it()`

More than four or five assertions about different conditions means split it.

---

## 9. Coverage contract

### Minimum for any function

- [ ] Happy path with representative inputs
- [ ] Every error the function documents or explicitly handles
- [ ] Empty, zero, negative and boundary inputs where it accepts them

### Additional scenarios by risk tier

**Tier 1: Exactness** (anything that decides a size, count, or what wood to buy)
- [ ] Each rounding rule has a **tie** case and cases either side of it
- [ ] Both unit systems
- [ ] Integers only: no float appears in any output
- [ ] Resizing keeps joinery and thickness true

**Tier 2: Untrusted input** (expression text, `project.json`, `.kerf`, `.skp`, plan files)
- [ ] Every documented limit tested **at** the limit and **one past** it
- [ ] Garbage, empty, huge, deeply nested, repeated and wrong-typed input
- [ ] Names that collide with object prototypes (`toString`, `constructor`, `__proto__`)
- [ ] Returns a diagnostic or a typed error. Never a raw `RangeError`, `TypeError` or hang

**Tier 3: Persistence** (anything saved or loaded)
- [ ] load -> save is byte-identical
- [ ] Nothing derived is ever written
- [ ] Unknown fields and entries are rejected, not dropped
- [ ] Older versions migrate forward only; newer versions are refused with a clear message

**Tier 4: Derivation** (solver, cut list, nesting, machining)
- [ ] Pure: the input is not mutated, and the same input twice gives the same output
- [ ] Deterministic ordering of results
- [ ] A failure upstream removes only what depends on it, with exactly one diagnostic

**Tier 5: Diagnostics**
- [ ] Every rule id has at least one test with its triggering input, severity and field

### What "done" does NOT require

- 100% line coverage. Coverage shows what ran, not what was proven.
- Testing private functions directly, or testing the test framework.

---

## 10. Fixtures

- **Never edit a golden file to make a test pass.** (Also in `CLAUDE.md`.)
- A fixture change is its own commit whose message starts `FIXTURE:` and states the reason, and it
  needs the maintainer's review.
- Tests never mutate a fixture. Use `withParam` (returns a copy) or build a small inline project.
- Edge cases use a **minimal inline project**, not the golden projects. The golden projects exist to
  prove the spec's numbers; they should not be bent into test rigs.

---

## 11. Template

```typescript
// Kerf header (see any source file)

import { describe, expect, it } from 'vitest';
import { snapToGrid, rational } from './length';

// Domain model v0, "Units & precision": snapping rounds half to even, once.
describe('snapToGrid()', () => {
  describe('when the value is exactly between two grid lines', () => {
    it('rounds to the even grid step', () => {
      // 1/128" is half of one 1/64" step (3175 units): 0.5 steps -> step 0.
      expect(snapToGrid(rational(3175n, 2n), 'imperial')).toBe(0);
      // 3/128" is 1.5 steps -> step 2.
      expect(snapToGrid(rational(9525n, 2n), 'imperial')).toBe(6350);
    });
  });
});
```

---

## 12. What differs from leados

| leados | Kerf | Why |
| --- | --- | --- |
| `vi.mock`, `vi.hoisted`, class-constructor mocks | No mocks in `core` | Pure code has nothing to mock |
| Test tree `tests/unit/...` for apps, `__tests__/` for packages | Co-located `*.test.ts`, cross-package in `packages/fixtures/tests/` | `core` cannot import fixtures |
| Risk tiers: money, auth, sagas, idempotency | Tiers: exactness, untrusted input, persistence, derivation, diagnostics | Different risks |
| Supabase / Stripe / ClickUp | None; GitHub issues | No backend |
| (not stated) | Source Rule, red-before-green, vacuity list | Learned from M1 |

## 13. Quick reference

```
Where does the expected value come from?  spec -> hand calc -> independent oracle. Never the code.
Did I see it fail for the right reason?    yes / no
Could this test ever fail?                 yes / no
Mock in core?                              no
Error assertion?                           rule id + severity + field, or the error class
Limit?                                     test at it and one past it
Name?                                      verb + result + when condition; no "should"
```
