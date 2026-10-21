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
  - [ ] Exact source animation/state-machine timing remains an asset/vehicle-animation follow-up; the normal path uses the source 50-tick arming transition and the special path resolves immediately.
  - [x] Add separate regression tests for `CarBomb` and `SpecialVehicleBomb`.
- [x] Add an explicit vehicle weapon capability table.
  - [x] Restrict machine-gun-car behavior to an installed source weapon slot instead of allowing source type 18 on any vehicle.
  - [x] Keep and test the tank, fire-truck, and army-jeep model restrictions.
- [x] Resolve wanted/crime behavior.
  - [x] Ordinary weapon emissions raise the authoritative wanted/threat state.
  - [x] The silenced gun suppresses those reports without suppressing damage.
- [ ] Decide and document which weapons are collectible and which are script/debug-only.
  - [ ] StunGun currently has no SCR pickup mapping.
  - [ ] Vehicle-only weapons currently have no SCR pickup mappings.

## Per-weapon TODO

### Pistol

- [x] Verify wanted/crime escalation for pedestrian, player, and vehicle hits through the shared emission path.
- [x] Add the source particle impact path; ordinary pistol bullets intentionally do not use an `impactModel` object.
- [ ] Add behavior tests for wall impacts, vehicle hits, and wanted/crime behavior.

### Machine gun

- [x] Verify rapid-fire cadence against the source interval.
- [x] Add the source particle impact path; ordinary machine-gun bullets intentionally do not use an `impactModel` object.
- [ ] Add behavior tests for wall impacts, vehicle hits, and wanted/crime behavior.

### Flamethrower

- [ ] Verify source burn cadence, damage ticks, ignition duration, and water interaction.
- [ ] Add the authored flame-impact/fire-hit effects.
- [ ] Add player, NPC, vehicle, and persistent-fire regression tests.

### Rocket launcher

- [x] Use the authored rocket impact/child model alongside the generic explosion path.
- [ ] Verify full explosion occlusion and train/object immunity against the source behavior.
- [x] Add impact-effect and blast-behavior regression tests.

### Molotov

- [ ] Add a regression test covering charge, release, collision, explosion, and persistent fire.
- [ ] Verify player, NPC, and vehicle damage from the blast and resulting fire hazard.
- [ ] Verify surface collision, water interaction, and fire lifetime against the source.

### Silenced gun

- [x] Add an explicit test proving that silenced shots suppress the intended wanted/crime reports.
- [x] Keep damage and hit reactions active for the source silenced weapon.
- [x] Use the source bullet particle path; the silenced branch intentionally has no dedicated impact object model.

### Oil slicks

- [ ] Verify the source grip-loss, spin-out, steering, and recovery behavior.
- [ ] Verify deployment position, lifetime, trigger radius, and vehicle filtering.
- [ ] Add deployment and vehicle spin-out regression tests.

### Machine-gun car

- [x] Add explicit installed-weapon and vehicle capability/model validation.
- [x] Verify both muzzle origins, aiming, cadence, point velocity, and projectile origin offsets.
- [x] Add dedicated source hit-object presentation where source artwork exists.
- [x] Add vehicle firing/restriction metadata and capability tests.

### Grenade

- [ ] Add regression tests for cook timeout, release, collision detonation, and blast radius.
- [ ] Verify direct and area damage against vehicles, players, and NPCs.
- [ ] Add authored impact/explosion child effects using the source models.

### Stun gun

- [ ] Decide whether StunGun should have a pickup/acquisition path or remain script/debug-only.
- [ ] Verify cone geometry, chain/secondary hits, range, cooldown, and shock duration.
- [ ] Add player, NPC, vehicle, wall, and occlusion tests.

### Shotgun

- [x] Verify pellet count, spread, damage, range, and collision behavior against source values.
- [x] Add the source terminal impact path for pellet impacts.
- [ ] Add dedicated regression tests for multi-target hits, walls, and vehicles.

### Land mines

- [ ] Verify arming delay, owner exclusion, proximity radius, trigger filtering, and placement offsets.
- [ ] Verify blast damage and fire/ejection side effects against source behavior.
- [ ] Add deployment, trigger, owner, and vehicle regression tests.

### Electro-shock

- [x] Verify the source three-point/chain hit behavior, range, cooldown, and shock duration.
- [x] Use the authored electro-shock impact/electric-beam path and wall effects.
- [ ] Add dedicated projectile, wall, water, NPC, and vehicle tests.

