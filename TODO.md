# TODO

## Weapon parity and completeness

Scope: the 20 weapon definitions in `src/shared/domain/combat/weapons.ts`.

The shared combat runtime now covers the source dispatch, projectile lifecycle, mounted weapon capabilities, threat reporting, and the normal/special car-bomb split. Remaining unchecked items are deliberate source-art, full engine-physics, or acquisition-data gaps.

## Implementation pass completed

- [x] Implemented source-authored player and mounted muzzle origins, turret rotation, point velocity, muzzle obstruction, and source hit-object transitions.
- [x] Implemented moving projectile terminal effects, wall impacts, delayed water death/fade, throwable vertical launch/gravity, rocket trails, Molotov trails, blast height filtering, falloff, knockback, and death attribution.
- [x] Implemented ordinary weapon crime/wanted reporting with explicit silenced suppression and replicated NPC threat state.
- [x] Implemented normal attached car bombs, special instant car bombs, trailer detachment, source timers, source explosion events, and vehicle capability gating.
- [x] Implemented source vehicle weapon audio slots and infinite fire-truck weapon handling.
- [x] Added regression coverage for source metadata, projectile timing, weapon origins/capabilities, wanted suppression, car-bomb separation, source effects, and attribution.

## Highest-priority work

- [x] Make `WeaponDefinition.impactModel` functional for authoritative impact/effect objects; ordinary bullets use the source particle-burst path because they do not have a dedicated impact object model.
  - [x] Spawn source-specific terminal effects for flame, electro-shock, rocket, tank, and mounted weapon transitions.
  - [x] Add wall-impact effects for non-explosive projectiles instead of silently removing them.
- [x] Separate normal and special car-bomb behavior.
  - [x] Stop ignoring the `_instant` parameter in `vehicle-player.ts`.
  - [x] Exact source arming/state-machine timing is covered; the normal path uses the source 120-tick transition and the special path resolves immediately. CARI/DELS chassis presentation is composed from decoded source deltas; any optional delta slots absent from an installed STY are reported by the source-art audit.
  - [x] Add separate regression tests for `CarBomb` and `SpecialVehicleBomb`.
- [x] Add an explicit vehicle weapon capability table.
  - [x] Restrict machine-gun-car behavior to an installed source weapon slot instead of allowing source type 18 on any vehicle.
  - [x] Keep and test the tank, fire-truck, and army-jeep model restrictions.
- [x] Resolve wanted/crime behavior.
  - [x] Ordinary weapon emissions raise the authoritative wanted/threat state.
  - [x] The silenced gun suppresses those reports without suppressing damage.
- [x] Decide and document which weapons are collectible and which are script/debug-only.
  - [x] StunGun remains script/debug-only because it has no SCR pickup mapping.
  - [x] Oil slicks, land mines, and machine-gun cars use the authored vehicle pickup mappings; tank, fire-truck, army-jeep, and car-bomb slots remain script/debug-only.

## Per-weapon TODO

### Pistol

- [x] Verify wanted/crime escalation for pedestrian, player, and vehicle hits through the shared emission path.
- [x] Add the source particle impact path; ordinary pistol bullets intentionally do not use an `impactModel` object.
- [x] Add behavior tests for wall impacts, vehicle hits, and wanted/crime behavior.

### Machine gun

- [x] Verify rapid-fire cadence against the source interval.
- [x] Add the source particle impact path; ordinary machine-gun bullets intentionally do not use an `impactModel` object.
- [x] Add behavior tests for wall impacts, vehicle hits, and wanted/crime behavior.

### Flamethrower

- [x] Verify source burn cadence, damage ticks, ignition duration, and water interaction.
- [x] Add the authored flame-impact/fire-hit effects.
- [x] Add player, NPC, vehicle, and persistent-fire regression tests.

### Rocket launcher

- [x] Use the authored rocket impact/child model alongside the generic explosion path.
- [x] Verify full explosion occlusion and train/object immunity against the source behavior.
- [x] Add impact-effect and blast-behavior regression tests.

### Molotov

- [x] Add a regression test covering charge, release, collision, explosion, and persistent fire.
- [x] Verify player, NPC, and vehicle damage from the blast and resulting fire hazard.
- [x] Verify surface collision, water interaction, and fire lifetime against the source.

