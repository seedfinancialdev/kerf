# ADR 005: Save intent, derive geometry

Status: Accepted

## Context

- Product spec: "A project is a graph of parts. Joints and operations change parts, and every output reads that graph, never the 3D mesh. This one decision keeps cut lists exact and avoids building a general solid-modeling kernel."

## Decision

"The file stores intent, never geometry. A project is parameters, stock, part definitions, instances, patterns, joints and user operations; everything else (joint cuts, cut sizes, meshes, the cut list) is derived on every solve and never saved." (Domain model)

## Consequences

- Invariant: "The saved file contains no derived data: no joint cuts, cut sizes, meshes or cut lists."
- Invariant: "Load → save is byte-identical (canonical JSON key order)."
- Invariant: "The cut list is a pure function of `project.json`."
- Display geometry: Manifold booleans, display only; "Outputs read the part graph, never the mesh."
- `.kerf` is a zip with `project.json`, `meta.json` and `thumbnail.png`; older schema versions migrate forward on load, and the app never writes an older version.
