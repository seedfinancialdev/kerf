# ADR 004: Shoulder-to-shoulder guest length; corner joints by outside size

Status: Accepted (signed off Oct 9, 2026)

## Context

Woodworkers think in the visible span between parts: "34-1/2" between sides, cut at 35"".

## Decision

"Guest length is shoulder-to-shoulder. A shelf's length is the visible span between the sides; joints add their penetration to get the cut length." "Corner joints (dovetails, box joints) are the exception: those parts are defined by outside dimensions, and cut length equals that length." (Domain model, decision 3)

## Consequences

- Joints that seat a guest into a host add their depth to the guest's cut length; dovetails don't (Operation specs, Shared rules).
- "The UI always shows both when they differ: 'Length 34-9/16" · cut 35-1/16"'."
- Bookcase check: 36 − 2 × 23/32 = 34-9/16; + 2 × 1/4 = 35-1/16.
