# HP-Driven Visual Spin Floor

## Goal

Keep both player and enemy tops visibly rotating at a stable, attractive speed for as long as they are alive and have positive HP. Visual rotation should slow as HP falls, but it must not stop or appear close to stopping before defeat.

This is a presentation change only. It must not alter combat `spin`, stamina, collision physics, damage, turn outcomes, timeout scoring, or finish rules.

## Confirmed Root Cause

`TopEntity.syncMesh()` currently derives visual angular speed from:

```text
spinRatio = spin / maxSpin
```

Physics integration continues draining `spin` during turn approach and resolution. The current turn-driven main loop does not call `RuleSystem.update()` for spin-finish arbitration, so a top can remain alive with positive `integrity` after combat `spin` reaches zero.

Because visual angle integration uses that zero `spinRatio`, the mesh stops rotating even though the top has not been defeated.

## Selected Model

Use HP ratio as the source of visual spin speed while the top is alive:

```text
hpRatio = clamp(integrity / maxIntegrity, 0, 1)
visualSpinRatio = 0.35 + 0.65 * hpRatio
```

When the top is defeated, visual spin ratio becomes zero and the existing burst/topple animation owns presentation.

Reference values:

| HP | Visual speed |
| ---: | ---: |
| 100% | 100% |
| 50% | 67.5% |
| 25% | 51.25% |
| 1 HP | approximately 35% |
| 0 HP / defeated | 0% |

The formula applies symmetrically to player and enemy tops.

## Visual Consumers

Use the HP-driven ratio consistently for:

- core and weight-disc angular integration,
- attack-ring angular integration,
- shutter-speed blur-ring visibility and opacity,
- normal spin-dependent emissive intensity,
- low-health wobble thresholds.

Do not use HP ratio for movement velocity, collision impulse, spin loss, stamina drain, or gameplay modifiers.

## Low-HP Stability

Low HP should communicate damage without making the top look mechanically broken before defeat.

- Begin low-health wobble below 20% HP.
- Keep wobble amplitude modest and capped below the current chaotic spin-loss wobble.
- The wobble must not alter accumulated angular speed.
- At positive HP, the top remains upright enough that its body and ring are readable.
- Existing hit, evade, defense, and charge motion overlays continue to apply.

## Defeat Boundary

Visual rotation may stop only when either condition is true:

- `integrity <= 0`, or
- `alive === false` because an existing ring-out, burst, timeout, or explicit elimination path completed.

The existing burst shrink and spin-finish topple animations remain unchanged after that boundary.

## Architecture and Files

- `src/gameplay/top.ts`: add one derived visual HP ratio helper and use it throughout visual synchronization.
- `src/app/game.ts`: extend QA diagnostics with the derived visual spin ratio and add QA-only helpers for setting HP/combat spin and sampling one second of visual rotation.

No other gameplay, UI, arena, material, or physics file should be modified for this feature.

## Edge Cases

- Invalid or zero `maxIntegrity` uses a denominator of 1.
- Integrity above max is clamped to 100% visual speed.
- Negative integrity is clamped to zero.
- Positive fractional HP still receives at least 35% visual speed.
- Paused gameplay still advances no visual angle because `dt` remains zero.
- A defeated top receives zero visual spin even if stale integrity remains positive.
- Reset restores full HP and therefore full visual speed.

## Verification

### Automated checks

- Run `npm run build`.
- Run `git diff --check`.

### Deterministic QA checks

Sample one simulated second at fixed positive HP values and confirm the derived visual ratios:

- 100% HP: `1.0`
- 50% HP: `0.675`
- 25% HP: `0.5125`
- 1 HP: at least `0.35`
- 0 HP: `0`

Compare simulated 60, 30, and 20 FPS runs at each HP value. Per-second core rotation must remain within 1% across frame rates.

### Browser checks

1. Reduce enemy HP through repeated turns while allowing combat `spin` to reach zero.
2. Confirm the enemy continues rotating at positive HP.
3. Confirm visual rotation slows smoothly as HP drops.
4. Confirm the top remains visually stable near 1 HP.
5. Reduce HP to zero and confirm rotation yields to the existing defeat animation.
6. Repeat for the player side.
7. Verify Classic Grid and Absolute Zero scenes on desktop and mobile with no console/page errors.

## Success Criteria

- No alive top with positive HP can have zero visual angular speed.
- Near-zero positive HP retains at least 35% of full visual angular speed.
- Visual speed is monotonic with HP and reaches 100% at full HP.
- Player and enemy behavior is identical.
- Combat balance and finish conditions are unchanged.
