import type {
  BuildArchetype,
  BuildProfileAttribute,
  BuildProfileReason,
  BuildProfileResult,
} from '../../../shared/nss/build-profile';

const archetypeLabels: Record<BuildArchetype, string> = {
  ASSAULT: '强袭',
  FORTRESS: '堡垒',
  ENDURANCE: '耐久',
  COUNTER: '反击',
  BURST: '爆裂',
  BALANCED: '均衡',
};

const attributeLabels: Record<BuildProfileAttribute, string> = {
  attack: '攻击',
  defense: '防御',
  stamina: '持久',
  balance: '平衡',
  weight: '重量倾向',
  height: '高度倾向',
};

const affinityLabels = {
  WIND: '风', FIRE: '火', WATER: '水', WOOD: '木', EARTH: '土', LIGHT: '光', DARK: '暗',
} as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function reasonText(reason: BuildProfileReason): string {
  if (reason.kind === 'attribute') return `${attributeLabels[reason.attribute]} ${reason.value}`;
  if (reason.kind === 'counter-floor') return `最低项：${attributeLabels[reason.attribute]} ${reason.value}`;
  if (reason.kind === 'offense-resonance') {
    return `${reason.count} 件${affinityLabels[reason.affinity]}属性 · 元素进攻共鸣 +${percent(reason.bonus)}`;
  }
  if (reason.kind === 'balance-spread') return `四项最大差值 ${reason.value}`;
  return `协调共鸣 ${reason.distribution} · 防御 +${percent(reason.defenseBonus)} · 稳定性 +${percent(reason.stabilityBonus)}`;
}

export function BuildProfilePanel({ profile }: { profile: BuildProfileResult | null }) {
  if (!profile) return null;

  return (
    <section
      className="build-profile-panel"
      data-testid="build-profile-panel"
      data-profile={profile.primary}
      aria-labelledby="build-profile-title"
    >
      <div className="build-profile-heading">
        <span>构筑流派 · 仅作打法建议</span>
        <h3 id="build-profile-title" data-testid="build-profile-primary">{archetypeLabels[profile.primary]}</h3>
      </div>

      {profile.secondary.length > 0 && (
        <div className="build-profile-secondary" aria-label="次级构筑倾向">
          <span>次级倾向</span>
          {profile.secondary.map(archetype => (
            <strong data-testid="build-profile-secondary" data-archetype={archetype} key={archetype}>
              {archetypeLabels[archetype]}
            </strong>
          ))}
        </div>
      )}

      <ul className="build-profile-reasons" data-testid="build-profile-reasons">
        {profile.reasons.map((reason, index) => <li key={`${reason.kind}-${index}`}>{reasonText(reason)}</li>)}
      </ul>

      <p className="build-profile-disclaimer">构筑流派不提供额外加成；战斗中的战术切换仍由玩家决定。</p>
    </section>
  );
}
