import * as THREE from 'three';
import { LAUNCH_MAX_POWER } from '../app/config';
import { TUNING } from '../data/tuning';
import { clamp } from '../utils/math';
import type { TopEntity } from './top';
import { globalInventory } from '../data/inventoryManager';
import { TIER_MULTIPLIERS } from '../types/shopItems';

export function launchTop(top: TopEntity, towardCenterBias: THREE.Vector2, power: number, angleOffset: number) {
  const charge = clamp(power, 0.15, LAUNCH_MAX_POWER);
  const direction = towardCenterBias.clone().normalize();
  direction.rotateAround(new THREE.Vector2(0, 0), angleOffset);
  const speed = TUNING.launchSpeedMin + (TUNING.launchSpeedMax - TUNING.launchSpeedMin) * charge;

  top.velocity.copy(direction.multiplyScalar(speed));
  top.spin = top.stats.maxSpin * (0.9 + charge * 0.22);

  // Apply Launcher Effects
  const launcherInst = globalInventory.getItems().find(i => i.category === 'LAUNCHER');
  if (launcherInst) {
    const mult = TIER_MULTIPLIERS[launcherInst.tier] || 1;
    top.spin *= mult;
    
    if (launcherInst.baseTemplateId === 'launcher_mjollnir') {
      top.lightningTimer = 3; 
      top.statusEffects.push({ id: 'lightningAura', duration: 3, remaining: 3, sourceSkill: 'launcher' as any });
    }
  }

  top.stamina = top.spin;
}
