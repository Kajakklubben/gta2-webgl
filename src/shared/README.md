# Shared

This directory contains deterministic, environment-neutral code used by both
client and server:

- `domain/` contains GTA2 rules and source-derived constants;
- `engine/` contains fixed-step and generic runtime infrastructure;
- `game/` assembles objects, effects, physics, runtime phases, and snapshots;
- `loader/` decodes GTA2 files into typed asset models; and
- `protocol/` defines validated client/server wire data.

Avoid browser APIs, filesystem access, and transport-specific behavior here.
