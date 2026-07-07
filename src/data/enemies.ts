import type { BuildSelection } from './parts';

export type EnemyPreset = {
  id: string;
  name: string;
  description: string;
  aggression: number;
  crown: string;
  build: BuildSelection;
};

export const ENEMIES: EnemyPreset[] = [
  {
    id: 'blaze',
    name: '烈焰獠牙',
    description: '全力压上的进攻型陀螺，每次撞击后都会继续穷追猛打。',
    aggression: 1,
    crown: '资格赛',
    build: { attackRing: 'slash', core: 'light', driver: 'rush' },
  },
  {
    id: 'rift',
    name: '裂隙漂移',
    description: '擅长沿边缘游走，喜欢利用危险角度把对手推出场外。',
    aggression: 0.78,
    crown: '半决赛',
    build: { attackRing: 'round', core: 'balanced', driver: 'drift' },
  },
  {
    id: 'atlas',
    name: '阿特拉斯守卫',
    description: '沉重而稳定的控制型配置，擅长拖垮并吸收对手的火力。',
    aggression: 0.58,
    crown: '总决赛',
    build: { attackRing: 'bulwark', core: 'heavy', driver: 'grip' },
  },
];