### Silenced gun

- [x] Add an explicit test proving that silenced shots suppress the intended wanted/crime reports.
- [x] Keep damage and hit reactions active for the source silenced weapon.
- [x] Use the source bullet particle path; the silenced branch intentionally has no dedicated impact object model.

### Oil slicks

- [x] Verify the source grip-loss, spin-out, steering, and recovery behavior.
- [x] Verify deployment position, lifetime, trigger radius, and vehicle filtering.
- [x] Add deployment and vehicle spin-out regression tests.

### Machine-gun car

- [x] Add explicit installed-weapon and vehicle capability/model validation.
- [x] Verify both muzzle origins, aiming, cadence, point velocity, and projectile origin offsets.
- [x] Add dedicated source hit-object presentation where source artwork exists.
- [x] Add vehicle firing/restriction metadata and capability tests.

### Grenade

- [x] Add regression tests for cook timeout, release, collision detonation, and blast radius.
- [x] Verify direct and area damage against vehicles, players, and NPCs.
- [x] Add authored impact/explosion child effects using the source models.

### Stun gun

- [x] Decide whether StunGun should have a pickup/acquisition path or remain script/debug-only.
- [x] Verify cone geometry, chain/secondary hits, range, cooldown, and shock duration.
- [x] Add dedicated player, NPC, vehicle, wall, and occlusion tests.

### Shotgun

- [x] Verify pellet count, spread, damage, range, and collision behavior against source values.
- [x] Add the source terminal impact path for pellet impacts.
- [x] Add dedicated regression tests for multi-target hits, walls, and vehicles.

### Land mines

- [x] Verify arming delay, owner exclusion, proximity radius, trigger filtering, and placement offsets.
- [x] Verify blast damage and fire/ejection side effects against source behavior.
- [x] Add deployment, trigger, owner, and vehicle regression tests.

### Electro-shock

- [x] Verify the source three-point/chain hit behavior, range, cooldown, and shock duration.
- [x] Use the authored electro-shock impact/electric-beam path and wall effects.
- [x] Add dedicated projectile, wall, water, NPC, and vehicle tests.

### Dual-shot pistol

- [x] Verify the two projectile origins/angles against the documented source spread.
- [x] Resolve the apparent mismatch: Weapon_8 defines 48 Ang16, so the runtime uses -48/+48 and documents that source value.
- [x] Add regression tests for two-shot dispatch, spread, damage, walls, vehicles, and wanted/crime behavior.

### Car bomb

- [x] Implement the normal car-bomb source path as an attached source object rather than an immediate generic vehicle-damage event.
- [x] Verify driver/trailer restrictions, source arming timing, damage packet, and the decoded CARI/DELS chassis presentation path. Missing optional retail delta slots remain data-specific and are reported rather than synthesized.
- [x] Add dedicated visual state and regression tests.

### Tank main gun

- [x] Verify tank-only capability and tank muzzle origin.
- [x] Use the authored tank impact model and source-specific explosion presentation.
- [x] Verify vehicle damage and blast behavior through the shared vehicle packet.
- [x] Add tank capability/origin metadata coverage.

### Fire-truck gun

- [x] Verify fire-truck-only capability and source turret muzzle origin.
- [x] Preserve infinite/fuel-backed cadence separately from consumable mounted weapons.
- [x] Add source-specific hit-object presentation where available.
- [x] Add a dedicated end-to-end fire-truck firing/damage test.

### Fire-truck flamethrower

- [x] Verify fire-truck-only capability, turret origin, range, cadence, and fire behavior path.
- [x] Confirm all source-specific vehicle and environmental interactions. Model-198 fire-truck water streams now extinguish burning players/NPCs and vehicles, apply the source pedestrian packets, stop at authored walls, and persist vehicle suppression; model-194 flame streams ignite/damage eligible targets and remain filtered by tank flameproof immunity.
- [x] Add source-specific hit presentation metadata.

### Army jeep gun

- [x] Verify army-jeep-only capability and turret muzzle origin.
- [x] Preserve the source target-hit transition separately from the generic machine gun.
- [x] Add source-specific projectile/impact presentation where available.
- [x] Add a dedicated end-to-end army-jeep firing/damage test.

### Special vehicle bomb

