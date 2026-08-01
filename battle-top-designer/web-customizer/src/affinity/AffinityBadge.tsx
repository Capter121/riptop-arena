import type { PartAffinity } from '../../../shared/nss/affinity';

const affinityVisuals: Record<PartAffinity, { icon: string; label: string }> = {
  WIND: { icon: '≋', label: '风' },
  FIRE: { icon: '◆', label: '火' },
  WATER: { icon: '●', label: '水' },
  WOOD: { icon: '✦', label: '木' },
  EARTH: { icon: '⬢', label: '土' },
  LIGHT: { icon: '☀', label: '光' },
  DARK: { icon: '☾', label: '暗' },
};

export function AffinityBadge({ affinity, compact = false }: { affinity: PartAffinity; compact?: boolean }) {
  const visual = affinityVisuals[affinity];
  return (
    <span className={`affinity-badge affinity-${affinity.toLowerCase()} ${compact ? 'compact' : ''}`} data-affinity={affinity} aria-label={`${visual.label}属性`}>
      <span className="affinity-badge-icon" aria-hidden="true">{visual.icon}</span>
      <span className="affinity-badge-label">{visual.label}</span>
    </span>
  );
}
