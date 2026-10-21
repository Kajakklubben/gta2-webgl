# Domain

This directory defines GTA2 gameplay concepts and rules independent of the
client and server. Current areas are `combat/`, `physics/`, `vehicles/`,
`pedestrians/` (including `pedestrians/ai/`), and `world/`; the shared
animation table remains at `animation.ts`.

Keep orchestration, object lifecycle, and snapshot reconciliation in
`../game`.
