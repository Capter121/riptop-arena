# HP Tug-of-War MVP Design

## Goal

Build a playable HP tug-of-war MVP for RIPTOP Arena without replacing the existing battle model. The current `integrity` value becomes the effective HP bar, turn resolution becomes the main source of readable damage, and existing burst finish visuals remain the death presentation.

The MVP should make battles feel like several meaningful exchanges instead of immediate winner-takes-all explosions, while preserving the current launch, physics collision, spirit, element attack, and burst systems.

## Current Context

The project already has most of the primitives needed for this change:

- `TopEntity` owns `integrity`, `stats.maxIntegrity`, `spin`, `stamina`, `lockStability`, `burst`, and `alive`.
- `buildStats` derives `maxIntegrity`, `maxSpin`, and `weight` from existing part stats.
- `Hud` already renders player and enemy integrity bars.
- `TurnArbitrator` exists inside `src/gameplay/battlePhysics.ts` and currently decides turn outcomes.
- `BattlePhysicsSystem` already applies small collision damage, spin loss, burst buildup, and lock stability damage.
- `ClashSystem` and `ClashPanel` exist, but are not fully connected to the main game loop.

This design treats the MVP as an integration and tuning pass, not a ground-up RPG rewrite.

## Scope

In scope:

- Reuse `integrity` as HP and `stats.maxIntegrity` as max HP.
- Add one focused turn damage calculation layer.
- Change turn outcomes so successful attacks deal HP damage instead of instantly bursting the loser.
- Keep normal physics collisions as low-grade chip damage and motion pressure.
- Add derived combat dimensions from existing stats: armor, evasion, crit chance, crit multiplier, and spirit regen bonus.
- Add lightweight floating combat text for damage, crit, miss, and block events.
- Improve HUD labeling and animation enough that the HP tug-of-war is visible.
- Auto-resolve same-tier attack clashes through stats for the MVP.
- Keep HP <= 0 mapped to the current burst finish path.

Out of scope:

- Renaming `integrity` to `hp` across the project.
- Hand-balancing every recipe component in `src/data/recipes.ts`.
- Adding manual button-mashing QTE.
- Replacing the existing collision physics model.
- Reworking all battle UI or splitting the large stylesheet as part of this MVP.
- Adding healing, lifesteal, or complex item actives unless already present as a perk hook.

## Combat Model

### Derived Stats

The MVP derives new combat concepts from the existing stat block. These should be calculated in one place so formulas can be tuned without scattering constants through the game.

- HP: `stats.maxIntegrity`.
- Armor: primarily `defense`, with a smaller contribution from `burstResist`.
- Evasion: primarily `mobility`, capped to avoid making defensive builds unreadable.
- Crit chance: primarily `attack`, with a smaller contribution from `mobility`.
- Crit multiplier: low baseline, increased by attack-heavy builds.
- Spirit regen bonus: primarily `stamina`, with room for future INT/perk hooks.

Armor should use a diminishing-return reduction formula instead of direct subtraction. A suitable MVP shape is:

```text
damageReduction = armor / (armor + K)
finalDamage = rawDamage * (1 - damageReduction)
```

`K` should be tuned so starter builds reduce modest damage but tank builds noticeably survive longer.

### Turn Outcomes

The turn system remains player action plus AI action.

- Attack vs charge: large vulnerability damage, guaranteed crit-like presentation, and extra lock stability damage.
- Attack vs wrong defense or wrong evade: normal hit damage, with a chance to crit.
- Attack vs correct defense or correct evade: miss or block result, no HP damage, defender gains spirit.
- Attack vs attack, higher tier: winner deals high damage; loser is not instantly burst unless HP reaches zero.
- Attack vs attack, same tier: auto clash. Both sides receive small shock damage, or the stronger side deals moderate damage based on attack, mobility, and current spirit.
- Non-attack vs non-attack: no HP damage; charge continues to generate spirit.

The existing odd/even tier defense logic can remain for the MVP. The key change is replacing direct burst elimination with damage events.

### Physical Collision Damage

Continuous collision damage should remain secondary. It provides pressure, ring-out setup, and visual activity, but the turn system should be the readable source of big HP swings.

Collision damage should not be removed. It should be checked during tuning so it does not overwhelm turn damage or end fights before players understand what happened.

### Death and Burst

When HP reaches zero:

- Mark the loser as no longer alive.
- Set `integrity` to zero.
- Fill burst as needed.
- Emit the existing `burst` event.
- Let existing result handling classify it as a burst finish.

This keeps the current spectacle while changing how a top reaches that state.

## Architecture

### Damage Engine

Add a focused module such as `src/gameplay/damage.ts`.

Responsibilities:

- Accept attacker, defender, action context, and outcome context.
- Calculate evasion, crit, armor reduction, HP damage, lock stability damage, and spirit side effects.
- Return a structured result rather than directly mutating UI.

