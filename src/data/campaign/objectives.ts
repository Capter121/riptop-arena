import type { CampaignObjective } from './opponents';

export function campaignObjectiveText(objective: CampaignObjective): string {
  switch (objective.kind) {
    case 'primary_affinity': return `以 ${objective.affinity} 作为主属性获胜`;
    case 'harmony': return '使用任一协调共鸣装配获胜';
    case 'turn_limit': return `${objective.maximum} 回合内获胜`;
    case 'integrity_ratio': return `获胜时保留至少 ${Math.round(objective.minimum * 100)}% 完整度`;
    case 'finish': {
      const names = { ringout: '场外终结', spin: '旋转终结', burst: '爆裂终结', timeout: '超时终结' } as const;
      return `以${names[objective.finish]}获胜`;
    }
    case 'tilt_limit': return `获胜时最终倾斜不高于 ${objective.maximum}`;
  }
}
