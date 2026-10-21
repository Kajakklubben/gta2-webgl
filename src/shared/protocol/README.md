# Protocol

This folder defines the client/server wire boundary:

- `types.ts` contains message and replicated-state shapes;
- `constants.ts` contains protocol and fixed-step constants;
- `client-dto.ts` converts wire state into client-facing state; and
- `validation.ts` parses and validates incoming/outgoing messages.

Protocol code must be explicit about wire data and must not depend on browser
UI or server-only implementation details.
