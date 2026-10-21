# Vehicle objects

Keep vehicle-specific game-object behavior here. `vehicle.ts` is the public
vehicle object entry point; `vehicle-control.ts`, `vehicle-player.ts`,
`vehicle-ai.ts`, `vehicle-damage.ts`, and `vehicle-sprite.ts` split control,
occupancy, AI, damage, and presentation translation by responsibility.

Do not place shared object primitives or renderer code here. Shared object
contracts belong in the parent `gameobjects` folder, while client rendering
belongs in the client layer.
