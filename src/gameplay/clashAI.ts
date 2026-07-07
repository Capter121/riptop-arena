import type { EnemyPreset } from '../data/enemies';
import type { ClashAction } from './clash';

export class ClashAI {
  private preset: EnemyPreset;
  constructor(preset: EnemyPreset) {
    this.preset = preset;
  }

  decide(energy: number, playerLastAction: ClashAction | null, hasStealthEffect: boolean = false): ClashAction {
    const r = Math.random();

    if (hasStealthEffect && Math.random() < 0.3) {
      // Tactical stealth misdirection: 30% chance to completely ignore player's pattern
      const roll = Math.random();
      if (roll < 0.25) return { type: 'attack', power: Math.random() > 0.5 ? 2 : 1 };
      if (roll < 0.50) return { type: 'defend' };
      if (roll < 0.75) return { type: 'dodge' };
      return { type: 'charge' };
    }

    let wAttack = 0, wDefend = 0, wDodge = 0, wCharge = 0;
    
    if (this.preset.name === 'Blaze Fang') {
      wAttack = 0.55; wDefend = 0.10; wDodge = 0.10; wCharge = 0.25;
      if (energy < 3) wCharge += 0.3;
    } else if (this.preset.name === 'Rift Drift') {
      wAttack = 0.25; wDefend = 0.15; wDodge = 0.40; wCharge = 0.20;
      if (playerLastAction?.type === 'attack' && (playerLastAction.power || 0) % 2 === 0) {
        wDodge += 0.3;
      }
      if (energy > 6) wAttack += 0.3;
    } else { // Atlas Guard (or default)
      wAttack = 0.20; wDefend = 0.40; wDodge = 0.15; wCharge = 0.25;
      if (energy > 7) wAttack = 2.0; 
    }

    const total = wAttack + wDefend + wDodge + wCharge;
    let roll = r * total;
    
    let actionType: 'attack' | 'defend' | 'dodge' | 'charge' = 'defend';
    if (roll < wAttack) actionType = 'attack';
    else if (roll < wAttack + wDefend) actionType = 'defend';
    else if (roll < wAttack + wDefend + wDodge) actionType = 'dodge';
    else actionType = 'charge';

    if (actionType === 'attack') {
      if (energy >= 3) return { type: 'attack', power: this.preset.name === 'Rift Drift' ? 1 : (Math.random() > 0.5 ? 2 : 3) };
      if (energy >= 2) return { type: 'attack', power: 2 };
      if (energy >= 1) return { type: 'attack', power: 1 };
      return { type: 'charge' };
    }

    return { type: actionType };
  }
}
