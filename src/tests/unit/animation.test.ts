import { describe, expect, it } from 'vitest';
import { sourceAnimationDefinition, sourceAnimationPosition } from '../../shared/domain/animation';
import { selectSpriteFrames, spriteFrameBlend } from '../../client/rendering/sprite-engine';
import { PlayerObject } from '../../shared/game/gameobjects/player';
import { NpcObject } from '../../shared/game/gameobjects/npc';
import { parseStyle } from '../../shared/engine/loader/style-parser';
import { newCombat } from '../../shared/domain/combat/weapons';
import type { NpcState, PlayerState } from '../../shared/protocol/types';
import { npcDefaults, styleFixture } from './fixtures';

describe('source pedestrian animation data', () => {
  it('interpolates between looping sprite frames with wraparound', () => {
    expect(spriteFrameBlend(150, 100, 4)).toEqual({ frameIndex: 1, nextFrameIndex: 2, mix: .5 });
    expect(spriteFrameBlend(390, 100, 4)).toMatchObject({ frameIndex: 3, nextFrameIndex: 0 });
    expect(spriteFrameBlend(390, 100, 4).mix).toBeCloseTo(.9);
    expect(spriteFrameBlend(0, 100, 1)).toEqual({ frameIndex: 0, nextFrameIndex: 0, mix: 0 });
  });

  it('respects variable frame durations and holds the final non-looping frame', () => {
    expect(selectSpriteFrames(75, [50, 100, 25], false)).toEqual({ frameIndex: 1, nextFrameIndex: 2, mix: .25 });
    expect(selectSpriteFrames(175, [50, 100, 25], false)).toEqual({ frameIndex: 2, nextFrameIndex: 2, mix: 0 });
    expect(selectSpriteFrames(180, [50, 100, 25], true)).toEqual({ frameIndex: 0, nextFrameIndex: 1, mix: 0.1 });
  });

  it('keeps the decoded STY ranges aligned with Char_B4 states', () => {
    const style = parseStyle(styleFixture());
    const player = style.sprites.player;
    expect(player.walking).toHaveLength(8);
    expect(player.running).toHaveLength(8);
    expect(player.armedWalking).toHaveLength(8);
    expect(player.armedRunning).toHaveLength(8);
    expect(player.idleFrames).toHaveLength(4);
    expect(player.jumping).toHaveLength(8);
    expect(player.entering).toHaveLength(8);
    expect(player.exiting).toHaveLength(8);
    expect(player.falling).toHaveLength(17);
    expect(player.lying).toHaveLength(8);
    expect(player.lyingReverse).toHaveLength(8);
    expect(player.electrocuted).toHaveLength(5);
    expect(style.sprites.civilian.walking).toHaveLength(8);
    expect(Object.keys(style.sprites.civilianRemaps ?? {})).toHaveLength(25);
    expect(style.sprites.civilianRemaps?.[18]?.walking).toHaveLength(8);
    expect(style.sprites.cop.falling).toHaveLength(17);
    expect(sourceAnimationDefinition('walking')).toMatchObject({ state: 0, frameTicks: 3, loop: true });
    expect(sourceAnimationDefinition('running')).toMatchObject({ state: 1, frameTicks: 2, loop: true });
    expect(sourceAnimationDefinition('jumping')).toMatchObject({ state: 5, frameTicks: 3, loop: false });
    expect(sourceAnimationDefinition('entering').offsets).toEqual([24, 25, 26, 27, 32, 33, 34, 35]);
    expect(sourceAnimationDefinition('exiting').offsets).toEqual([36, 35, 34, 33, 28, 29, 30, 31]);
    expect(sourceAnimationDefinition('lying').frameTicksByFrame).toEqual([4, 4, 4, 4, 4, 4, 3, 3]);
    expect(sourceAnimationDefinition('electrocuted').loop).toBe(true);
    expect(sourceAnimationDefinition('falling')).toMatchObject({ state: 11, frameTicks: 2, loop: false });
    expect(sourceAnimationPosition('walking', .5)).toBe(4);
    expect(sourceAnimationPosition('lying', .75)).toBeGreaterThan(5);
  });
});

function playerState(): PlayerState {
  return { id: 'ped', x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, name: 'Ped', color: 0, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0, combat: newCombat() };
}

