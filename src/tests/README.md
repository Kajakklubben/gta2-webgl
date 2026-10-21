# Tests

Tests are divided by scope:

- `unit/` covers isolated rules, loaders, objects, rendering helpers, and runtime phases;
- `integration/` covers HTTP/WebSocket transport, configuration, world activity, and multiplayer behavior;
- `e2e/` covers browser behavior against the synthetic fixture server; and
- `fixture-server.ts` serves the synthetic map/style assets used by browser tests.

Keep fixtures deterministic and place shared helpers beside the test suite that
owns them. No proprietary GTA2 files are required by the automated suites.
