import { type InstanceComponent } from '../types/shopItems';

type InventoryListener = (inventory: InstanceComponent[]) => void;

import { BASE_COMPONENTS } from './recipes';

export interface MarketSlot {
  item: InstanceComponent;
  price: number;
  sold: boolean;
}

import { ItemGenerator } from './parts';
import type { MaterialTier } from '../types/shopItems';

const TIER_PRICES: Record<MaterialTier, number> = {
  COMMON: 200,
  REFINED: 400,
  RARE: 800,
  LEGENDARY: 1500,
  MYTHIC: 3000,
};

export class InventoryManager {
  private items: InstanceComponent[] = [];
  private listeners: Set<InventoryListener> = new Set();

  public marketItems: MarketSlot[] = [];
  public refreshCount: number = 0;

  constructor() {
    this.initMockInventory();
    this.refreshMarket(true); // Initial free refresh
  }

  public getRefreshCost(): number {
    if (this.refreshCount === 0) return 0;
    return this.refreshCount * 200;
  }

  public refreshMarket(free: boolean = false): void {
    if (!free) {
      this.refreshCount++;
    }
    
    this.marketItems = [];
    // Always 1 guaranteed blind box (COMMON)
    const blindBox = ItemGenerator.generateRandom({ minTier: 'COMMON', allowDivine: false });
    this.marketItems.push({
      item: blindBox,
      price: 200,
      sold: false
    });

    // Generate 5 random items with varying rarity
    for (let i = 0; i < 5; i++) {
      const item = ItemGenerator.generateRandom({ allowDivine: true });
      this.marketItems.push({
        item,
        price: TIER_PRICES[item.tier] || 200,
        sold: false
      });
    }
  }

  public purchaseMarketItem(index: number, currentCoins: number, maxCapacity: number = 100): { success: boolean; cost: number; error?: string } {
    const slot = this.marketItems[index];
    if (!slot || slot.sold) {
      return { success: false, cost: 0, error: '商品不存在或已售罄' };
    }
    if (currentCoins < slot.price) {
      return { success: false, cost: 0, error: '金币不足' };
    }
    if (this.items.length >= maxCapacity) {
      return { success: false, cost: 0, error: '背包已满' };
    }

    slot.sold = true;
    this.addComponent(slot.item);
    return { success: true, cost: slot.price };
  }

  private initMockInventory() {
    const testIds = [
      'layer_stout_buffer', 'layer_chain_lock', 'layer_iron_will', 'layer_vanguard', 'layer_headdress',
      'chip_cast_iron', 'chip_titanium_lock', 'chip_bracer_core', 'chip_impact_shield',
      'disc_vitality', 'disc_reaver', 'disc_platemail', 'disc_perseverance',
      'driver_health_bearing', 'driver_regen_spring', 'driver_tranquil',
      'launcher_heavy_ripcord',
    ];

    const elements: import('../types/shopItems').ElementAttribute[] = ['WIND', 'WATER', 'FIRE', 'LIGHTNING'];

    for (let i = 0; i < 3; i++) {
      for (const id of testIds) {
        const base = BASE_COMPONENTS[id];
        if (base) {
          this.items.push({
            instanceId: `inv_${Math.random().toString(36).substring(2, 11)}`,
            baseTemplateId: id,
            category: base.category,
            attribute: elements[Math.floor(Math.random() * elements.length)],
            tier: 'COMMON',
          });
        }
      }
    }
  }

  public getItems(): InstanceComponent[] {
    return [...this.items];
  }

  public addComponent(item: InstanceComponent) {
    this.items.push(item);
    this.notify();
  }

  public removeComponents(instanceIds: string[]) {
    this.items = this.items.filter(item => !instanceIds.includes(item.instanceId));
    this.notify();
  }

  public subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.getItems());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentItems = this.getItems();
    this.listeners.forEach(l => l(currentItems));
  }
}

// Global singleton
export const globalInventory = new InventoryManager();
