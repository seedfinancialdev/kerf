# ADR 006: Cut list groups to minimize waste; match sets are the only override

Status: Accepted

## Context

Material cost is the user's real cost. Design intent (grain that wraps a box, bookmatched panels) sometimes matters more than waste.

## Decision

"Default rule: group identical parts and nest everything to minimize material. Design intent (continuous grain, bookmatch, same board) is the only thing that overrides it, and only when the user marks parts as a match set." (Cut list & nesting)

"Cut-list grouping key = stock + cut length + cut width + thickness, and nesting minimizes waste across all parts. Match-set members are the only exception: they stay together, in order, and nest as one unit. Labels and drawings still tell definitions apart." (Domain model, invariants)

## Consequences

- Optimization order: fewest sheets or boards, then largest usable offcut (minimum useful offcut defaults to 6" × 6"), then fewest cuts.
- Guillotine only; deterministic with a fixed seed.
- "If a match set can't fit any available stock, the solve shows an error naming the set and the stock size it needs."
- In the interface, "Grain wraps the corners" creates the continuous-grain match set; "the user never sees the term 'match set.'"
