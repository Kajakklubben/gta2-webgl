# Server

This directory contains the Node.js runtime adapter:

- `main.ts` creates the shared game and assembles the server runtime;
- `config.ts` and `runtime-config.ts` resolve ports, assets, maps, styles, scripts, and HMR settings;
- `assets.ts` reads configured GTA2 data;
- `http.ts` serves the client and asset files;
- `multiplayer.ts` owns WebSocket peers, rooms, input handling, and tick delivery;
- `snapshot-builder.ts` builds interest-filtered client snapshots; and
- `player-names.ts` validates and normalizes player names.

The server may use shared gameplay and protocol code, but must not import
client UI or rendering code.