describe('ped animation transitions', () => {
  it('uses the successful-fire state instead of the held trigger alone', () => {
    const state = playerState();
    state.combat.attacking = true;
    state.combat.fireAnimation = 2;
    const sprite = new PlayerObject(state).getSprite(0);
    expect(sprite.animation).toBe('firing');
    expect(sprite.frame).toBeUndefined();
    state.combat.attacking = false; state.combat.fireAnimation = 0;
    state.combat.shots = [];
    expect(new PlayerObject(state).getSprite(0).animation).toBe('idle');
    state.combat.weapon = 8; state.combat.throwAnimation = 25;
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'throwingIdle', frame: 0 });
    state.combat.throwAnimation = 1;
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'throwingIdle', frame: 7 });
    state.combat!.throwAnimation = 0;
    expect(new PlayerObject(state).getSprite(0).animation).toBe('idle');
  });

  it('shows the firing pose during the cooldown caused by a successful shot', () => {
    const state = playerState();
    state.combat!.attacking = true;
    state.combat!.cooldown = 2;
    state.combat!.fireAnimation = 2;

    expect(new PlayerObject(state).getSprite(0).animation).toBe('firing');

    state.combat!.fireAnimation = 0;
    expect(new PlayerObject(state).getSprite(0).animation).toBe('idle');
  });

  it('maps jump, fall, entry, and exit transitions to source terminal frames', () => {
    const state = playerState();
    state.jump = { phase: 'rising', progress: .1, height: 12, baseZ: 0, vx: 170, vy: 0 };
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'jumping', frame: .8, presentation: { elevation: 12 } });
    state.jump.progress = .95;
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'jumping', frame: 7 });
    state.jump = undefined; state.combat!.respawn = 80;
    expect(new PlayerObject(state).getSprite(0).animation).toBe('falling');
    // Player::Wasted_567130 uses a 70-tick countdown; after 40 elapsed ticks
    // the 17-frame fall has completed and the source holds the dead pose.
    state.combat!.respawn = 30;
    expect(new PlayerObject(state).getSprite(0).animation).toBe('dead');
    state.combat!.respawn = 0; state.animation = { kind: 'entering', progress: 0 };
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'entering', frame: 0 });
    expect(new PlayerObject(state).getSprite(0).presentation).toBeUndefined();
    state.animation = { kind: 'exiting', progress: 1 };
    expect(new PlayerObject(state).getSprite(0)).toMatchObject({ animation: 'exiting', frame: 7, presentation: { band: 'underlay' } });
  });

  it('keeps NPC knockdown and firing states visible as authored sequences', () => {
    const state: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 40, kind: 'police', state: 'knockdown', animation: 'knockdown', panicTimer: 34 };
    expect(new NpcObject(state).getSprite(0)).toMatchObject({ animation: 'falling', frame: 0 });
    state.state = 'attack'; state.animation = 'firing'; state.panicTimer = undefined;
    expect(new NpcObject(state).getSprite(0).animation).toBe('firing');
    state.health = 0; state.state = 'dead'; state.animation = 'dead';
    expect(new NpcObject(state).getSprite(0).animation).toBe('dead');
  });

  it('plays the lethal fall before holding the NPC corpse pose', () => {
    const state: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' };
    const npc = new NpcObject(state);
    expect(npc.receiveWeaponHit(100)).toBe(false);
    expect(state.deathTimer).toBe(34);
    expect(npc.getSprite(0)).toMatchObject({ animation: 'falling', frame: 0, animationKey: 'npc:1:death-fall' });
    state.deathTimer = 2;
    expect(npc.getSprite(0)).toMatchObject({ animation: 'falling', frame: 16 });
    state.deathTimer = 0;
    expect(npc.getSprite(0)).toMatchObject({ animation: 'dead', animationKey: 'npc:1:dead' });
  });

  it('orients a lethal fall from the incoming hit direction', () => {
    const state: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' };
    const npc = new NpcObject(state);
    expect(npc.receiveWeaponHit(100, undefined, undefined, undefined, 0)).toBe(false);
    expect(state.rotation).toBe(0);

    const fromBehind: NpcState = { ...state, id: 2, health: 100, deathTimer: undefined, state: 'idle', animation: 'idle', rotation: 0 };
    const secondNpc = new NpcObject(fromBehind);
    expect(secondNpc.receiveWeaponHit(100, undefined, undefined, undefined, Math.PI)).toBe(false);
    expect(fromBehind.rotation).toBe(0);
    expect(fromBehind.deathPose).toBe('lying');
    expect(state.deathPose).toBe('lyingReverse');
    fromBehind.deathTimer = 0;
    expect(secondNpc.getSprite(0)).toMatchObject({ animation: 'lying', frame: 7, animationKey: 'npc:2:death-lying', mirrorY: false });
    state.deathTimer = 0;
    expect(npc.getSprite(0)).toMatchObject({ animation: 'lying', frame: 7, animationKey: 'npc:1:death-lying-mirrored', mirrorY: true });
  });

  it('keeps the authoritative walking animation when physics temporarily stops a ped', () => {
    const state: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'walk', animation: 'walking' };
    expect(new NpcObject(state).getSprite(0)).toMatchObject({ animation: 'walking', animationKey: 'npc:1:walking' });
  });

  it('carries the source civilian palette remap into the sprite command', () => {
    const state: NpcState = { ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', remap: 34, state: 'idle', animation: 'idle' };
    expect(new NpcObject(state).getSprite(0)).toMatchObject({ pedRemap: 34 });
  });
});
