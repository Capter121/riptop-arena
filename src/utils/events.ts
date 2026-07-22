import type { ClashAction } from '../gameplay/clash';

type EventMap = {
  spark: { x: number; z: number; intensity: number };
  shield_block: { x: number; z: number; side: 'player' | 'enemy'; shieldHits: number };
  retreat_reverse_trigger: { x: number; z: number; side: 'player' | 'enemy' };
  burst: { winner: 'player' | 'enemy'; loser: 'player' | 'enemy' };
  launch: { side: 'player' | 'enemy'; power: number };
  dash: { side: 'player' | 'enemy' };
  finish: { winner: 'player' | 'enemy'; kind: string };
  impact: { intensity: number };
  collision_damage: { side: 'player' | 'enemy'; amount: number; x: number; z: number; intensity: number };
  battle_start: {};
  clash_start: {};
  clash_input: ClashAction;
  clash_resolved: { playerPush: number; enemyPush: number; playerDamage: number; enemyDamage: number; log: string };
};

type EventName = keyof EventMap;

type Listener<T extends EventName> = (payload: EventMap[T]) => void;

export class EventBus {
  private listeners = new Map<EventName, Set<Listener<any>>>();

  on<T extends EventName>(event: T, listener: Listener<T>) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }

  emit<T extends EventName>(event: T, payload: EventMap[T]) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(payload);
    }
  }
}