### Dual-shot pistol

- [x] Verify the two projectile origins/angles against the documented source spread.
- [x] Resolve the apparent mismatch: Weapon_8 defines 48 Ang16, so the runtime uses -48/+48 and documents that source value.
- [ ] Add regression tests for two-shot dispatch, spread, damage, walls, vehicles, and wanted/crime behavior.

### Car bomb

- [x] Implement the normal car-bomb source path as an attached source object rather than an immediate generic vehicle-damage event.
- [x] Verify driver/trailer restrictions, source arming timing, and damage packet. Exact chassis animation remains pending.
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
- [ ] Add a dedicated end-to-end fire-truck firing/damage test.

### Fire-truck flamethrower

- [x] Verify fire-truck-only capability, turret origin, range, cadence, and fire behavior path.
- [ ] Confirm all source-specific vehicle and environmental interactions.
- [x] Add source-specific hit presentation metadata.

### Army jeep gun

- [x] Verify army-jeep-only capability and turret muzzle origin.
- [x] Preserve the source target-hit transition separately from the generic machine gun.
- [x] Add source-specific projectile/impact presentation where available.
- [ ] Add a dedicated end-to-end army-jeep firing/damage test.

### Special vehicle bomb

- [x] Implement and test the special/instant car-bomb path separately from the normal car bomb.
- [x] Verify immediate target selection, damage, and large-explosion presentation. Exact source animation remains pending.
- [x] Add a regression test proving it is not silently routed through the normal car-bomb behavior.

## NPC parity

- [x] Keep NPC weapon dispatch in scope for this milestone: NPC-held pistol/silenced, shock, rocket, and throwable paths use the shared projectile/damage runtime.
- [ ] Add source-equivalent NPC weapon selection for grenades, flamethrowers, mines, and vehicle-mounted weapons.
- [ ] Add dedicated NPC projectile, damage, and replication tests.

## Test matrix

- [ ] Add Molotov release-to-fire coverage.
- [ ] Add oil-slick deployment and spin-out coverage.
- [ ] Add land-mine arming and trigger coverage.
- [ ] Add dual-pistol behavior coverage.
- [ ] Add all vehicle-only weapon end-to-end coverage.
- [x] Add normal versus special car-bomb coverage.
- [x] Add impact-model and wall-impact coverage for the implemented paths.
- [x] Add wanted/crime coverage for ordinary and silenced firearms.
- [ ] Add pickup/acquisition coverage for every collectible weapon.

## Source verification

- [x] Confirm the local original/decompiled source tree is available under `references/gta2_re/Source/`.
- [x] Cross-check implemented behavior against `docs/gta2-decompiled-source.md` and the local source tree.
- [x] Record intentional deviations in comments and in this file: exact car-bomb animation, full explosion occlusion/object callbacks, NPC vehicle weapon selection, and missing dedicated impact art remain follow-ups.

## Old-source comparison: missing or half-baked behavior

The items below were found by comparing the current implementation with the local source in `references/gta2_re/Source/`, especially `Weapon_30.cpp`, `Object_5C.cpp`, `Explosion_30.cpp`, `Car_BC.cpp`, and `Ped.cpp`. They expand the weapon checklist above with concrete source-level gaps.

### Weapon dispatch and mounted weapons

- [x] Split normal and special car bombs into the two source paths. `Weapon_30.cpp:1383-1399` calls `Car_BC::FireCarBomb`, while `Car_BC.cpp:4734-4761` has an immediate large-explosion path and a normal path that creates model 132, assigns the damage owner, and dispatches vehicle collision. Runtime now preserves both paths; exact animation is still pending.
- [x] Restore trailer/cab handling for car bombs where supported. The source detaches the trailer in `Weapon_30.cpp:1391-1395`; runtime clears both trailer links after transferring the target.
- [x] Add an installed-capability state for mounted weapons. `weaponOrigins` model-gates the tank, fire truck, and army jeep, and machine-gun car (`type 18`) now requires an installed source slot.
- [x] Distinguish infinite/fuel-backed fire-truck weapons from consumable mounted weapons. Fire-truck weapons use `consumesAmmo: false`; tank, army jeep, and car-SMG remain consumable.
- [x] Add source-specific mounted hit transitions. Runtime carries source hit models 195/199, 159, and 154 through the projectile/impact path; no-target stream/spray art remains approximate where the source uses a particle emitter rather than an Object_2C sprite.