Example result shape:

```ts
type DamageResult = {
  rawDamage: number;
  finalDamage: number;
  armorReduced: number;
  didCrit: boolean;
  didMiss: boolean;
  lockDamage: number;
  spiritDelta?: number;
  tags: Array<'hit' | 'crit' | 'miss' | 'block' | 'counter' | 'clash'>;
};
```

Mutation of `TopEntity` can happen in the caller or through a small `applyDamageResult` helper, but UI should consume events rather than duplicate the formula.

### Turn Arbitrator Integration

`TurnArbitrator` should keep deciding tactical outcomes, but it should no longer encode one-shot death in its logics.

The turn result should include damage metadata:

- which side was damaged,
- damage result,
- whether the result is safe from spin damage,
- whether a burst finish was triggered after HP application.

Because `TurnArbitrator` currently lives in `battlePhysics.ts`, the MVP can either keep it there or move it later. Moving it is not required for this implementation.

### Game Loop Integration

`Game.applyTurnVisuals` is the natural place to apply the turn result, emit effects, update combat log, and trigger burst when HP reaches zero.

It should:

- apply the structured damage result,
- emit floating text events,
- play existing spark/shock/audio feedback,
- trigger burst only when HP reaches zero,
- keep spirit deltas and charge behavior intact.

### Floating Combat Text

Add a small UI manager such as `src/ui/floatingTextManager.ts`.

Responsibilities:

- Maintain a pool/list of transient DOM elements.
- Convert top world position to screen coordinates using the camera.
- Render short labels such as `-42`, `CRIT -118`, `MISS`, and `BLOCK`.
- Animate upward movement, scale, opacity, and cleanup.

The manager should attach to the same parent layer as the HUD and update once per frame from `game.ts`.

### HUD

The existing integrity bars should be treated as HP bars.

MVP HUD changes:

- Change labels/copy to communicate HP or durability clearly.
- Clamp widths between 0 and 100 percent.
- Add CSS transition on bar width for readable damage.
- Optionally add a brief low-HP visual state when under 25 percent.

Avoid a full HUD redesign during this MVP.

## Data and Balance

Do not add five new required fields to every part for the MVP.

Instead:

- Keep `StatBlock` as the source data.
- Add derived combat values in `BattleStats` or a `DerivedCombatStats` helper.
- Use the 9 static part stats and existing upgrade levels as the initial tuning surface.
- Let recipe items continue to influence builds through tier multipliers, attributes, and perks.

Initial target pacing:

- Starter vs starter should usually last 4 to 7 meaningful turn exchanges.
- A successful attack into charge should remove roughly 30 to 45 percent HP.
- A normal successful hit should remove roughly 12 to 25 percent HP.
- A crit should feel dramatic but should not usually one-shot a full-health target.
- Continuous physics collision should matter over time but should not be the main cause of sudden death.

## Error Handling and Edge Cases

- Clamp HP after every damage application.
- Clamp bar percentages before writing DOM widths.
- If `maxIntegrity` is zero or invalid, fall back to a safe denominator of 1.
- Prevent duplicate burst events with the existing `burstResolvedThisFrame` flag.
- If floating text projection fails because an object is off camera, skip the text instead of throwing.
- If a turn result has no defender or damage target, treat it as a visual-only result.
- Preserve existing ring-out, spin finish, and timeout behavior.

## Verification

Automated checks:

- Run `npm run build`.
- Add focused unit-style tests only if the project already has a test harness available during implementation; otherwise keep the damage formulas isolated enough for future tests.

Manual checks:

- Starter vs starter: verify multiple turns happen before burst.
- Tank build vs attack build: verify armor reduces normal hit damage.
- High mobility build: verify occasional miss text appears, but fights do not stall.
- Attack into charge: verify high damage, crit/counter presentation, and lock stability loss.
- Correct defense/evade: verify no HP damage and spirit reward.
- Same-tier attack clash: verify auto clash happens and neither side instantly dies from full HP.
- HP reaches zero: verify existing burst finish visuals and result screen still work.
- Collision-only battle: verify chip damage remains secondary and ring-out/spin finish still work.
- Mobile/touch layout: verify floating text and HP bars do not block the turn panel.

## Recommended Implementation Order

1. Add derived combat stat helpers and a small damage engine.
2. Extend turn resolution to carry structured damage results.
3. Apply damage results in `Game.applyTurnVisuals` and trigger burst on HP zero.
4. Update HUD copy, bar clamping, and bar animation.
5. Add floating combat text and wire it to turn damage events.
6. Tune constants using starter, tank, attack, and mobility builds.
7. Run build and manual gameplay checks.

## Open Decisions

The MVP uses automatic same-tier clash resolution. Manual QTE remains a later feature.

The MVP uses derived stats rather than hand-authored stats for every recipe component. Full item rebalance remains a later balance pass after the core loop feels good.