- [x] Implement and test the special/instant car-bomb path separately from the normal car bomb.
- [x] Verify immediate target selection, damage, and large-explosion presentation. Chassis presentation uses the same validated source CARI/DELS path; the special bomb itself has no separate chassis animation asset in the local source.
- [x] Add a regression test proving it is not silently routed through the normal car-bomb behavior.

## NPC parity

- [x] Keep NPC weapon dispatch in scope for this milestone: NPC-held pistol/silenced, shock, rocket, and throwable paths use the shared projectile/damage runtime.
- [x] Add source-equivalent NPC weapon selection for grenades, flamethrowers, mines, and vehicle-mounted weapons.
- [x] Add dedicated NPC projectile, damage, and replication tests.

## Test matrix

- [x] Add Molotov release-to-fire coverage.
- [x] Add oil-slick deployment and spin-out coverage.
- [x] Add land-mine arming and trigger coverage.
- [x] Add dual-pistol behavior coverage.
- [x] Add all vehicle-only weapon end-to-end coverage.
- [x] Add normal versus special car-bomb coverage.
- [x] Add impact-model and wall-impact coverage for the implemented paths.
- [x] Add wanted/crime coverage for ordinary and silenced firearms.
- [x] Add pickup/acquisition coverage for every collectible weapon.

## Source verification

- [x] Confirm the local original/decompiled source tree is available under `references/gta2_re/Source/`.
- [x] Cross-check implemented behavior against `docs/gta2-decompiled-source.md` and the local source tree.
- [x] Record intentional deviations in comments and in this file: installed STY files may omit optional DELS door/light slots; the local retail source exposes rotated CARI rectangles and GMP faces, not arbitrary per-model collision polygons; exact audio spatial mixing remains a follow-up, and the local STY has no dedicated atlas ranges for fire-truck terminal models 194/195/198/199, so their gameplay is verified while presentation uses the validated fallback/water effect path.

## Old-source comparison: missing or half-baked behavior

The items below were found by comparing the current implementation with the local source in `references/gta2_re/Source/`, especially `Weapon_30.cpp`, `Object_5C.cpp`, `Explosion_30.cpp`, `Car_BC.cpp`, and `Ped.cpp`. They expand the weapon checklist above with concrete source-level gaps.

### Weapon dispatch and mounted weapons

- [x] Split normal and special car bombs into the two source paths. `Weapon_30.cpp:1383-1399` calls `Car_BC::FireCarBomb`, while `Car_BC.cpp:4734-4761` has an immediate large-explosion path and a normal path that creates model 132, assigns the damage owner, and dispatches vehicle collision. Runtime now preserves both paths and the source 120-tick transition; CARI/DELS chassis presentation is validated at load time, with absent optional slots reported as asset-specific warnings.
- [x] Restore trailer/cab handling for car bombs where supported. The source detaches the trailer in `Weapon_30.cpp:1391-1395`; runtime clears both trailer links after transferring the target.
- [x] Add an installed-capability state for mounted weapons. `weaponOrigins` model-gates the tank, fire truck, and army jeep, and machine-gun car (`type 18`) now requires an installed source slot.
- [x] Distinguish infinite/fuel-backed fire-truck weapons from consumable mounted weapons. Fire-truck weapons use `consumesAmmo: false`; tank, army jeep, and car-SMG remain consumable.
- [x] Add source-specific mounted hit transitions. Runtime carries source hit models 195/199, 159, and 154 through the projectile/impact path; no-target stream/spray art remains approximate where the source uses a particle emitter rather than an Object_2C sprite.

### Muzzle origins, turrets, and collision geometry

- [x] Replace generic mounted-weapon offsets with source-authored turret geometry. `TrafficState` now carries turret rotation and runtime uses the source 30/14/6-pixel turret reaches and chassis offsets.
- [x] Split on-foot muzzle origins by weapon. Player combat now has source-specific pistol, SMG, shotgun, rocket, shock, throwable, and flame origins.
- [x] Resolve the dual-pistol spread mismatch. `Weapon_8.cpp:13` defines 48 Ang16, and runtime/tests use `[-48, 48]` with matching documentation.
- [x] Add the source muzzle obstruction and collision-shape checks. Rays reject blocked muzzle origins and moving projectiles retain source collision identity; vehicle/object footprints use the source CARI/ObjectDefinition rectangle contract.
- [x] Separate projectile collision geometry by object/model. `Object_5C.cpp:2720-2803` dispatches wall impacts by object type and wall side; runtime now uses source-model footprints and authored wall-side dispatch. The local source/STY/GMP contain no arbitrary per-model polygon payload to add safely; the audit records this as a rotated-rectangle limitation.

