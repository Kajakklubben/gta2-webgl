import type { PlayerState } from '../../../protocol/types';
import { sourceAnimationDefinition, sourceAnimationPosition } from '../../../domain/animation';
import { WORLD } from '../../../domain/world/world';
import type { GameObjectPlacement, GameObjectSprite } from '../gameobject';

export function playerSprite(state: PlayerState, placement: GameObjectPlacement): GameObjectSprite {
  const combat = state.combat;
  const spritePlacement: GameObjectPlacement = { ...placement, rotation: state.rotation - Math.PI };
  const base = (animation: Parameters<typeof sourceAnimationDefinition>[0], extra: Partial<GameObjectSprite> = {}): GameObjectSprite => {
    const definition = sourceAnimationDefinition(animation);
    const sprite: GameObjectSprite = { atlas: 'player', definition: { bank: 'ped', sourceId: 0 }, animation, frameTicks: definition.frameTicks, loop: definition.loop, placement: spritePlacement, opacity: 1, alphaTest: .01, shadow: { opacity: .3, scale: .55, offsetY: 4 }, ...extra };
    return definition.frameTicksByFrame ? { ...sprite, frameTicksByFrame: definition.frameTicksByFrame } : sprite;
  };
  if (combat.respawn > 0) {
    const elapsed = Math.max(0, WORLD.player.deathCountdown - combat.respawn);
    return elapsed < 34 ? base('falling', { frame: Math.min(16, Math.floor(elapsed / 2)), animationKey: 'player-death-fall' }) : base('dead', { animationKey: 'player-dead' });
  }
  if (state.drowningTimer !== undefined) return base('idle', { frame: 0, scale: Math.max(.2, state.drowningTimer / WORLD.player.waterDeathTicks), opacity: state.vehicleId === undefined ? 1 : 0, animationKey: 'player-drowning' });
  if (state.animation?.kind === 'entering') {
    const animation: 'walking' | 'entering' = state.animation.straightEntry ? 'walking' : 'entering';
    return base(animation, { frame: sourceAnimationPosition(animation, state.animation.progress), animationKey: 'player-entering' });
  }
  if (state.animation?.kind === 'exiting') {
    const animation: 'walking' | 'exiting' = state.animation.straightEntry ? 'walking' : 'exiting';
    return base(animation, { frame: sourceAnimationPosition(animation, state.animation.progress), animationKey: 'player-exiting', presentation: { band: 'underlay' } });
  }
  if (state.animation?.kind === 'seated') return base('idle', { opacity: 0, animationKey: 'player-seated' });
  const speed = Math.hypot(state.vx, state.vy), jumping = state.jump, weapon = combat.weapon;
  if (combat.electrocuted) return base('electrocuted', { animationKey: 'player-electrocuted' });
  if (jumping) return base('jumping', { frame: sourceAnimationPosition('jumping', jumping.progress), animationKey: 'player-jump', presentation: { elevation: jumping.height } });
  const throwable = weapon === 4 || weapon === 8, throwRemaining = combat.throwAnimation;
  if (throwable && (combat.throwing || throwRemaining > 0)) {
    const animation: 'throwing' | 'throwingIdle' = speed > 0.05 ? 'throwing' : 'throwingIdle';
    const progress = combat.throwing ? (combat.throwCharge / 3 % 8) / 8 : Math.max(0, Math.min(1, (25 - throwRemaining) / 24));
    return base(animation, { frame: sourceAnimationPosition(animation, progress), animationKey: 'player-throw' });
  }
  if (combat.fireAnimation > 0 && !throwable) return base('firing', { animationKey: 'player-fire' });
  if (speed > WORLD.player.runAnimationThreshold) return base('armedRunning', { animationKey: 'player-movement' });
  if (speed > 0.05) return base('armedWalking', { animationKey: 'player-movement' });
  return base('idle', { animationKey: 'player-idle' });
}
