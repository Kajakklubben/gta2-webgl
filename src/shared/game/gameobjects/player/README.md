# Player objects

Keep player-specific game-object behavior here. `player.ts` is the public
player object entry point; `player-actions.ts`, `player-controls.ts`,
`player-motion.ts`, `player-status.ts`, `player-combat.ts`, `player-shots.ts`,
and `player-sprite.ts` split behavior by responsibility.

Do not place shared object primitives or renderer code here. Shared object
contracts belong in the parent `gameobjects` folder, while client rendering
belongs in the client layer.
