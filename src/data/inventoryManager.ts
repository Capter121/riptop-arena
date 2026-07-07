import { type InstanceComponent } from '../types/shopItems';

type InventoryListener = (inventory: InstanceComponent[]) => void;

import { BASE_COMPONENTS } from './recipes';

export class InventoryManager {
  private items: InstanceComponent[] = [];
  private listeners: Set<InventoryListener> = new Set();

  constructor() {
    this.initMockInventory();
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