### Muzzle origins, turrets, and collision geometry

- [x] Replace generic mounted-weapon offsets with source-authored turret geometry. `TrafficState` now carries turret rotation and runtime uses the source 30/14/6-pixel turret reaches and chassis offsets.
- [x] Split on-foot muzzle origins by weapon. Player combat now has source-specific pistol, SMG, shotgun, rocket, shock, throwable, and flame origins.
- [x] Resolve the dual-pistol spread mismatch. `Weapon_8.cpp:13` defines 48 Ang16, and runtime/tests use `[-48, 48]` with matching documentation.
- [x] Add the source muzzle obstruction and collision-shape checks. Rays reject blocked muzzle origins and moving projectiles retain source collision identity; full per-model collision shapes remain an engine follow-up.
- [ ] Separate projectile collision geometry by object/model. `Object_5C.cpp:2720-2803` dispatches wall impacts by object type and wall side; current `projectile-controller.ts:61-115` uses one generic sweep/body-radius collision rule.

### Throwables and projectile lifecycle

- [x] Restore vertical throwable launch velocity. Grenade/molotov projectiles now receive source z-speed, gravity, airborne movement, landing, and floor collision.
- [ ] Add the Molotov's in-flight light/fire objects. The renderer has a source fire trail; the separate dynamic light/explosion attachment still needs a lighting system.
- [x] Implement source projectile impact dispatch for wall particles, source hit models, and explosive terminal transitions. Exact wall-side explosion variants remain pending.
- [x] Restore rocket trail presentation and terminal visuals. The trail cadence is renderer-owned but uses the source sequence/frame timing.
- [x] Reproduce projectile water-death lifecycle. Water entry now creates a splash and shrinks/fades the projectile over the source visual window before removal.
- [x] Replace placeholder `impactModel` values with explicit source impact/particle paths. Ordinary bullets no longer claim unrelated flamethrower art; mounted target transitions carry their source models.

### Explosion, fire, and hit semantics

- [x] Expand blast queries with source-style height filtering, timed rocket windows, falloff, knockback, vehicle packets, attribution, and player/NPC death causes. Train/immunity/object callback behavior remains a broader physics follow-up.
- [ ] Add explosion flash and object reactions. The source emits first-tick flash particles and calls `OnExplosionNearby`; current runtime has visual blast particles but not the full authoritative nearby-object callback graph.
- [ ] Complete flamethrower stream behavior. Source hit transitions, status effects, and crime/threat are implemented; exact segment cadence/gaps and all ground-fire transitions remain pending.
- [x] Restore player/NPC hit reactions and attribution. Runtime records killer/death cause, fire/shock state, NPC death poses, attached fire, and source impact effects.
- [ ] Verify armor and power-up handling on player hits. The source has player-specific protection behavior in the ped hit path; the current direct player damage path does not document or test equivalent armor/power-up semantics.

### Wanted, threat, audio, and presentation

- [x] Move ordinary weapon crime/threat reporting to the source-equivalent fire paths. Authoritative emission now raises wanted and records a timed NPC threat for all non-silent combat weapons, including mounted paths.
- [x] Make silenced-fire suppression explicit. The source's silenced SMG branch suppresses the report and has a regression test.
- [x] Replace the attacker approximation with an explicit threat-list update carried in NPC state and consumed by NPC target selection.
- [x] Add authoritative muzzle/shot presentation and complete weapon audio mapping for slots 0-19. Exact source sound-object spatial mixing remains a client-audio follow-up.
- [x] Add source-specific impact presentation for hitscan, moving projectiles, mounted target transitions, and wall impacts.

### Starting data and NPC coverage

- [ ] Verify starting ammo against source defaults. `Weapon_8.cpp:15-22` and the source ammo initialization differ from current `weapons.ts:79` starting values; document intentional balance changes or align the initial pistol/other weapon counts.
- [ ] Expand NPC weapon selection and projectile behavior beyond configured pistol/silenced/shock/rocket/throwable weapons to include mines, flamethrowers, and mounted weapon AI.
- [ ] Add source-derived tests for every remaining gap above, especially origin/geometry, full wall-side impact variants, water death, explosion occlusion/object callbacks, NPC selection, audio spatialization, and presentation.
