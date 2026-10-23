# GTA2 data integration notes

The supplied retail data is expected under the checkout-local `assets/`
directory. A retail install can remain in `assets/App_Executables/data/`; the
server also accepts the flat `assets/MP1-comp.gmp` and `assets/bil.sty` layout.
The data directory may contain city maps, styles, multiplayer `.mmp`
descriptors, mission `.SCR` files, and city sub-scripts. These files are local
inputs and are not committed.

## Loader structure

The current loader boundary is organized as follows:

- `src/shared/engine/loader/map-parser.ts` and `models/map.ts` decode and model GMP data;
- `src/shared/engine/loader/style-parser.ts` and `models/style.ts` decode and model STY data;
- `src/shared/engine/loader/gci.ts`, `cars.ts`, `vehicle-bounds.ts`, and
  `models/vehicles.ts` handle vehicle metadata;
- `src/shared/engine/loader/scr.ts` and `models/catalog.ts` handle authored pickup data;
- `src/shared/engine/loader/asset-loaders.ts` and `bundle.ts` compose typed bundles; and
- `src/shared/engine/loader/multiplayer-maps.ts` maps the supported multiplayer catalog.

The server reads files through its asset adapter. Client and shared gameplay
code consume the resulting typed bundle rather than opening files directly.

The GMP documentation defines the data needed for traffic:

- Each block stores an `arrows` byte. Green bits 0-3 are the normal car network (left, right, up, down); red bits 4-7 are emergency or special routes. The typed map loader exposes both decoded arrow sets and both directed link lists for each road node.
- The `RGEN` chunk contains editor-generated junction and segment data for route finding. Its 1,024 padded junction records, 512 horizontal segment records, 512 vertical segment records, and three trailing active counts are decoded into `level.traffic`.
- The `ZONE` chunk contains traffic-light, bus-stop, restart, gang, and trigger zones.
- `MOBJ` contains decorative map objects only. Each entry is 6 bytes: signed 1.8.7 fixed-point `x`, signed 1.8.7 fixed-point `y`, `Ang8` rotation, and an object type. It is not the weapon pickup list.

The official design documentation says weapon points come from gameplay data rather than the map geometry: a ped drop, a weapon-carrying vehicle, street/roof placement, or a regenerating weapon-shop selection. It also separates vehicle-only weapons (land mines, oil slicks, machine-gun cars, and similar equipment) from ped weapons.

The runtime decodes `DMAP`, `CMAP`, and `UMAP` map chunks and loads authored map zones, tile animations, lights, PSX tile mappings, and junction data from `ZONE`, `ANIM`, `LGHT`, `PSXM`, and `RGEN`. Each zone now has its documented type name, while `level.traffic` indexes traffic-light, arrow-blocker, and bus-stop zones separately. The authoritative server and local sessions spawn traffic at authored camera-edge road positions, advance it through the shared traffic controller, and recycle ordinary cars outside the multiplayer interest radius; network clients consume those authoritative traffic snapshots without local world stepping. Style loading retains and parses the car records in `CARI`, plus the sprite bases, delta stores, object info, font base, and recycling data; restart zones are used for player respawns. Multiplayer state carries team, armor, money, wanted level, and readiness so the client and server agree on the complete player HUD state.

GCI `max_speed`, `gear2 speed`, and `gear3 speed` are decoded Fix16 values in map units per fixed tick. The executable's Fix16 one is `0x4000` (not `0x10000`); the shared boundary converts those decoded values to pixels per second using the 64-pixel tile size and 30 Hz world rate before player, traffic, and collision code consumes them. The traffic bands are therefore `0x1EB..0xCCC` (slow), `0xCCC..0x1333` (medium), and `0x1333..0x1999` (fast).

Car handling now applies the source setup conversions as well as the per-frame values: GCI mass is multiplied by 1.1 before drivetrain and collision use, turbo models receive the source's 2x thrust result (normal models receive 1.5x), and the CARI chassis footprint is used to derive the server's Planck density. Wheel-point velocity, driven-axle force, lateral grip, brake force, chassis torque, and mass-weighted contact impulses use the same authored metadata. Every car remains a dynamic solid, including parked and burned-out cars, so Planck can transfer collision pushes through the authored mass.

## Car metadata loaded from the supplied data

`loadCarCatalog` combines every car model in the selected STY with its name and
handling record from `nyc.gci`. The resulting typed `CarAsset` contains:

- CARI identity and artwork: model id, the raw sprite allocation count and its
  resolved shared sprite id, visible width/height, every legal paint remap,
  base/paint/damage frames, and the raw DELS delta payloads in authored order.
- CARI gameplay data: passenger capacity, wreck graphic id, recycling rating,
  front/rear wheel offsets, front/rear window offsets, raw `info_flags` and
  `info_flags_2`, decoded light/role/collision/headlight booleans, and every
  door coordinate. Door entries also expose the source's special straight-in
  marker and the normalized coordinate used by enter/exit behavior.
