# Client

This directory contains browser-only application code. It is divided into:

- `app/` — bootstrapping, session orchestration, input, networking, HUD, and audio;
- `rendering/` — Three.js cameras, map meshes, sprites, interpolation, and presentation;
- `tools/` — visual sprite and gameplay-scenario tools;
- `ui/` — shared browser styles; and
- `debug/` — a reserved home for maintained browser diagnostics.

Client code may consume shared types and domain APIs, but shared code must not
import from this directory.
