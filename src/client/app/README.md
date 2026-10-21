# Client application

This folder owns the browser entrypoint and game-session orchestration.

- `main.ts` starts the game page and reports fatal startup errors.
- `game-client.ts` composes the browser session and its integrations.
- `game-client-frame.ts` advances local input, sends multiplayer input, and renders each frame.
- `game-client-network.ts` owns the WebSocket connection and snapshot ingestion.
- `game-client-hud.ts` maps shared player state into HUD elements.
- `local-session.ts` and `multiplayer-session.ts` build the two session modes.
- `client-snapshot.ts` expands and restores authoritative network snapshots.
- `main-ui.ts`, `input-controller.ts`, `touch-controls.ts`, and `input-bindings.ts` own browser interaction.

Asset loading, audio, debug settings, and persisted startup options remain
focused adapters in this directory. Reusable Three.js code belongs in
`../rendering`; standalone visual tools belong in `../tools`.
