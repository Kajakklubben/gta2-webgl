# Contributing

This project is a TypeScript GTA2 game with a shared deterministic simulation,
browser and server adapters, typed asset loaders, and a validated multiplayer
protocol. Keep changes small in responsibility and place them in the narrowest
directory that owns them.

## Development environment

Use Node.js 24 and pnpm 11.25.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run init
```

Before opening a change, run the checks that match its scope. The normal
baseline is:

```sh
pnpm check
pnpm test
pnpm build
```

Use `pnpm test:e2e` for browser behavior and `pnpm assets:check` when changing
asset loading or local asset configuration. `pnpm check` runs TypeScript's
strict compiler checks and the repository's architectural boundary checker.

## Source ownership

Put code in the narrowest owner:

| Area | Use it for | Keep out |
| --- | --- | --- |
| `src/shared/engine` | Fixed-step timing, generic phase coordination, physics ports, and the native physics implementation | GTA2 rules, asset formats, UI, and transport |
| `src/shared/domain` | GTA2 rules, source-derived constants, vehicle, pedestrian, combat, world, and physics calculations | Browser, server, rendering, and orchestration |
| `src/shared/game` | Game composition, objects, effects, runtime controllers, GTA2 physics adapters, and snapshots | Three.js, WebSocket transport, and filesystem access |
| `src/shared/loader` | GMP, STY, SCR, GCI, and related decoding plus typed asset models | Filesystem access and HTTP serving |
| `src/shared/protocol` | Wire types, DTO conversion, constants, and validation | UI and server-only implementation details |
| `src/client` | Browser lifecycle, input, HUD, rendering, and visual tools | Server authority and filesystem access |
| `src/server` | Asset access, HTTP, WebSocket rooms, multiplayer authority, and snapshots | Browser UI and rendering |
| `src/tests` | Unit, integration, and browser verification | Production runtime behavior |

The engine is reusable infrastructure. Planck is imported only by
`src/shared/engine/planck-physics.ts`; game code uses the solver-neutral ports
from `src/shared/engine/physics-world.ts` and must not know how many native
physics worlds exist. The boundary checker enforces this rule.

Cross-boundary network data belongs in `src/shared/protocol`. Do not import
browser code into the server, server code into the client, or either platform
adapter into `src/shared`.

## TypeScript style

Match the surrounding source style:

- Use TypeScript for new application code. JavaScript is retained only where a
  documented legacy rendering boundary requires it.
- Use two-space indentation, single quotes, semicolons, and trailing commas in
  multiline structures where they improve readability.
- Use kebab-case filenames, `PascalCase` for classes and interfaces,
  `camelCase` for functions, variables, and methods, and `UPPER_SNAKE_CASE`
  for true module constants.
- Prefer named exports and explicit imports. Use `import type` for type-only
  dependencies; inline `type` imports are also used when a value and type come
  from the same module.
- Keep public shapes explicit. Prefer `readonly` on data that callers should
  not mutate and use discriminated unions for finite states and message kinds.
- Do not weaken the compiler to make a change pass. The project enables
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noUnusedLocals`, `noUnusedParameters`, and related safety checks.
- Handle optional values deliberately. Do not use truthiness when `0`, `false`,
  or an empty string is a valid value; distinguish an absent property from an
  explicitly supplied `undefined` where the type requires it.
- Do not use `undefined` as a domain return value to mean “nothing happened”,
  “not applicable”, or “not found”. Return the appropriate domain scenario or
  outcome when callers need to distinguish meaningful cases; use an empty
  collection for a naturally empty collection result, a boolean for a
  predicate, a required value when the contract guarantees one, and a focused
  discriminated union for genuinely different successful outcomes.
- Treat `undefined` as a boundary concern. It is appropriate in protocol,
  serialization, query, and other external-facing code when omission is part
  of the contract, but normalize it before values enter the internal domain
  model whenever possible.
- Fail early on invalid input, violated preconditions, and impossible internal
  states with a focused throw. Do not continue with an arbitrary default value
  that hides the error. Defaults are appropriate only when the domain defines
  that default as a valid outcome.
- Keep functions focused. If a module starts coordinating several unrelated
  systems, split the systems into focused modules and leave composition to the
  owning boundary.

There is no repository-wide formatter or linter configuration. TypeScript,
tests, boundary checks, and review of the surrounding code are the current
source of truth for style.

## Simulation and domain rules

The shared world runs at a fixed 30 ticks per second. Preserve deterministic
behavior:

- Keep simulation decisions in shared code so server authority and local
  prediction use the same rules.
- Keep platform clocks, rendering time, DOM APIs, filesystem APIs, and network
  connections in their adapters or the engine boundary that owns them.
- Keep the fixed phase order explicit: lifecycle, AI, input, physics, collision,
  combat, then replication.
- Keep unit conversions at a named boundary. GTA2 map/tile units, world units,
  physics units, and rendered coordinates should not be converted repeatedly in
  unrelated callers.
- Treat the server as authoritative for multiplayer mutation. Clients send
  sequenced inputs and apply snapshots; they do not create a second
  authoritative multiplayer world.
- Preserve object lifecycle ownership in `GameState`: use its typed lookup and
  deferred spawn/despawn behavior instead of creating a parallel registry.
- Clone nested snapshot data when applying or restoring authoritative state so
  mutable client state is not accidentally shared with wire data.

## Boundaries and validation

Boundary modules should translate external representations once and expose
typed values to the rest of the application:

- Loaders must bounds-check binary input and reject missing, duplicate, or
  malformed chunks with useful errors.
- Protocol parsers must validate untrusted input before it enters the game or
  server runtime. Keep wire limits and message shapes explicit.
- Rendering code consumes shared draw commands and state; shared game objects
  must not import Three.js or manipulate the DOM.
- Physics adapters translate GTA2 collision descriptors to engine physics
  contracts. Do not leak concrete Planck types into domain, game, client, or
  server code.
- Preserve the existing public composition boundaries, especially
  `Gta2Game`, `GameWorld`, the loader models, and protocol DTOs, unless the
  change is specifically an architecture refactor.

## Tests

Place tests beside the scope they verify:

- `src/tests/unit` for isolated domain rules, loaders, protocol code, game
  objects, runtime phases, and rendering helpers.
- `src/tests/integration` for HTTP/WebSocket transport, configuration, room
  behavior, and server-side world activity.
- `src/tests/e2e` for browser behavior against the synthetic fixture server.

Use deterministic synthetic fixtures. Automated tests must not require
proprietary GTA2 files. Prefer behavior-focused test names such as
`runs registered phases in deterministic engine order`, and cover malformed
input and boundary conditions when changing parsers, protocol handling, or
physics.

## Assets and generated files

Do not commit proprietary GTA2 data or local runtime output. In particular,
keep local files under `assets/`, build output under `dist/`, test reports, and
credentials out of commits unless a task explicitly requires a tracked fixture.
Use the existing synthetic fixture generators for tests and document any new
fixture format in the owning test README.

## Documentation and review checklist

Update the README nearest to a changed subsystem when its ownership, public
contract, or workflow changes. Update `docs/architecture.md` when a boundary
or dependency direction changes. Keep documentation names and paths aligned
with the current tree; `pnpm check` rejects known stale architecture paths.

Before submitting a change, confirm:

- the code lives in the correct layer;
- strict TypeScript checks pass;
- focused tests cover new behavior and regressions;
- boundary checks pass;
- no proprietary assets, credentials, or generated output are included; and
- the relevant README or architecture documentation is current.

