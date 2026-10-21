# Source

The application source is split into browser code, server code, shared game
code, and tests. Keep code in the narrowest directory that owns its
responsibility.

- `client/` contains browser orchestration, rendering, UI, and development tools.
- `server/` contains Node.js startup, asset access, HTTP, WebSocket rooms, and snapshots.
- `shared/` contains deterministic game rules, loaders, objects, runtime phases, and protocol contracts.
- `tests/` contains unit, integration, and browser-level coverage.

Cross-boundary wire data belongs in `shared/protocol`; browser and server
adapters must not leak into the shared layer.
