# ADR 012: M1 model and solver rules

Status: Accepted (maintainer approved decisions D1-D5 on the M1 plan, and the four review rulings
below, during the M1 review)

## Context

M1 implements what Domain model v0 describes in prose. Where the spec was silent or ambiguous the
maintainer was asked; independent review of the first M1 implementation then found places where the
code was looser than the spec or failed ungracefully. This record fixes both.

## Decisions

| # | Decision |
| --- | --- |
| D1 | Orientation index = 4 × direction + spin; full table in ADR 003 (addendum). |
| D2 | A pattern's `distribute` `from`/`to` is the span being divided; members are spaced with equal air gaps inside it, each position snapped once. |
| D3 | Canonical project.json: keys sorted by Unicode code point, 2-space indent, trailing newline. |
| D4 | `solveModel` runs pipeline steps 1-3 (parameters, parts, instances and patterns). `solve` stays `NotImplemented` until M2. |
| D5 | Expression scope values carry their kind (`{ value, kind }`). |
| R1 | **Snapping happens once, at the end of each field.** Other fields that refer to a length use its exact value; only the stored, displayed result is snapped. (`1in/3` then `×3` is exactly 1".) |
| R2 | **Type rules are exactly the spec's:** length ± length = length; length × count = length; length ÷ length = ratio; length ÷ count = length (the spec's `3/4" / 3`); anything else is an error. Counts and ratios combine freely. A fraction such as `0.5` is a ratio, so `width * 0.5` is an error; write `width / 2`. |
| R3 | A part length, width or thickness that is zero, negative or rounds to zero is an error (`invalid-dimension`). |
| R4 | The reference fixtures carry real orientations so each project assembles to its overall size (bookcase 36 x 12 x 72 in, box 10 x 6 x 4 in). Recorded as a `FIXTURE:` change; only orientation numbers changed. |
| R5 | **A parameter's declared kind is authoritative.** A parameter declared `ratio` is a ratio even when its expression is a whole number, so it cannot scale a length; a `count` must come out a whole number of zero or more. |

## Behaviour that follows

- **No exceptions for bad data.** `solveModel` returns diagnostics. A project that is the wrong
  shape, reuses an id or has a dangling reference returns one `invalid-project` error and an empty
  model. Anything unexpected inside the solver is an `internal-error` diagnostic, not a throw.
- **Solving reads a validated copy** of the project, never the object passed in, so what was
  checked is exactly what is solved.
- **Ids are never reused** and references must resolve (including a part's `source.structure`);
  an instance may not be its own ancestor, a match set may not list a member twice, and a joint
  may not join a part to itself. All of this is enforced when a file is read.
- **Defaults are solved like any other field:** a part's thickness taken from its stock is
  snapped to the grid and range-checked.
- **Patterns step from exact values:** a fixed-step pattern snaps each member once, so rounding
  error never accumulates along the pattern.
- **No recursion limits:** dependency ordering is iterative, so a chain of any length solves.
- **Limit failures** (length, expression size or nesting, number size) are reported under the rule
  `limit-exceeded` or `out-of-range`, not `expression-syntax`.
- **Limits** (each is a diagnostic or format error, never a crash): length at most 100,000 inches;
  expression at most 1,000 characters and 64 levels deep; numbers at most 1,024 bits; pattern
  count 1 to 10,000; openings nested at most 32 deep; `.kerf` entries at most 32 MiB
  (`project.json`), 64 KiB (`meta.json`) and 8 MiB (`thumbnail.png`).
- **Names are never looked up on the object prototype** (`toString`, `constructor`, `__proto__`
  are ordinary unknown names). `__proto__` cannot be a parameter name; as a record key in a file
  it is preserved.
- **`.kerf` reading is strict:** unknown entries, repeated entries and unknown meta fields are
  errors; sizes are checked on both the declared and the extracted size; text must be valid UTF-8;
  the thumbnail must be a PNG; and writing refuses meta or a thumbnail it could not read back.
  Output is deterministic (fixed ZIP epoch, independent of the local clock and time zone).
- **Not applied by `solveModel`:** joints, match sets and structures (later stages). `Instance.parent`
  is reported as `not-solved-yet` because ignoring it would place the part in the wrong frame.
- **Literals:** exact decimals (`12.5mm`) and one optional space before `in`/`mm` (`36 in`) are
  accepted; `"` inside a stock name is written `\"`. `round` rounds exact halves to even, matching
  snapping. The spec lists none of these explicitly.
- **Known limitations:** a part whose name starts with a digit cannot be referenced from another
  expression (`2nd shelf`); it still solves. Zip entry checksums (CRC) are not verified; corrupt
  content is caught by the project and meta validation instead.

## Consequences

- Tests encode each rule above: `packages/core/src/**/*.test.ts` and
  `packages/fixtures/tests/unit/solve-hardening.unit.test.ts`.
- Two M1 tests written in M0 were adjusted for D4 and D5; no golden expected output changed.
