# Scenario tools

This folder contains deterministic scenario viewers and their browser-only
layout/rendering adapters. `scenario-definitions.ts` is the unified registry;
`scenario-definition-data.ts` contains reusable arrangement, action, and
assertion data, while the vehicle and gameplay lab modules render the two
scenario families.

The scenarios intentionally run the shared `Gta2Game` in a synthetic room.
Browser controls and presentation stay here; gameplay rules stay in
`src/shared`.
