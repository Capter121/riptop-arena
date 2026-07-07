import { type ComponentCategory, type MaterialTier, type InstanceComponent } from '../types/shopItems';

export interface BaseComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  perkId?: string; // T3 components have special perks
  visualId?: string;
}

export interface Recipe {
  resultId: string;
  materials: string[]; // List of baseTemplateIds required
}

export const BASE_COMPONENTS: Record<string, BaseComponent> = {
  // STR - CHIP
  'chip_cast_iron': { id: 'chip_cast_iron', name: '铸铁微重力芯', category: 'CHIP' , visualId: 'heavy' },
  'chip_titanium_lock': { id: 'chip_titanium_lock', name: '钛合金束缚扣', category: 'CHIP' , visualId: 'heavy' },
  'chip_bracer_core': { id: 'chip_bracer_core', name: '护元加重外壳', category: 'CHIP' , visualId: 'heavy' },
  'chip_impact_shield': { id: 'chip_impact_shield', name: '抗冲击复合防护罩', category: 'CHIP' , visualId: 'heavy' },
  'chip_tarrasque': { id: 'chip_tarrasque', name: '恐鳌之心核心晶片', category: 'CHIP', perkId: 'tarrasque_regen' , visualId: 'heavy' },
  'chip_pipe_insight': { id: 'chip_pipe_insight', name: '烟斗全息御能芯片', category: 'CHIP', perkId: 'pipe_shield' , visualId: 'heavy' },

  // STR - LAYER
  'layer_stout_buffer': { id: 'layer_stout_buffer', name: '钝感圆边防撞环', category: 'LAYER' , visualId: 'bulwark' },
  'layer_chain_lock': { id: 'layer_chain_lock', name: '链锁式咬合齿', category: 'LAYER' , visualId: 'bulwark' },
  'layer_iron_will': { id: 'layer_iron_will', name: '钢骨重御外圈', category: 'LAYER' , visualId: 'bulwark' },
  'layer_vanguard': { id: 'layer_vanguard', name: '先锋抗暴击上盖', category: 'LAYER' , visualId: 'bulwark' },
  'layer_headdress': { id: 'layer_headdress', name: '玄冥矩阵偏置环', category: 'LAYER' , visualId: 'bulwark' },
  'layer_blade_mail': { id: 'layer_blade_mail', name: '刃甲荆棘反伤环', category: 'LAYER', perkId: 'blade_mail_reflect' , visualId: 'bulwark' },
  'layer_crimson': { id: 'layer_crimson', name: '赤红脉冲绝对防御壳', category: 'LAYER', perkId: 'crimson_block' , visualId: 'bulwark' },

  // STR - DISC
  'disc_vitality': { id: 'disc_vitality', name: '活性能量增强重力环', category: 'DISC' },
  'disc_reaver': { id: 'disc_reaver', name: '掠夺者沉重配重块', category: 'DISC' },
  'disc_platemail': { id: 'disc_platemail', name: '厚壁强化精钢圈', category: 'DISC' },
  'disc_perseverance': { id: 'disc_perseverance', name: '永固坚韧蓄能中盘', category: 'DISC' },
  'disc_assault_cuirass': { id: 'disc_assault_cuirass', name: '强袭超载破甲金属环', category: 'DISC', perkId: 'ac_armor_reduction' },
  'disc_bloodstone': { id: 'disc_bloodstone', name: '血精石粒子吸附中盘', category: 'DISC', perkId: 'bloodstone_regen' },

  // STR - DRIVER
  'driver_health_bearing': { id: 'driver_health_bearing', name: '高效减震滚珠', category: 'DRIVER' , visualId: 'grip' },
  'driver_regen_spring': { id: 'driver_regen_spring', name: '摩擦生能弹簧支架', category: 'DRIVER' , visualId: 'grip' },
  'driver_tranquil': { id: 'driver_tranquil', name: '绿野低阻悬浮底轴', category: 'DRIVER' , visualId: 'grip' },
  'driver_boots_travel': { id: 'driver_boots_travel', name: '不沉星自流转磁轴底轴', category: 'DRIVER', perkId: 'travel_super_armor' , visualId: 'grip' },
  'driver_dragon_blood': { id: 'driver_dragon_blood', name: '龙血合金液压抗震底轴', category: 'DRIVER', perkId: 'dragon_blood_survive' , visualId: 'grip' },

  // STR - LAUNCHER
  'launcher_heavy_ripcord': { id: 'launcher_heavy_ripcord', name: '加粗高韧度液压拉线条', category: 'LAUNCHER' },
  'launcher_mkb': { id: 'launcher_mkb', name: '金箍棒重载微调发射器', category: 'LAUNCHER', perkId: 'mkb_true_strike' },

  // AGI - CHIP
  'chip_light_aero': { id: 'chip_light_aero', name: '铝合金轻质气动芯', category: 'CHIP' , visualId: 'light' },
  'chip_flex_skeleton': { id: 'chip_flex_skeleton', name: '高柔韧性复合骨架', category: 'CHIP' , visualId: 'light' },
  'chip_wraith_band': { id: 'chip_wraith_band', name: '幽灵幻影集成束缚扣', category: 'CHIP' , visualId: 'light' },
  'chip_shadow_amulet': { id: 'chip_shadow_amulet', name: '全息隐匿光学微晶片', category: 'CHIP' , visualId: 'light' },
  'chip_butterfly': { id: 'chip_butterfly', name: '蝴蝶霓虹残影晶片', category: 'CHIP', perkId: 'butterfly_evasion' , visualId: 'light' },
  'chip_shadow_blade': { id: 'chip_shadow_blade', name: '影刃波形干扰核心', category: 'CHIP', perkId: 'shadow_blade_invis' , visualId: 'light' },

  // AGI - LAYER
  'layer_quarterstaff': { id: 'layer_quarterstaff', name: '短距高频切削刃', category: 'LAYER' , visualId: 'slash' },
  'layer_aero_foil': { id: 'layer_aero_foil', name: '迎风导流翼片', category: 'LAYER' , visualId: 'slash' },
  'layer_evasion_polar': { id: 'layer_evasion_polar', name: '高频闪避偏振环', category: 'LAYER' , visualId: 'slash' },
  'layer_oblivion': { id: 'layer_oblivion', name: '狂风撕裂流线型攻击环', category: 'LAYER' , visualId: 'slash' },
  'layer_yasha': { id: 'layer_yasha', name: '夜叉高速扰流翼圈', category: 'LAYER' , visualId: 'slash' },
  'layer_mask_madness': { id: 'layer_mask_madness', name: '疯狂过载锯齿撕裂环', category: 'LAYER', perkId: 'mom_berserk' , visualId: 'slash' },
  'layer_manta_style': { id: 'layer_manta_style', name: '幻影分身复合打击盘', category: 'LAYER', perkId: 'manta_illusions' , visualId: 'slash' },

  // AGI - DISC
  'disc_alacrity': { id: 'disc_alacrity', name: '狂风偏振短刃配重块', category: 'DISC' },
  'disc_eaglehorn': { id: 'disc_eaglehorn', name: '鹰角弓高精配重金属环', category: 'DISC' },
  'disc_hyperstone': { id: 'disc_hyperstone', name: '高频振奋重力金属圈', category: 'DISC' },
  'disc_mom_light': { id: 'disc_mom_light', name: '过载空转特制金属环', category: 'DISC' },
  'disc_sange_yasha': { id: 'disc_sange_yasha', name: '散夜共振双重配重盘', category: 'DISC', perkId: 'snk_maim' },
  'disc_maelstrom': { id: 'disc_maelstrom', name: '雷神之锤高频电涌中盘', category: 'DISC', perkId: 'maelstrom_lightning' },

  // AGI - DRIVER
  'driver_claws_attack': { id: 'driver_claws_attack', name: '高摩擦力突刺底轴', category: 'DRIVER' , visualId: 'rush' },
  'driver_gloves_haste': { id: 'driver_gloves_haste', name: '高速咬合电容轴承', category: 'DRIVER' , visualId: 'rush' },
  'driver_power_treads': { id: 'driver_power_treads', name: '重力流复合轴承底轴', category: 'DRIVER' , visualId: 'rush' },
  'driver_phase_blink': { id: 'driver_phase_blink', name: '相位瞬移全息偏光底轴', category: 'DRIVER', perkId: 'phase_blink' , visualId: 'rush' },
  'driver_butterfly_sleek': { id: 'driver_butterfly_sleek', name: '极光弧面流线型特制底轴', category: 'DRIVER', perkId: 'frictionless_spin' , visualId: 'rush' },

  // AGI - LAUNCHER
  'launcher_high_rpm': { id: 'launcher_high_rpm', name: '高精密超频滚珠拉线条', category: 'LAUNCHER' },
  'launcher_mjollnir': { id: 'launcher_mjollnir', name: '雷神之锤超频脉冲发射器', category: 'LAUNCHER', perkId: 'mjollnir_storm' },

  // INT - CHIP
  'chip_mantle_int': { id: 'chip_mantle_int', name: '微量元素电容晶片', category: 'CHIP' , visualId: 'balanced' },
  'chip_robe_magi': { id: 'chip_robe_magi', name: '灵力谐振增幅芯片', category: 'CHIP' , visualId: 'balanced' },
  'chip_null_talisman': { id: 'chip_null_talisman', name: '空灵磁力聚合晶片', category: 'CHIP' , visualId: 'balanced' },
  'chip_demon_edge': { id: 'chip_demon_edge', name: '恶魔超载暴击芯片', category: 'CHIP' , visualId: 'balanced' },
  'chip_scythe_vyse': { id: 'chip_scythe_vyse', name: '邪恶镰刀全息变形晶片', category: 'CHIP', perkId: 'hex_transformation' , visualId: 'balanced' },
  'chip_refresher': { id: 'chip_refresher', name: '刷新球波形重置核心', category: 'CHIP', perkId: 'refresh_spirit' , visualId: 'balanced' },

  // INT - LAYER
  'layer_magic_stick': { id: 'layer_magic_stick', name: '灵力逆向吸收齿轮', category: 'LAYER' , visualId: 'round' },
  'layer_sobi_mask': { id: 'layer_sobi_mask', name: '矩阵共振集能面罩', category: 'LAYER' , visualId: 'round' },
  'layer_wizardry': { id: 'layer_wizardry', name: '元素激发电磁上盖', category: 'LAYER' , visualId: 'round' },
  'layer_magic_wand': { id: 'layer_magic_wand', name: '极效聚能脉冲环', category: 'LAYER' , visualId: 'round' },
  'layer_dagon_1': { id: 'layer_dagon_1', name: '达贡电磁冲击发生器·一阶', category: 'LAYER' , visualId: 'round' },
  'layer_dagon_5': { id: 'layer_dagon_5', name: '达贡毁灭死光发生器·五阶', category: 'LAYER', perkId: 'dagon_laser' , visualId: 'round' },
  'layer_euls': { id: 'layer_euls', name: '尤尔神圣风暴偏转上盖', category: 'LAYER', perkId: 'euls_cyclone' , visualId: 'round' },

  // INT - DISC
  'disc_energy_booster': { id: 'disc_energy_booster', name: '储能电容加重圈', category: 'DISC' },
  'disc_void_stone': { id: 'disc_void_stone', name: '虚空蓄能绝缘中盘', category: 'DISC' },
  'disc_mystic_staff': { id: 'disc_mystic_staff', name: '高维神秘矩阵金属环', category: 'DISC' },
  'disc_arcane': { id: 'disc_arcane', name: '秘法共振电能金属圈', category: 'DISC' },
  'disc_atos': { id: 'disc_atos', name: '阿托斯引力禁锢配重盘', category: 'DISC', perkId: 'atos_root' },
  'disc_shiva': { id: 'disc_shiva', name: '希瓦之守护绝对零度中盘', category: 'DISC', perkId: 'shivas_guard' },

  // INT - DRIVER
  'driver_cloak': { id: 'driver_cloak', name: '电磁绝缘涂层底轴', category: 'DRIVER' , visualId: 'drift' },
  'driver_point_booster': { id: 'driver_point_booster', name: '全维微型精气球', category: 'DRIVER' , visualId: 'drift' },
  'driver_arcane_tip': { id: 'driver_arcane_tip', name: '秘法充能高频转珠', category: 'DRIVER' , visualId: 'drift' },
  'driver_veil': { id: 'driver_veil', name: '纷争元素破甲磁吸底轴', category: 'DRIVER', perkId: 'veil_discord' , visualId: 'drift' },
  'driver_ghost_scepter': { id: 'driver_ghost_scepter', name: '幽魂相位全息虚无底轴', category: 'DRIVER', perkId: 'ghost_form' , visualId: 'drift' },

  // INT - LAUNCHER
  'launcher_superconducting': { id: 'launcher_superconducting', name: '磁暴超导编码拉线条', category: 'LAUNCHER' },
  'launcher_aghanim': { id: 'launcher_aghanim', name: '阿哈利姆神杖大招全效发射器', category: 'LAUNCHER', perkId: 'aghanims_scepter' },

  // GEN - CHIP
  'chip_ironwood': { id: 'chip_ironwood', name: '活性复合碳纤纤维', category: 'CHIP' , visualId: 'balanced' },
  'chip_circlet': { id: 'chip_circlet', name: '全频均衡重力圆环', category: 'CHIP' , visualId: 'balanced' },
  'chip_headdress_hub': { id: 'chip_headdress_hub', name: '活性恢复网络中心块', category: 'CHIP' , visualId: 'balanced' },
  'chip_midas': { id: 'chip_midas', name: '点金手超频回收核心', category: 'CHIP' , visualId: 'balanced' },
  'chip_linkens': { id: 'chip_linkens', name: '林肯矩阵全能护盾芯片', category: 'CHIP', perkId: 'linkens_sphere' , visualId: 'balanced' },
  'chip_divine_rapier': { id: 'chip_divine_rapier', name: '终极裁决·圣剑核心晶片', category: 'CHIP', perkId: 'divine_rapier' , visualId: 'balanced' },

  // GEN - LAYER
  'layer_broadsword': { id: 'layer_broadsword', name: '阔边切削刃', category: 'LAYER' , visualId: 'round' },
  'layer_javelin': { id: 'layer_javelin', name: '高导向破甲标枪', category: 'LAYER' , visualId: 'round' },
  'layer_soul_ring': { id: 'layer_soul_ring', name: '魂之集能超频攻击圈', category: 'LAYER' , visualId: 'round' },
  'layer_crystalys': { id: 'layer_crystalys', name: '水晶冷锻极高高光环', category: 'LAYER' , visualId: 'round' },
  'layer_diffusal': { id: 'layer_diffusal', name: '散夜净魂能量燃烧环', category: 'LAYER', perkId: 'diffusal_mana_burn' , visualId: 'round' },
  'layer_daedalus': { id: 'layer_daedalus', name: '代达罗斯之殇·超限爆击环', category: 'LAYER', perkId: 'daedalus_crit' , visualId: 'round' },

  // GEN - DISC
  'disc_point_stabilizer': { id: 'disc_point_stabilizer', name: '储能电容加重圈', category: 'DISC' },
  'disc_ultimate_orb': { id: 'disc_ultimate_orb', name: '终极超频全息球', category: 'DISC' },
  'disc_sacred_relic': { id: 'disc_sacred_relic', name: '圣者遗留暗物质核心', category: 'DISC' },
  'disc_drum': { id: 'disc_drum', name: '战鼓激流高频共振中盘', category: 'DISC' },
  'disc_basher': { id: 'disc_basher', name: '碎颅重锤偏心撞击金属环', category: 'DISC', perkId: 'basher_stun' },
  'disc_radiance': { id: 'disc_radiance', name: '辉耀辐射粒子自发光盘', category: 'DISC', perkId: 'radiance_burn' },

  // GEN - DRIVER
  'driver_boots_speed': { id: 'driver_boots_speed', name: '速度平衡滚珠', category: 'DRIVER' , visualId: 'drift' },
  'driver_quelling': { id: 'driver_quelling', name: '气流补偿切削转珠', category: 'DRIVER' , visualId: 'drift' },
  'driver_phase_boots': { id: 'driver_phase_boots', name: '相位共振各向异性底轴', category: 'DRIVER' , visualId: 'drift' },
  'driver_necronomicon': { id: 'driver_necronomicon', name: '召唤契约·死灵书量子底轴', category: 'DRIVER', perkId: 'necronomicon_summons' , visualId: 'drift' },
  'driver_skadi': { id: 'driver_skadi', name: '斯嘉蒂之眼极寒全息轴承', category: 'DRIVER', perkId: 'skadi_frost' , visualId: 'drift' },

  // GEN - LAUNCHER
  'launcher_base_string': { id: 'launcher_base_string', name: '基础高分子拉线条', category: 'LAUNCHER' },
  'launcher_urn': { id: 'launcher_urn', name: '影之骨灰高能回收发射器', category: 'LAUNCHER' },
  'launcher_mekansm': { id: 'launcher_mekansm', name: '梅肯斯姆全场灵能修复发射器', category: 'LAUNCHER', perkId: 'mekansm_heal' },
};

