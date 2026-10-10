# @kerf/fixtures

Golden inputs and expected outputs for the two reference projects (Prototype plan, "Reference
projects"). **Never change a golden file to make a test pass.** A change to any file here needs a
commit message line starting `FIXTURE:` and a review (Build plan, Test harness).

## Layout

| Path | What |
| --- | --- |
| `bookcase/project.json`, `box/project.json` | Explicit part graph: defs, instances, patterns, joints, match sets. Input for M1-M2. |
| `bookcase/structure.json`, `box/structure.json` | The same piece as a structure form (case / box with openings). Input for M3. |
| `*/expected/*.json` | Expected outputs, copied from the Operation specs and Cut list & nesting tables. |
| `shop-profile.json` | Kerf 1/8", dado stack, router with a 1/8" roundover bit, hand tools for dovetails. |

All lengths are integers in internal units (1 in = 203,200). Files are canonical JSON: sorted keys,
2-space indent, trailing newline. IDs are hard-coded ULIDs.

Expected files may carry annotation keys that start with `_` (never compared by tests):

- `_spec`: JSON pointer → the fraction the spec prints (`"35-1/16\""`). The integrity test checks
  each integer equals its fraction.
- `_note`, `_text`: the spec's own wording, for reviewers.

## Assumptions and gaps (the spec does not say; confirm or correct)

1. **Orientation indices.** The spec stores orientation as 0-23 but never defines the table. All
   instances use `0` and positions are expressions in an assumed frame. No golden depends on them.
2. **Distribute spacing.** `Pattern.spacing.distribute` does not say whether `from`/`to` are the span
   or the first/last positions. The bookcase uses the interior span between top and bottom.
3. **Pattern count.** `count` is taken as the total number of members, including the source instance.
4. **Joints per mirrored side.** One joint per host instance (left and right side each host their own
   dados and rabbets), matching "12 cuts… on the 2 sides".
5. **Groove is a `dado` joint.** The Joint type union has no `groove`.
6. **Dovetail slope** is the string `"1:8"`; the expression grammar has no ratio literal.
7. **Shop profile values not in the spec:** dado stack max width 3/4" (any value ≥ 23/32" works),
   no straight bits, hand tools can cut dovetails.
8. **Stock values not in the spec:** 1/4" plywood is 1/4" actual (the goldens only work at 1/4");
   walnut allowance is length 0, width 1/4"; walnut standard length 96", max width 8".
9. **Structure option keys.** Only `back: "inset-rabbet"` is exemplified in the spec. Option keys and
   values in `structure.json` (`carcaseStock`, `topBottom`, `backStock`, `dadoDepth`,
   `rabbetDepth`, `backRabbetDepth`, `shelfRoundover`, `wallStock`, `cornerJoint`, `bottom`,
   `bottomStock`, `grooveDepth`, `grooveOffset`, `grainWraps`) are placeholders. Depths are explicit
   because the defaults (host thickness ÷ 3, ÷ 2) do not give the golden 1/4" and 3/8".
10. **Roundover on generated shelves.** The spec does not say where a form-generated part's
    roundover is stored; `shelfRoundover` is a placeholder.
11. **Box cut list.** Match-set members are never merged (Domain model invariants), so the four
    walnut parts are one numbered block of 4 plus the bottom, not the 3 merged rows of the
    Operation specs table.
12. **Box warning rule id** `groove-outside-bottom-half-pin` is ours; the spec gives only the prose.
13. **Sheet orientation.** The spec writes offcuts as "25-5/8" × 11-3/4"" (along × across the grain)
    but "36-1/8" × 96"" (across × along). They are stored as `alongGrain` / `acrossGrain`.

## Not specified, so deliberately absent

- Removal-primitive coordinates and dado positions (the spec gives cut sizes, not primitives).
- Shopping list, milling list and board feet.
- A sheet layout for the box's 1/4" plywood bottom, and machining setups for the box.
- Outputs for the 30" and 5-shelf resizes beyond the cut-list values the spec states
  (`bookcase/expected/resize.json`).
- Exact sheet efficiency: the spec says "about 46%", stored as `efficiencyPercentApprox`.
- The ten `.skp` files for the M5 spike (`packages/fixtures/skp/` does not exist yet).