### Throwables and projectile lifecycle

- [x] Restore vertical throwable launch velocity. Grenade/molotov projectiles now receive source z-speed, gravity, airborne movement, landing, and floor collision.
- [x] Add the Molotov's in-flight light/fire objects. The renderer follows the moving Molotov with a transient source-colored point light and fire trail; ground-fire attachment is covered separately.
- [x] Implement source projectile impact dispatch for wall particles, source hit models, and explosive terminal transitions, including the authored wall-side explosion variants.
- [x] Restore rocket trail presentation and terminal visuals. The trail cadence is renderer-owned but uses the source sequence/frame timing.
- [x] Reproduce projectile water-death lifecycle. Water entry now creates a splash and shrinks/fades the projectile over the source visual window before removal.
- [x] Replace placeholder `impactModel` values with explicit source impact/particle paths. Ordinary bullets no longer claim unrelated flamethrower art; mounted target transitions carry their source models.

### Explosion, fire, and hit semantics

- [x] Expand blast queries with source-style height filtering, timed rocket windows, falloff, knockback, vehicle packets, attribution, train immunity, object reactions, and player/NPC death causes. Collision fidelity follows the verified source rectangle/face contract; arbitrary retail polygons are not present in the local source data.
- [x] Add explosion flash and object reactions. The authoritative runtime emits the first-tick flash and invokes the nearby-object reaction hook for supported map objects.
- [x] Complete flamethrower stream behavior. Source segment cadence, status effects, crime/threat, water extinguishing, and ground-fire transitions are implemented and covered; remaining deviations are presentation/data fidelity gaps.
- [x] Restore player/NPC hit reactions and attribution. Runtime records killer/death cause, fire/shock state, NPC death poses, attached fire, and source impact effects.
- [x] Verify armor and power-up handling on player hits. Direct authoritative projectile hits now consume one source Armor charge, with regression coverage for player and NPC-style fire; generic collision/area damage retains the existing half-damage armor path.

### Wanted, threat, audio, and presentation

- [x] Move ordinary weapon crime/threat reporting to the source-equivalent fire paths. Authoritative emission now raises wanted and records a timed NPC threat for all non-silent combat weapons, including mounted paths.
- [x] Make silenced-fire suppression explicit. The source's silenced SMG branch suppresses the report and has a regression test.
- [x] Replace the attacker approximation with an explicit threat-list update carried in NPC state and consumed by NPC target selection.
- [x] Add authoritative muzzle/shot presentation and complete weapon audio mapping for slots 0-19. The client AudioBus now applies listener-relative attenuation and stereo panning; exact proprietary mixer/codec parity remains asset-dependent.
- [x] Add source-specific impact presentation for hitscan, moving projectiles, mounted target transitions, and wall impacts.

### Starting data and NPC coverage

- [x] Verify starting ammo against source defaults. The multiplayer opening pistol remains 60 rounds intentionally; authored pickup and mounted-weapon defaults are now recorded separately and covered by tests.
- [x] Expand NPC weapon selection and projectile behavior beyond configured pistol/silenced/shock/rocket/throwable weapons to include mines, flamethrowers, and mounted weapon AI.
- [x] Add source-derived tests for the verified collision contract, CARI/DELS door and damage presentation, finite OBJI animation transitions, source object links, and the style-boundary presentation audit.
- [x] Audit optional retail DELS coverage. The installed `assets/bil.sty` omits model 42's stored slots 11–14 (and mirrored 28–31); the validator reports those exact omissions and no substitute pixels are invented. Supplying those proprietary slots requires a different retail asset.
- [x] Close the fire-truck environmental interaction gap: water/flame projectile collision, pedestrian packets, vehicle extinguishing and persistence, wall blocking, and authored tank filtering are covered by focused regressions; missing dedicated terminal art remains asset-dependent as recorded above.
