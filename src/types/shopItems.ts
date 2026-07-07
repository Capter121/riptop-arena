

export type ElementAttribute = 'WIND' | 'WATER' | 'ROCK' | 'LIGHTNING' | 'FIRE' | 'DARK' | 'LIGHT' | 'DIVINE';
export type MaterialTier = 'COMMON' | 'REFINED' | 'RARE' | 'LEGENDARY' | 'MYTHIC';
export type ComponentCategory = 'CHIP' | 'LAYER' | 'DISC' | 'DRIVER' | 'LAUNCHER';

export interface InstanceComponent {
  instanceId: string;
  baseTemplateId: string;
  category: ComponentCategory;
  attribute: ElementAttribute;
  tier: MaterialTier;
  equippedOnTopId?: string | null;
}
export const TIER_MULTIPLIERS: Record<MaterialTier, number> = {
  COMMON: 1.0,
  REFINED: 1.2,
  RARE: 1.5,
  LEGENDARY: 2.0,
  MYTHIC: 3.0,
};

export const ELEMENT_COLORS: Record<ElementAttribute, string> = {
  WIND: '#7ef0ff',
  WATER: '#0088ff',
  ROCK: '#ffaa00',
  LIGHTNING: '#ffff00',
  FIRE: '#ff3300',
  DARK: '#8800ff',
  LIGHT: '#ffffff',
  DIVINE: '#00ffaa',
};
