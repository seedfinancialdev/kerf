# Mutation testing

A passing test suite says the code agrees with the tests. It does not say the tests would notice a
mistake. Mutation testing asks that directly: change one line of the source into a plausible
mistake (a `<` for a `<=`, a dropped term, a swapped axis), run the tests, and see whether any of
them fails. A change nobody notices is a **surviving mutant**, and means either a missing test or
a change that does not matter.

## Running it

```
pnpm mutate                    # every mutant, a couple of minutes
pnpm mutate -- --only rabbet   # mutants whose id or file contains "rabbet"
pnpm mutate -- --list          # what there is, without running
```

The script edits the source file in place and always puts it back, even if you interrupt it. It
refuses to touch a file with uncommitted changes. Run it on a clean tree.

Each mutant is one entry in `scripts/mutation/mutants/*.json`:

| Field | Meaning |
| --- | --- |
| `id` | A short stable name. |
| `file` | The source file, from the repository root. |
| `find` | The exact text to replace. It must occur exactly once in the file. |
| `replace` | What it becomes. |
| `why` | The mistake it stands for, in one sentence. |
| `equivalent` | Optional. Present only when the change cannot be observed, and says why. |

## What the result means

- **killed**: a test failed. Good.
- **survived**: nothing failed. Write the test that should have caught it (from the spec or a hand
  calculation, as always), or, if the change really cannot matter, add `equivalent` with the
  reason. An unexplained survivor fails the run.
- **no longer apply**: the source moved and `find` matches nothing. Update or remove the mutant;
  stale mutants silently stop protecting anything otherwise.

## Adding mutants

Add one when you fix a bug or write a boundary: the mistake that nearly shipped is the best mutant.
Keep them small and realistic. A mutant that no sensible author would write is noise.

CI does not run this on every push because it takes minutes; it runs on demand
(`.github/workflows/mutation.yml`) and before a milestone is declared done.