export const RECIPES_DATABASE: Recipe[] = [
  // STR
  { resultId: 'chip_bracer_core', materials: ['chip_cast_iron', 'chip_mantle_int'] },
  { resultId: 'chip_impact_shield', materials: ['chip_titanium_lock', 'driver_cloak'] },
  { resultId: 'chip_tarrasque', materials: ['chip_bracer_core', 'layer_broadsword'] },
  { resultId: 'chip_pipe_insight', materials: ['chip_impact_shield', 'layer_headdress'] },

  { resultId: 'layer_vanguard', materials: ['layer_stout_buffer', 'chip_ironwood'] },
  { resultId: 'layer_headdress', materials: ['layer_chain_lock', 'driver_regen_spring'] },
  { resultId: 'layer_blade_mail', materials: ['layer_chain_lock', 'layer_iron_will', 'layer_broadsword'] },
  { resultId: 'layer_crimson', materials: ['layer_vanguard', 'layer_headdress'] },

  { resultId: 'disc_perseverance', materials: ['disc_vitality', 'disc_void_stone'] },
  { resultId: 'disc_assault_cuirass', materials: ['disc_platemail', 'disc_hyperstone'] },
  { resultId: 'disc_bloodstone', materials: ['driver_point_booster', 'disc_perseverance'] },

  { resultId: 'driver_tranquil', materials: ['driver_boots_speed', 'driver_regen_spring'] },
  { resultId: 'driver_boots_travel', materials: ['driver_boots_speed', 'disc_platemail'] },
  { resultId: 'driver_dragon_blood', materials: ['driver_power_treads', 'disc_vitality'] },

  { resultId: 'launcher_mkb', materials: ['launcher_heavy_ripcord', 'layer_javelin'] },

  // AGI
  { resultId: 'chip_wraith_band', materials: ['chip_light_aero', 'chip_cast_iron'] },
  { resultId: 'chip_shadow_amulet', materials: ['layer_evasion_polar'] },
  { resultId: 'chip_butterfly', materials: ['chip_wraith_band', 'disc_eaglehorn'] },
  { resultId: 'chip_shadow_blade', materials: ['chip_shadow_amulet', 'layer_broadsword'] },

  { resultId: 'layer_oblivion', materials: ['layer_quarterstaff', 'chip_mantle_int'] },
  { resultId: 'layer_yasha', materials: ['chip_flex_skeleton', 'layer_evasion_polar'] },
  { resultId: 'layer_mask_madness', materials: ['layer_quarterstaff', 'layer_magic_stick'] },
  { resultId: 'layer_manta_style', materials: ['layer_yasha', 'disc_ultimate_orb'] },

  { resultId: 'disc_mom_light', materials: ['layer_magic_stick', 'driver_gloves_haste'] },
  { resultId: 'disc_sange_yasha', materials: ['layer_yasha', 'disc_basher'] },
  { resultId: 'disc_maelstrom', materials: ['disc_hyperstone', 'layer_javelin'] },

  { resultId: 'driver_power_treads', materials: ['driver_boots_speed', 'driver_gloves_haste', 'chip_flex_skeleton'] },
  { resultId: 'driver_phase_blink', materials: ['driver_boots_speed', 'driver_claws_attack'] },
  { resultId: 'driver_butterfly_sleek', materials: ['driver_power_treads', 'layer_evasion_polar'] },

  { resultId: 'launcher_mjollnir', materials: ['launcher_high_rpm', 'disc_hyperstone'] },

  // INT
  { resultId: 'chip_null_talisman', materials: ['chip_mantle_int', 'chip_cast_iron'] },
  { resultId: 'chip_scythe_vyse', materials: ['chip_null_talisman', 'disc_mystic_staff'] },
  { resultId: 'chip_refresher', materials: ['disc_perseverance', 'disc_perseverance'] },

  { resultId: 'layer_magic_wand', materials: ['layer_magic_stick', 'chip_ironwood', 'chip_ironwood'] },
  { resultId: 'layer_dagon_1', materials: ['layer_wizardry', 'chip_null_talisman'] },
  { resultId: 'layer_dagon_5', materials: ['layer_dagon_1', 'driver_point_booster'] },
  { resultId: 'layer_euls', materials: ['layer_sobi_mask', 'chip_robe_magi', 'layer_wizardry'] },

  { resultId: 'disc_arcane', materials: ['disc_energy_booster', 'driver_point_booster'] },
  { resultId: 'disc_atos', materials: ['layer_wizardry', 'layer_wizardry', 'disc_vitality'] },
  { resultId: 'disc_shiva', materials: ['disc_mystic_staff', 'disc_platemail'] },

  { resultId: 'driver_arcane_tip', materials: ['driver_boots_speed', 'disc_energy_booster'] },
  { resultId: 'driver_veil', materials: ['layer_wizardry', 'layer_iron_will'] },
  { resultId: 'driver_ghost_scepter', materials: ['layer_wizardry', 'driver_point_booster'] },

  { resultId: 'launcher_aghanim', materials: ['launcher_superconducting', 'driver_point_booster'] },

  // GEN
  { resultId: 'chip_headdress_hub', materials: ['driver_regen_spring', 'chip_ironwood'] },
  { resultId: 'chip_midas', materials: ['driver_gloves_haste'] },
  { resultId: 'chip_linkens', materials: ['disc_perseverance', 'disc_ultimate_orb'] },
  { resultId: 'chip_divine_rapier', materials: ['disc_sacred_relic', 'chip_demon_edge'] },

  { resultId: 'layer_soul_ring', materials: ['driver_regen_spring', 'layer_sobi_mask'] },
  { resultId: 'layer_crystalys', materials: ['layer_broadsword', 'driver_claws_attack'] },
  { resultId: 'layer_diffusal', materials: ['layer_broadsword', 'layer_wizardry'] },
  { resultId: 'layer_daedalus', materials: ['layer_crystalys', 'chip_demon_edge'] },

  { resultId: 'disc_drum', materials: ['chip_circlet', 'chip_robe_magi'] },
  { resultId: 'disc_basher', materials: ['disc_vitality', 'layer_javelin'] },
  { resultId: 'disc_radiance', materials: ['disc_sacred_relic'] },

  { resultId: 'driver_phase_boots', materials: ['driver_boots_speed', 'driver_claws_attack', 'disc_platemail'] },
  { resultId: 'driver_necronomicon', materials: ['layer_wizardry', 'disc_vitality'] },
  { resultId: 'driver_skadi', materials: ['disc_ultimate_orb', 'disc_ultimate_orb', 'disc_energy_booster'] },

  { resultId: 'launcher_urn', materials: ['driver_regen_spring', 'driver_regen_spring', 'layer_sobi_mask'] },
  { resultId: 'launcher_mekansm', materials: ['chip_impact_shield', 'layer_headdress'] },
];

