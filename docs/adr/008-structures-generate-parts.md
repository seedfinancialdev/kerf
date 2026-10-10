# ADR 008: Structures and openings generate ordinary parts; hand edits detach

Status: Accepted

## Context

"Woodworkers start from what they're building, not from geometry." Free 3D editing is "the escape hatch, not the main road." (Interaction spec)

## Decision

"A thin layer on top of the part graph. Structures and divisions are generators: on every solve they emit ordinary parts, instances, patterns, joints and match sets, which then flow through the same pipeline. Nothing below this layer changes." (Domain model)

- "Generated parts carry their source: `PartDef.source = { structure: Id, role: ... }`."
- "Detaching: editing a generated part by hand sets `detached: true` on it; the generator then leaves that part alone and says so in the inspector. Undo re-attaches."
- "Saved: structures, openings and overrides are saved (they are intent). The parts they generate are derived and not saved, except detached ones, which become ordinary saved parts."

## Consequences

- Editing a generated board detaches only that board, with a notice ("Shelf 3 is now custom; the form won't change it") and full undo.
- The user's joint override is stored on the structure, so regeneration keeps it.
- Every board stays editable; the form stays the source of truth until a board is edited by hand.
