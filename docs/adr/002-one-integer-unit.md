# ADR 002: One integer unit, 1/64" and 0.01 mm grids

Status: Accepted (signed off Oct 9, 2026)

## Context

- Top-20 request #12: identical parts must merge; "0.750" vs 0.749" precision" causes "phantom sheet splits" in SketchUp because of float precision.
- Both unit systems must be exact.

## Decision

"One internal integer unit for both systems: 1 inch = 203,200 units, 1 mm = 8,000 units. Both 1/64" (3,175) and 0.01 mm (80) are exact, so imperial and metric never round each other." (Domain model, decision 1)

- Storage: "every length, position and offset is an integer in internal units. No floats are ever saved."
- Arithmetic: "parameter expressions evaluate in exact rationals (numerator/denominator), so `3/4" / 3` stays exact until the final step."
- Snapping: "each result snaps to the project grid, 1/64" (imperial) or 0.01 mm (metric), rounding half to even. Snapping happens once, at the end of evaluation."
- Merging: "two parts are 'identical' when their integers are equal. No tolerance comparisons anywhere."

## Consequences

- `INCH = 203200` and `MM = 8000` are the only unit constants.
- No floats for lengths anywhere in `core`; expressions use rationals.
- Display converts back: imperial shows reduced fractions, metric shows mm to 0.1 by default.
