# ADR 010: Dark-first UI on design tokens; Lightroom-style modules

Status: Accepted

## Context

"Between consumer and utilitarian, modeled on Lightroom more than Photoshop: a calm, dark workspace where the project is the hero and the panels are dense but labeled." (Interaction spec)

## Decision

- "Workflow modules: Lightroom's Library → Develop → Print maps directly onto Start → Shape → Divide → Joinery → Build plan, shown as named modules in the top bar."
- "Neutral chrome, content first: dark gray UI by default so the wood-toned model stands out; a light theme as a setting."
- "Tokens from day one: colors, spacing and type defined as design tokens, so the light theme and later branding are a token swap, not a redesign."
- "Type: the system UI font at 12-13 px in panels, tabular numerals for every dimension so columns line up."

## Consequences

- UI strings use shop language; banned in UI: mesh, vertex, face (geometry), component, instance, material, extrude, boolean.
- "Icons always carry text labels"; "No floating windows."
- Agents must not change UI copy away from shop language or add icon-only controls (Build plan).
