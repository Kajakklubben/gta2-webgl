# Integration tests

This folder tests boundaries between systems:

- `network.test.ts` covers HTTP and WebSocket transport;
- `runtime-config.test.ts` covers checkout-local runtime configuration;
- `multiplayer-features.test.ts` covers room and replicated gameplay behavior; and
- `world-activity.test.ts` covers server-side world activity.

Use temporary resources and synthetic assets so tests do not require
proprietary GTA2 files.
