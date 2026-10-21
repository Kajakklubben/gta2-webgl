# GTA2 reverse-engineering references

This document records source-derived behavior used by the current shared
implementation. Gameplay rules live under `src/shared/domain` and
`src/shared/game`; loaders and protocol adapters consume the decoded values,
while client rendering remains a separate presentation layer. The references
below are research inputs, not runtime dependencies.

The public decompiled/reimplementation source used to cross-check GTA2 object
models, weapon projectiles, and sprite definitions is:

- [CriminalRETeam/gta2_re](https://github.com/CriminalRETeam/gta2_re)
- [Weapon_30.cpp](https://raw.githubusercontent.com/CriminalRETeam/gta2_re/master/Source/Weapon_30.cpp)
- [gtx_0x106C.cpp](https://raw.githubusercontent.com/CriminalRETeam/gta2_re/master/Source/gtx_0x106C.cpp) — style/CARI loading and sprite-base resolution
- [Car_BC.cpp](https://raw.githubusercontent.com/CriminalRETeam/gta2_re/master/Source/Car_BC.cpp) — car sprite creation and rotation
- [Car_10.cpp](https://raw.githubusercontent.com/CriminalRETeam/gta2_re/master/Source/Car_10.cpp) — CARI door slots and the four-frame open/close animation
- [CarPhysics_B0.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/CarPhysics_B0.cpp) — throttle, wheel forces, steering, velocity integration, and gear-sensitive speed limits
- [CarAI_78.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/CarAI_78.cpp) — arrow/junction route selection for traffic
- [Player.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/Player.cpp) — control bit decoding, turn acceleration, and player input dispatch
- [char.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/char.cpp) — fixed-step ped velocity, reverse movement, collision, and jump state
- [Ped.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/Ped.cpp) — target movement, path points, facing, and regulated pedestrian velocity
- [ObjectDefinitions_8CA8.cpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/ObjectDefinitions_8CA8.cpp)
- [ObjectDefinitions_8CA8.hpp](https://github.com/CriminalRETeam/gta2_re/blob/master/Source/ObjectDefinitions_8CA8.hpp)
- [GTAMP reverse-engineering summary](https://gtamp.com/forum/viewtopic.php?p=13959)

## Local source checkout

For offline inspection, the upstream decompilation is also checked out locally
at [`references/gta2_re/`](../references/gta2_re/). The checkout is intentionally
ignored by the main repository, so it remains a local reference rather than a
vendored build dependency. It currently tracks the upstream `master` branch at
`4047554` and can be refreshed with:

```sh
git -C references/gta2_re pull --ff-only
```

Use the local `Source/` files for source lookups first; the upstream links above
remain useful for sharing exact references and reviewing line history.

The local copy of the STY format documentation is
[GTA2 Style STY graphics file format – GTAMP.com](./GTA2%20Style%20STY%20graphics%20file%20format%20%E2%80%93%20GTAMP.com.html).

The player-controlled vehicle runtime mirrors the decompiled update order: ramp the throttle, choose the
GCI gear multiplier, resolve front/rear grip, update linear and angular
acceleration, integrate position and heading, apply coasting/braking damping,
and clamp velocity using `max_speed` when aligned or `gear2 speed` while
sliding. Player vehicles use this integrator. NPCs use the corresponding source pattern of a target point plus
regulated velocity, with route points centered in their map tiles.

The GCI speed fields are decoded Fix16 map-tile velocities per fixed tick. GTA2's
Fix16 one is `0x4000`, and the browser runtime converts those values to world
pixels per second at the fixed-step boundary (`64` pixels per tile at `30` ticks
per second). Player movement uses Char_B4's `4 * 256` raw run velocity and
`64`-unit per-tick acceleration through the same boundary, so player driving,
traffic targets, and gear caps use one source-derived unit system.

## Vehicle occupancy and entry

`Car_BC::CanBeEnteredByPed`, `IsEnterable`, `CanExitCar`, and
`IsDoorAccessible` are the authority for the runtime's entry gates. A CARI
record supplies the passenger count and each door's `rx/ry`; the source removes
the straight-entry marker, applies the `0xCCC` fixed-point centre correction,
then checks the door route against map walls. `Ped::FindUsableCarDoor` chooses
an accessible door and `EnterCarStateMachine`/`ExitCarStateMachine` move the ped
through that door while recording the target door and occupant. `Car_Door_10`
advances frames 0 through 4 with its delay field and closes the door after the
ped is seated. `src/shared/domain/vehicles/vehicle-occupancy.ts` mirrors those rules in one
authoritative state machine: seat 0 is the driver, CARI `passengers` creates
additional seats, and every occupant carries its seat, door, and transition
phase. The replicated traffic snapshot retains the old driver/passenger aliases
for compatibility while clients attach seated players/NPCs to the vehicle and
hide their independent sprite.

## Weapon dispatch map

`src/shared/domain/combat/weapons.ts` keeps the project's stable multiplayer weapon slots and
records the source `weapon_type`, cooldown, projectile object model, and
Ang16 spread for each slot. The firing loop follows
`Weapon_30::pull_trigger_5E3670`: pistol 265, SMG/silenced SMG 254, rocket 128,
electro baton 277, shotgun five model-192 pellets, dual pistol two model-265
pellets, flamethrower model-154 stream segments, and the car SMG's two muzzle
points. `throwable_5DDFC0` is represented as a held `throwCharge` state with the
source grenade timeout at 96; release creates a moving projectile and impact
detonation. Its release velocity is kept as the source Fix16 formula: grenade
`0xA3 + strength/60 * (0x666 + 0x147)`, molotov `0x147 + strength/60 * 0x666`,
with the source 14-fractional-bit scale and fixed tick rate applied at the
world boundary. When the ped is moving, `throwable_5DDFC0` calls
`SetMovementVector_5224E0` and adds the source `0x340` Fix16 carried-velocity
boost; the runtime applies that boost after converting it to world pixels per
second. `oil_stain_5E1DC0` and `car_mine_5E2550` use the vehicle's
rotated rear offsets and consume ammunition only after the map placement check
succeeds.

Projectile visuals resolve through the STY code-object bank using the source
model ranges in `src/shared/domain/world/gta2-sprites.ts`. The source Object_2C ids are kept
separate from SCR/STY pickup sprite ids: `oil_stain_5E1DC0` creates source model
8 while its pickup art is model 216, and `car_mine_5E2550` creates source model
10 while its pickup art is model 217. Moving objects integrate velocity and
collide with the same map wall backend as players and cars; explosions, molotov
fire, mines, and oil slick grip changes are authoritative server state.

The electrical weapons keep the source ped effect separate from ordinary
health damage. `shocker_5E06B0` marks a hit ped with
`field_210_shock_counter += 5` and uses its direct `AccumulateDamage(300)` car
packet; `electro_batton_5E0740` uses the short beam path, adds the smaller
shock counter, and its direct ped branch applies `TakeDamage(3)`. The runtime
replicates these counters as `CombatState.shockCounter` and
`NpcState.shockCounter`, selecting the decoded `electrocuted` animation while
they are active.

Traffic steering also follows the source's `AlignToLaneCenter_44AF00` behavior:
cars correct their lateral offset back toward the current arrow lane before
taking the planned junction turn. The debug overlay can show the active route
target and following segment so route selection and steering drift can be
distinguished from physics errors.

## Vehicle damage lifecycle

`Car_BC::AccumulateDamage_43DA90` is the authority for the damage accumulator.
It multiplies each object packet by the model's GCI `anti strength`, clamps the
accumulator to `32000`, starts the level-one fire at `16000`, upgrades to the
level-two fire at `25000`, prepares the explosion at `31500`, and calls
`HandleCarExplosion_43D840` at `32000`. The explosion sets the post-explosion
sentinel `32001`, kills occupants, applies the source impulse, and starts the
50-tick wreck countdown. `CountDownToWreck_441360` then calls
`TurnToWreck_4436A0`, which selects the CARI `wreck` sprite, clears the live
damage deltas, and starts the separate `car_fire_4` wreck fire.

The browser implementation keeps that raw accumulator in `TrafficState.damage`
and derives the compatibility `health` field from it. `src/shared/domain/combat/vehicle-damage.ts`
owns the thresholds and countdown; `GameWorld` owns authoritative source
packets, fire hazards, occupant death, and replicated transitions. The fire
hazards use the decoded source code-object models 12 and 13 for the level-one
and level-two car fires, the explosion bank for the one-shot detonation, and
model 4 for the final `car_fire_4` wreck fire. Direct object damage uses the
source packets (rocket/molotov/mine 32000, grenade model 183 through the
handler's default 800 packet, fire-hitting 100, pistol 1600, machine-gun/shotgun
pellet 800); flamethrower stream model 154, oil slick model 8, and electro-baton
model 277 are not direct car-damage packets. The stun beam is the explicit
300-unit car exception described above. A grenade's separate blast still
applies area damage when it detonates.
`VehicleObject` resolves the
authored DELX dent frame or CARI wreck sprite. This keeps the gameplay state
independent from the Three.js presentation while allowing clients to render the
same lifecycle from snapshots.

## Pedestrian jumping over cars

`Player::DoPedControlInputs_566C80` triggers `Ped::DoJump_433C40` on the
rising edge of the source jump control (bit `0x40`) when the player is on foot.
`Char_B4::DoJump_5454D0` records the base floor z, switches to the jumping
animation, and carries the run/jump velocity. `Char_B4::HandleGenericCollision_54A530`
allows an active jumping ped to clear a car while preserving ordinary wall and
slope collision. The runtime represents the same state as `PlayerState.jump`:
the server advances a fixed-step rising/apex/falling arc, replicates its base
floor and carry velocity, removes only the vehicle collision mask during the
arc, and renders the authored running frames with a depth offset. CARI's
`info_flags.ped_jump` exception is retained: vehicles marked too high remain
solid while the ped is airborne. `P` and the mobile `JUMP` button send the
explicit action pulse.

## Pedestrian animation state machine

`Char_B4::UpdateAnimState` owns one fixed-step frame timer. The timer advances
the unarmed walking frames (`base+0..7`) every three ticks, running frames
(`base+8..15`) every two ticks, armed walking/running (`base+37..52`) with the
same delays, and the four idle frames (`base+53..56`) every nine ticks. Firing
is a held static pose at `base+139`; it is independent of the transient bullet
object, so the multiplayer snapshot carries a separate `CombatState.attacking`
flag. Throwing uses state 4 and loops `base+115..122` while stationary or
`base+123..130` while moving, also at three ticks per frame.

The jump state is state 5 (`base+16..22`, then the landing frame `base+23`),
normal entry is state 6 (`base+24..27`, then `base+32..35`; straight-entry
doors use `base+0..7`), and the normal exit transition is state 7
(`base+36,35,34,33,28,29,30,31`). Normal/lethal falls use state 11/12
(`base+81..97`), while lying, reverse lying, and electrocution use states
15/16/17. `src/shared/domain/animation.ts` is the runtime table for those source
states; the style decoder, `PlayerObject`/`NpcObject`, and `SpriteView` all use
it. Each object has an independent animation clock keyed by its state-machine
transition, so a remote snapshot changes sequence once and then continues from
the correct frame instead of restarting from the global wall clock.

## Player movement and turning

`Player::CharacterControls_566520` translates the control bitfield into
forward, reverse, left, right, attack, and jump states. `DoPedControlInputs_566C80`
does not turn a ped at a constant radian rate: it accumulates `field_8_turn_speed`
by `field_A_turn_accel`, clamps it to `kMaxTurnSpeed` (48 Ang16 units), and
clears it immediately when neither steering key is held. The normal acceleration
is 20 Ang16 units per fixed update (`4 + (12 + 4)`); jumping uses 4 with a 24
unit cap, and attack-only turning uses 12. Ang16 has 2048 units per full turn.

`Char_B4` then adds that turn speed to the ped angle and updates the scalar
velocity. A zero velocity jumps to the authored run speed; otherwise the value
approaches it by `dword_6FD99C` (64 Fix16 units, one sixteenth of the 1024-unit
run speed). Reverse temporarily adds 180 degrees to the movement heading and
restores the original facing after the step. The runtime keeps the same values
in `PlayerState.movement`, converts the scalar to world-pixel `vx/vy` at the
fixed-step boundary, and includes it in snapshots so every client can render
the authoritative source movement state consistently.