export class RecipesManager {
  /**
   * Craft a new item given an array of input instance components and a recipe index
   */
  static craft(materials: InstanceComponent[], recipe: Recipe): InstanceComponent | null {
    // 1. Basic material length validation
    if (materials.length !== recipe.materials.length) return null;

    // We do not do a strict order material check here to make it easier to craft,
    // we just check if the counts of each baseTemplateId match.
    const requiredCounts: Record<string, number> = {};
    for (const m of recipe.materials) {
      requiredCounts[m] = (requiredCounts[m] || 0) + 1;
    }

    const providedCounts: Record<string, number> = {};
    for (const m of materials) {
      providedCounts[m.baseTemplateId] = (providedCounts[m.baseTemplateId] || 0) + 1;
    }

    for (const [id, count] of Object.entries(requiredCounts)) {
      if (providedCounts[id] !== count) {
        return null; // Material mismatch
      }
    }

    // 2. Extract highest material tier (Tier Multiplier)
    const tierWeights: Record<MaterialTier, number> = {
      COMMON: 1,
      REFINED: 2,
      RARE: 3,
      LEGENDARY: 4,
      MYTHIC: 5,
    };

    let maxTier = materials[0].tier;
    for (const m of materials) {
      if (tierWeights[m.tier] > tierWeights[maxTier]) {
        maxTier = m.tier;
      }
    }

    // 3. Extract the dominant element attribute: DIVINE is highest priority.
    let finalAttribute = materials[0].attribute;
    const hasDivine = materials.some((m) => m.attribute === 'DIVINE');
    if (hasDivine) {
      finalAttribute = 'DIVINE';
    } else {
      // Find the component with the highest tier to inherit its attribute
      let highestPart = materials[0];
      for (const m of materials) {
        if (tierWeights[m.tier] > tierWeights[highestPart.tier]) {
          highestPart = m;
        }
      }
      finalAttribute = highestPart.attribute;
    }

    const targetBase = BASE_COMPONENTS[recipe.resultId];
    if (!targetBase) return null;

    return {
      instanceId: `inst_${Math.random().toString(36).substring(2, 11)}`,
      baseTemplateId: recipe.resultId,
      category: targetBase.category,
      attribute: finalAttribute,
      tier: maxTier,
    };
  }

