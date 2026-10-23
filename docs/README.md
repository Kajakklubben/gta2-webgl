# Documentation

The root [README](../README.md) is the shortest setup and playtest guide.
This directory contains project-wide architecture and source-data notes; each
implementation directory keeps its own focused `README.md` beside the code.

## Project notes

- [Architecture](architecture.md) — current boundaries between the engine,
  shared game, loaders, protocol, client, server, and tests.
- [Rendering requirements](rendering-requirements.md) — the canonical 2.5D
  composition, semantic draw-order, spatial-depth, and occlusion contract.
- [Data integration notes](data-integration-notes.md) — how GTA2 map, style,
  mission-script, and related source data enter the runtime.
- [GTA2 decompiled source notes](gta2-decompiled-source.md) — reverse-
  engineering references and source-derived behavior notes.

## Documentation conventions

- Keep commands, asset setup, and the shortest play path in the root README.
- Keep system-wide explanations and research notes here in `docs/`.
- Keep implementation-specific guidance next to the code it describes.
- Link to the source of truth instead of duplicating module inventories that
  can quickly become stale.
- When a refactor changes ownership or a public workflow, update the nearest
  directory README and the relevant project note in the same change.
