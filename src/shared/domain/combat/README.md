# Combat

This folder contains weapon definitions and firing, raycasting, lag
compensation, vehicle damage sources, and damage rules. Combat code operates on
shared state and explicit inputs; orchestration belongs in
`src/shared/game/runtime/combat-phase.ts`, while rendering stays in the client.
