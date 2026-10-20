import { isVehicleWeapon, newCombat, WEAPONS, WeaponId, type WeaponDefinition } from './weapons';
import type { CombatState } from '../../protocol/types';

export type WeaponBehavior = 'hitscan' | 'projectile' | 'explosive' | 'hazard';

/** Central typed access point for weapon rules used by the world runtime and clients. */
export class WeaponSystem {
  readonly definitions: readonly WeaponDefinition[] = WEAPONS;

  get(id: number): WeaponDefinition {
    return this.definitions[id] ?? this.definitions[WeaponId.Pistol]!;
  }

  behavior(id: number): WeaponBehavior {
    const definition = this.get(id);
    if (definition.moving || definition.kind === 'rocket' || definition.kind === 'explosive') return 'projectile';
    if (definition.kind === 'slick' || definition.kind === 'mine') return 'hazard';
    return 'hitscan';
  }

  isVehicleWeapon(id: number) { return isVehicleWeapon(id); }
  maxAmmo(id: number) { return this.get(id).maxAmmo ?? this.get(id).ammo; }
  defaultAmmo(id: number) { return this.get(id).ammo; }
  sourceDefaultAmmo(id: number) { return this.get(id).sourceDefaultAmmo ?? this.get(id).ammo; }
  createCombat(): CombatState { return newCombat(); }
}

