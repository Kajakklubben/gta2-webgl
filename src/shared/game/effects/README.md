# Game effects

This folder contains simulation-side transient objects: `car-fire.ts`,
`hazard.ts`, `pickup.ts`, and `projectile.ts`. Effects own their lifecycle and
gameplay consequences; visual presentation is exposed through draw commands and
resolved in the client renderer.