- GCI identity and handling: model name, turbo flag, catalogue value and pad
  field, mass, drive/mass bias, brake friction, turn-in and turn ratio, thrust,
  maximum speed, rear-end stability, handbrake slide value, anti strength,
  skid threshold, all three gear multipliers and both gear speed thresholds.
  `sourceFields` retains the exact numeric GCI keys as a forward-compatible
  record, so fields not yet consumed by the physics integrator are not lost.
- Style-wide recycling: `Style.recyclingModels` and
  `CarCatalog.recyclingModels` decode the RECY model list and omit its `255`
  terminator; each `CarAsset` also exposes a `recycled` boolean. The raw RECY,
  CARI, DELS and DELX chunks remain available on the style object for tooling
  and validation.

The STY documentation defines the 32 car delta slots. DELX/DELS are decoded
and retained; the rendered damage frames use the stored slots, while mirrored
right-side slots (22–31) remain derived by the original game and are not stored
in the style file.

The decoded CARI door records now drive the complete occupancy path. Seat 0 is
the driver and `passengers` is the number of additional seats. The runtime
keeps a door index on every occupant, applies the source `0xCCC` center
correction and straight-entry marker, checks the wall route before opening a
door, and advances the four-frame `Car_Door_10` open/close sequence. Occupants
are replicated in `TrafficState.occupants` with `approaching`, `entering`,
`seated`, and `exiting` phases; player/NPC vehicle fields are links into that
state, not a second seat allocation. This preserves old `driver` and
`passengers` aliases while allowing remote clients to attach seated peds and
render the authored DELX door frames.

The remaining authoritative source for fixed weapon points is the compiled mission script (`bil.scr` for the Industrial single-player map, `wil.SCR` for Downtown, `ste.SCR` for Residential, plus the corresponding mission sub-scripts). `src/shared/engine/loader/scr.ts` now decodes the SCR pointer table, command headers, signed 16.14 coordinates, `OBJ_DATA`/`CREATE_OBJ` records, and `GENERATOR` records. It maps the documented `COLLECT_00`…`COLLECT_23` object IDs to the game's weapon slots and imports the resulting points; no pickup locations are invented and `MOBJ` scenery is never treated as a weapon. Pickup art is decoded from the STY code-object sprite base using the eight authored frames for each `COLLECT_*` definition, rather than from decorative map-object sprites.

Weapon fire and impact visuals use the same authored STY code-object bank. The renderer selects data ranges for bullets, shotgun pellets, flame, rockets, molotovs, grenades, shock effects, oil slicks, mines, and explosion frames; it does not draw synthetic trace lines or placeholder projectile circles. Source gameplay object ids remain distinct from pickup art: oil slick is source model 8 / pickup sprite model 216, and land mine is source model 10 / pickup sprite model 217. Ped firing and throw poses use the authored character animation ranges decoded from the ped sprite sets. The decoder keeps the source civilian (`base+0`), player (`base+158`), and police (`base+316`) graphic banks separate, so NPC falling, weapon, entry, and jump sequences use the correct artwork.

## Shared world scale

`src/shared/domain/world/world.ts` is the single scale boundary. SCR object coordinates use
the north-west corner of each map cube, while this renderer's integer tile grid
is centred on the cube; script locations are therefore shifted by half a tile
at the asset boundary. One tile is the 64-pixel STY sprite unit; world positions,
weapon ranges, collision distances, and Three.js positions are world pixels.
Planck receives those positions through the explicit 10-pixels-per-physics-unit
conversion. Movement rates are authored as tiles per second and converted once
at the motion boundary, so player, NPC, traffic, projectiles, and rendering no
longer each apply an independent scale factor.

Player-controlled vehicle handling reads `max_speed` and the other authored
values from the GCI catalog. Traffic cars are spawned from the decoded
green/red-arrow road graph at authored camera-edge positions and are advanced
by the authoritative/local traffic controller. The controller keeps ordinary
green-arrow following separate from special/emergency red routes, uses decoded
RGEN data for target-driven route searches when available, probes nearby cars,
actors, and arrow blockers, and consumes shared traffic-light phases. Network
clients only interpolate the replicated result. The full authored handling record is decoded as
well: turbo, catalogue value/pad, mass, drive and mass bias, brake friction,
turn-in/turn-ratio, rear-end stability, handbrake slide, thrust, anti strength,
skid threshold, and all three gear multipliers/speed thresholds. These values
feed the shared fixed-step vehicle integrator where applicable.

The server selects the pickup script configured for the map (`MP1-comp` uses `MP1-6P.SCR`, `bil-multi` uses `Industrial-6P.scr`, and the district maps use their matching scripts). Set `pickupScript` in `src/server/config.ts` for a custom map/script pairing. The loader accepts the retail `App_Executables/data` directory layout and loads the matching district's mission subdirectory.

Pedestrians use a walkable-block route graph because the retail GMP format
removed the old pedestrian-route chunk. Their server state carries a path
cursor and walk, panic/flee, knockdown, attack, and death states; police react
to wanted or recently firing players while civilians flee from nearby threats.