  static findRecipe(materials: InstanceComponent[]): Recipe | null {
    if (materials.length === 0) return null;

    for (const recipe of RECIPES_DATABASE) {
      if (materials.length !== recipe.materials.length) continue;

      const requiredCounts: Record<string, number> = {};
      for (const m of recipe.materials) {
        requiredCounts[m] = (requiredCounts[m] || 0) + 1;
      }

      const providedCounts: Record<string, number> = {};
      for (const m of materials) {
        providedCounts[m.baseTemplateId] = (providedCounts[m.baseTemplateId] || 0) + 1;
      }

      let match = true;
      for (const [id, count] of Object.entries(requiredCounts)) {
        if (providedCounts[id] !== count) {
          match = false;
          break;
        }
      }

      if (match) return recipe;
    }
    
    return null;
  }

  static getAvailableCrafts(inventory: InstanceComponent[]): { recipe: Recipe, consumeIds: string[] }[] {
    const available: { recipe: Recipe, consumeIds: string[] }[] = [];
    
    const tierValue: Record<string, number> = {
      'COMMON': 1, 'RARE': 2, 'EPIC': 3, 'LEGENDARY': 4, 'MYTHIC': 5, 'DIVINE': 6
    };
    
    for (const recipe of RECIPES_DATABASE) {
      const requiredCounts: Record<string, number> = {};
      for (const m of recipe.materials) {
        requiredCounts[m] = (requiredCounts[m] || 0) + 1;
      }

      const consumeIds: string[] = [];
      let canCraft = true;

      const availableItems = [...inventory].sort((a, b) => (tierValue[a.tier] || 1) - (tierValue[b.tier] || 1));

      for (const [reqId, count] of Object.entries(requiredCounts)) {
        const matchingItems = availableItems.filter(item => item.baseTemplateId === reqId);
        if (matchingItems.length < count) {
          canCraft = false;
          break;
        }
        for (let i = 0; i < count; i++) {
          const item = matchingItems[i];
          consumeIds.push(item.instanceId);
          const idx = availableItems.findIndex(x => x.instanceId === item.instanceId);
          if (idx !== -1) availableItems.splice(idx, 1);
        }
      }

      if (canCraft) {
        available.push({ recipe, consumeIds });
      }
    }
    
    return available;
  }

  static getAllRecipes(): Recipe[] {
    return RECIPES_DATABASE;
  }
}
