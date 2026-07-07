import * as THREE from 'three';
import { ARENA_RADIUS, CAMERA_TUNING, COUNTDOWN_SECONDS, EDGE_GRIND_THRESHOLD } from './config';
import { Loop } from './loop';
import { ENEMIES, type EnemyPreset } from '../data/enemies';
import { getPartById, type BuildSelection, type Part, ItemGenerator } from '../data/parts';
import { type InstanceComponent } from '../types/shopItems';
import { pick } from '../utils/math';
import { EventBus } from '../utils/events';
import { cloneBuild, buildStats } from '../gameplay/build';
import { TopEntity } from '../gameplay/top';
import { ArenaScene } from '../scene/arena';
import { CameraRig } from '../scene/cameraRig';
import { BattlePhysicsSystem, TurnArbitrator, type TurnResolution } from '../gameplay/battlePhysics';
import { RuleSystem, type BattleResult } from '../gameplay/rules';
import { launchTop } from '../gameplay/launch';
import { clearTransientFlags } from '../gameplay/flags';
import { EnergySystem } from '../gameplay/energy';
import { resolveModifiers } from '../gameplay/modifiers';
import { SkillManager, getSkillLabel } from '../gameplay/skills';
import { SpiritSystem } from '../gameplay/spirit';
import { TurnPanel } from '../ui/turnPanel';
import { MenuPanel } from '../ui/menus';
import { GaragePanel } from '../ui/garage';
import { ResultPanel } from '../ui/results';
import { ShopPanel } from '../ui/shop';
import { Hud } from '../ui/hud';
import { CutinPanel } from '../ui/cutinPanel';
import { ForgePanel } from '../ui/forgePanel';
import { globalInventory } from '../data/inventoryManager';
import { SparksSystem } from '../fx/sparks';
import type { Phase } from '../utils/state';
import { SynthAudio } from '../audio/synth';
import { EnergyRings } from '../fx/energyRings';
import { TrailsSystem } from '../fx/trails';
import { LightningFX } from '../fx/lightning';
import { ShockwaveFX } from '../fx/shockwave';
import { PickupManager } from '../gameplay/pickups';
import { createBloomPipeline, type BloomPipeline } from '../scene/postProcessing';
import {
  ELEMENT_ATTACKS,
  DEFAULT_TACTICAL_MODE,
  type ElementAttackSkillId,
  type SkillId,
  type TacticalMode,
  type TurnAction,
} from '../types/battle';
import {
  advanceLadder,
  awardCoins,
  awardChampionship,
  getPartUpgradeLevel,
  getNextUnlock,
  loadProgression,
  MAX_PART_UPGRADE_LEVEL,
  MAX_SYSTEM_UPGRADE_LEVEL,
  resetRun,
  saveProgression,
  setPartUpgradeLevel,
  setUpgradeLevel,
  spendCoins,
  setBuild as setProgressionBuild,
  type UpgradeKey,
  unlockPart,
  unlockNextPart,
  type ProgressionState,
  TOTAL_PART_COUNT,
} from './progression';

export class Game {
  public blackMarketItems: (InstanceComponent | null)[] = [];
  private static readonly TACTICAL_MODE_ORDER: TacticalMode[] = ['balance', 'assault', 'fortress'];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly events = new EventBus();
  private readonly arena = new ArenaScene();
  private readonly rig = new CameraRig(this.camera);
  private readonly physics = new BattlePhysicsSystem(this.events);
  private readonly rules = new RuleSystem();
  private readonly sparks = new SparksSystem();
  private readonly energyRings = new EnergyRings();
  private readonly trails = new TrailsSystem();
  private readonly lightning = new LightningFX();
  private readonly shockwave = new ShockwaveFX();
  private readonly pickups = new PickupManager();
  private readonly bloom: BloomPipeline;
  private readonly loop = new Loop((dt) => this.update(dt));
  private readonly overlay = document.createElement('div');
  private phase: Phase = 'menu';
  private progression: ProgressionState = loadProgression();
  private build: BuildSelection = cloneBuild(this.progression.build);
  private player = new TopEntity('player', this.build, this.progression.upgrades, this.progression.partUpgrades);
  private playerTeam: TopEntity[] = [this.player];
  private activePlayerIndex = 0;
  private enemyPreset: EnemyPreset = pick(ENEMIES);

  private readonly menu = new MenuPanel();
  private readonly garage = new GaragePanel();
  private readonly results = new ResultPanel();
  private readonly shop = new ShopPanel();
  private readonly forgePanel = new ForgePanel(
    () => this.progression.unlockedSet,
    (id) => {
       this.progression = unlockPart(this.progression, id);
       saveProgression(this.progression);
    }
  );
  private readonly cutinPanel = new CutinPanel();
  private readonly hud = new Hud();
  private readonly audio = new SynthAudio();
  private readonly launchFlash = document.createElement('div');
  private readonly cameraDebug = document.createElement('div');
  private readonly introCard = document.createElement('div');
  private readonly touchMode = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  private enemy = new TopEntity('enemy', this.enemyPreset.build);
  
  private energy = new EnergySystem();
  private spirit = new SpiritSystem();
  private skillManager = new SkillManager(this.spirit);
  private readonly turnArbitrator = new TurnArbitrator();
  private readonly turnPanel = new TurnPanel((action) => this.submitTurnAction(action));
  private turnState: 'awaiting' | 'resolving' | 'cutin' = 'awaiting';
  private turnTimer = 0;
  private turnIndex = 1;
  private activeTurnResolution: TurnResolution | null = null;

  private mode: 'quick' | 'tournament' | 'survival' = 'quick';
  private survivalWave = 1;
  private survivalScore = 0;
  private launchCharge = 0;
  private launchAngleDeg = 0;
  private charging = false;
  private countdown = COUNTDOWN_SECONDS;
  private currentResult: BattleResult | null = null;
  private resultRewardText = '';
  private lastCoinReward = 0;
  private retryLabel = '鍐嶆垬';
  private featuredUnlockPart: Part | null = null;
  private featuredGarageUnlockId: string | null = null;
  private championMoment: { title: string; body: string } | null = null;
  private shopNotice = '\u91d1\u5e01\u53ef\u7528\u4e8e\u8d2d\u4e70\u65b0\u90e8\u4ef6\u548c\u5f3a\u5316\u5f53\u524d\u914d\u7f6e\u3002\u80dc\u5229\u540e\u56de\u6765\u5347\u7ea7\uff0c\u4e0b\u4e00\u573a\u6218\u6597\u4f1a\u7acb\u5373\u751f\u6548\u3002';
  private time = 0;
  private timeScale = 1;
  private hitStop = 0;
  private dragDirection = new THREE.Vector2();
  private readonly params = new URLSearchParams(window.location.search);
  private paused = false;
  private readonly camDebugEnabled = this.params.has('camDebug');
  private readonly qaEnabled = this.params.has('qa') || this.params.has('debug') || this.camDebugEnabled;
  private readonly tuningKeys: Array<keyof typeof CAMERA_TUNING> = [
    'chaseDistanceStart',
    'chaseDistanceRange',
    'chaseSpeedScale',
    'chaseOffsetScale',
    'dangerStart',
    'dangerRange',
    'dangerFocusBias',
    'dangerDistanceBoost',
    'dangerHeightBoost',
    'dangerCompressionBoost',
  ];
  private selectedTuningKey: keyof typeof CAMERA_TUNING = 'dangerStart';

  private readonly mount: HTMLElement;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.scene.background = new THREE.Color('#050910');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 閳光偓閳光偓 Cyberpunk Stage Lighting 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    // Dim ambient (just fills the darkest crevices).
    const ambient = new THREE.AmbientLight('#0a1020', 0.4);

    // Hard key light for solid form shadows.
    const key = new THREE.DirectionalLight('#ffe8c8', 2.2);
    key.position.set(6, 11, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);

    // 4-point cyberpunk dual-colour rig:
    //   2鑴?Aurora Blue (cold) + 2鑴?Lava Orange (warm)
    //   Diagonal layout so tops catch alternating hot/cold specular.
    const cyberBlue1 = new THREE.PointLight('#00ccff', 30, 28, 2);
    cyberBlue1.position.set(-9, 5, -9);
    const cyberBlue2 = new THREE.PointLight('#0088ff', 25, 28, 2);
    cyberBlue2.position.set(9, 5, 9);
    const cyberOrange1 = new THREE.PointLight('#ff6600', 28, 28, 2);
    cyberOrange1.position.set(9, 5, -9);
    const cyberOrange2 = new THREE.PointLight('#ff3300', 22, 28, 2);
    cyberOrange2.position.set(-9, 5, 9);

    this.scene.add(
      ambient, key,
      cyberBlue1, cyberBlue2, cyberOrange1, cyberOrange2,
      this.arena.root, this.trails.root, this.energyRings.root, this.pickups.root,
      this.sparks.root, this.lightning.root, this.shockwave.root, this.player.mesh, this.enemy.mesh,
    );

    // 閳光偓閳光偓 Procedural Environment Map (PMREMGenerator) 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    // A dark industrial scene with neon accent planes produces
    // cyberpunk reflections on all metallic surfaces.
    const pmremGen = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color('#0a0e14');
    // Neon accent panels.
    const neonBlue = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshBasicMaterial({ color: '#00aaff', side: THREE.DoubleSide }),
    );
    neonBlue.position.set(0, 5, -12);
    const neonOrange = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 10),
      new THREE.MeshBasicMaterial({ color: '#ff4400', side: THREE.DoubleSide }),
    );
    neonOrange.position.set(0, 5, 12);
    neonOrange.rotation.y = Math.PI;
    envScene.add(neonBlue, neonOrange);
    const envMap = pmremGen.fromScene(envScene, 0.04).texture;
    this.scene.environment = envMap;
    pmremGen.dispose();

    // 閳光偓閳光偓 Post-processing pipeline (Bloom + SSAO) 閳光偓閳光偓
    this.bloom = createBloomPipeline(this.renderer, this.scene, this.camera);
    this.renderer.setClearColor(0x000000, 0);

    const video = document.createElement('video');
    video.src = '/tuoluo.mp4';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.play().catch(console.error);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = videoTexture;

    this.events.on('dash', (res: any) => {
      const top = res.side === 'player' ? this.player : this.enemy;
      const color = res.side === 'player' ? 0x00ffff : 0xff5500;
      this.trails.emitSmoke(top.position.x, 0, top.position.y, color, 30, 0.8);
    });
    this.overlay.className = 'overlay';
    this.launchFlash.className = 'launch-flash';
    this.cameraDebug.className = 'camera-debug';
    this.introCard.className = 'intro-card';
    this.introCard.innerHTML = `
      <div class="intro-card__crest"></div>
      <div class="intro-card__eyebrow">鏂伴挗閾佽仈鐩?/div>
      <div class="intro-card__title">鎴樻枟闄€铻虹珵鎶€鍦?/div>
      <div class="intro-card__subtitle">鐐圭噧鏃嬭浆锛岄攣瀹氳妭濂忥紝缁熸不璧涘満</div>
    `;
    this.mount.innerHTML = '';
    this.mount.append(this.renderer.domElement, this.overlay, this.launchFlash, this.introCard);
    this.overlay.append(this.menu.root, this.garage.root, this.shop.root, this.results.root, this.cutinPanel.root, this.forgePanel.root);
    if (this.camDebugEnabled) {
      this.mount.append(this.cameraDebug);
    }
    this.hud.attach(this.mount);
    this.turnPanel.attach(this.mount);
    this.hud.bindControls({
      onLaunchChargeStart: () => {
        this.audio.unlock();
        this.onTouchLaunchStart();
      },
      onLaunchChargeEnd: () => this.onTouchLaunchEnd(),
      onAimLeft: () => this.nudgeLaunchAngle(-5),
      onAimRight: () => this.nudgeLaunchAngle(5),
      onPauseToggle: () => this.togglePause(),
      onDashEnemy: () => this.touchDashAtEnemy(),
      onDashCenter: () => this.physics.dashPlayer(this.player, new THREE.Vector3(0, 0, 0), this.energy),
    });

    this.events.on('spark', ({ x, z, intensity }) => {
      this.sparks.emit(x, z, intensity);
      if (intensity > 1.2) {
        this.lightning.strike(x, 0.4, z, 0x00ffff);
      }
    });
    this.events.on('shield_block', ({ x, z, side, shieldHits }) => {
      const color = side === 'player' ? 0x7ef0ff : 0xffcc66;
      this.shockwave.trigger(x, 0.35, z, 0.7, color);
      this.lightning.strike(x, 0.28, z, color);
      this.lightning.strike(x, 0.45, z, 0xffffff);
      this.trails.emitSmoke(x, 0.18, z, color, 10, 0.34);
      this.audio.clash(0.55);
      this.hud.combatLog.log(`\u62a4\u76fe\u683c\u6321\uff01\u5269\u4f59 ${shieldHits} \u5c42`, '#7ef0ff');
    });
    this.events.on('retreat_reverse_trigger', ({ x, z, side }) => {
      const color = side === 'player' ? 0x7ef0ff : 0xff8844;
      this.shockwave.trigger(x, 0.4, z, 0.75, color);
      this.lightning.strike(x, 0.32, z, color);
      this.hud.combatLog.log('\u56de\u65cb\u4f2a\u9000\u53d1\u52a8', '#ffd166');
    });
    this.events.on('spark', ({ intensity }) => this.audio.clash(intensity));
    this.events.on('launch', ({ power }) => {
      this.audio.launch(power);
      this.hud.combatLog.log(`3, 2, 1\uff0c\u53d1\u5c04\uff01(\u529b\u5ea6 ${Math.round(power * 100)}%)`, '#7ef0ff');
    });
    this.events.on('dash', () => {
      this.audio.dash();
      this.hud.combatLog.log('\u95ea\u907f\u51b2\u523a', '#00ccff');
    });
    this.events.on('burst', ({ loser }) => {
      const target = loser === 'player' ? this.player : this.enemy;
      this.sparks.burst(target.position.x, target.position.y);
      this.lightning.strike(target.position.x, 0.5, target.position.y, 0xffaa00);
      this.lightning.strike(target.position.x, 0.8, target.position.y, 0xffffff);
      this.audio.burst();
      this.hitStop = Math.max(this.hitStop, 0.06);
      this.rig.kickShake(0.9);
      this.hud.combatLog.log('\u7206\u88c2\u51fb\u7834', '#ff3300');
    });

    this.events.on('impact', ({ intensity }) => {
      this.hitStop = Math.max(this.hitStop, 0.028 * intensity);
      this.rig.kickShake(0.22 * intensity);
      
      const midX = (this.player.position.x + this.enemy.position.x) / 2;
      const midZ = (this.player.position.y + this.enemy.position.y) / 2;

      if (intensity > 1.2) {
        this.hud.combatLog.log('\u81f4\u547d\u91cd\u51fb', '#ff8800');
        this.trails.emitSmoke(midX, 0.2, midZ, 0xffffff, Math.floor(intensity * 12), 0.6);
      } else if (intensity > 0.8) {
        this.hud.combatLog.log('\u6c89\u91cd\u4e00\u51fb', '#ffcc00');
        this.trails.emitSmoke(midX, 0.2, midZ, 0xaaaaaa, Math.floor(intensity * 8), 0.4);
      }
    });

    this.menu.start.addEventListener('click', () => {
      this.mode = 'quick';
      this.enemyPreset = pick(ENEMIES);
      this.startBattle();
    });
    this.menu.survival.addEventListener('click', () => {
      this.mode = 'survival';
      this.enemyPreset = pick(ENEMIES);
      this.startBattle();
    });
    this.menu.tournament.addEventListener('click', () => {
      this.mode = 'tournament';
      this.enemyPreset = this.getTournamentEnemy();
      this.startBattle();
    });
    this.menu.garage.addEventListener('click', () => this.showGarage());
    this.menu.forge.addEventListener('click', () => {
      this.forgePanel.open();
    });
    
    this.garage.backButton.addEventListener('click', () => {
      this.showMenu();
    });
    this.garage.shopButton.addEventListener('click', () => this.showShop());
    this.garage.battleButton.addEventListener('click', () => {
      this.build = this.garage.readBuild();
      this.progression = setProgressionBuild(this.progression, this.build);
      saveProgression(this.progression);
      this.enemyPreset = this.mode === 'tournament' ? this.getTournamentEnemy() : pick(ENEMIES);
      this.startBattle();
    });
    for (const select of this.garage.selects.values()) {
      select.addEventListener('change', () => this.refreshGarageStats());
    }

    this.results.retry.addEventListener('click', () => {
      this.enemyPreset = this.mode === 'tournament' ? this.getTournamentEnemy() : pick(ENEMIES);
      this.startBattle();
    });
    this.results.garage.addEventListener('click', () => this.showGarage());
    this.shop.backButton.addEventListener('click', () => this.showGarage());
    this.shop.garageButton.addEventListener('click', () => this.showGarage());

    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', () => this.onPointerDown());
    this.renderer.domElement.addEventListener('pointerup', () => this.onPointerUp());
    this.renderer.domElement.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { once: true });
    this.renderer.domElement.addEventListener('pointerdown', () => this.audio.startMenuAmbience(), { once: true });
    window.addEventListener('keydown', () => this.audio.startMenuAmbience(), { once: true });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    this.resize();
    this.showMenu();
    window.setTimeout(() => this.introCard.classList.add('intro-card--hidden'), 1800);

    this.exposeDiagnostics();
    if (this.params.has('qa')) {
      this.enemyPreset = ENEMIES[0];
      this.startBattle();
      this.launchCharge = 0.84;
      this.doLaunch();
    }
  }

  start() {
    this.loop.start();
  }

  private showMenu() {
    this.phase = 'menu';
    this.audio.startMenuAmbience();
    this.menu.setMeta(this.getMenuMetaCn());
    this.menu.setTrophyShelf(this.getTrophyTitle(), this.getTrophyBody());
    this.menu.root.style.display = 'grid';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.results.root.style.display = 'none';
    this.hud.root.style.display = 'none';
  }
  private getTrophyTitle() {
    if (this.progression.championshipCount > 0) {
      return `\u7d2f\u8ba1\u593a\u51a0 ${this.progression.championshipCount} \u6b21`;
    }
    return '\u5c1a\u672a\u593a\u51a0';
  }

  private getTrophyBody() {
    if (this.progression.championshipCount > 0) {
      return `\u6700\u4f73\u9526\u6807\u8d5b\u6210\u7ee9\uff1a${this.progression.bestLadder}/${ENEMIES.length}\u3002\u6bcf\u6b21\u5b8c\u6574\u901a\u5173\u90fd\u4f1a\u4e3a\u4f60\u7684\u51a0\u519b\u9648\u5217\u518d\u6dfb\u4e00\u9876\u738b\u51a0\u3002`;
    }

    return '\u5b8c\u6574\u901a\u5173\u4e00\u6b21\u9526\u6807\u8d5b\u5373\u53ef\u83b7\u5f97\u7b2c\u4e00\u9876\u738b\u51a0\uff0c\u5e76\u5f00\u542f\u4f60\u7684\u51a0\u519b\u9648\u5217\u3002';
  }

  private showGarage() {
    this.phase = 'garage';
    this.audio.startMenuAmbience();
    this.garage.refreshOptions(this.build);
    this.garage.setCoins(this.progression.coins);
    this.garage.setProgress(this.getGarageProgressTextCn());
    this.garage.renderCollection();
    this.refreshGarageStats();
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'grid';
    this.hud.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.results.root.style.display = 'none';
  }

  
  // @ts-ignore
  private refreshBlackMarket() {
    this.blackMarketItems = [];
    for (let i = 0; i < 6; i++) {
      this.blackMarketItems.push(ItemGenerator.generateRandom({ allowDivine: false }));
    }
  }

  private purchaseBlackMarketItem(item: InstanceComponent, index: number, cost: number) {
    if (this.progression.coins >= cost) {
      this.progression.coins -= cost; ;
      globalInventory.addComponent(item);
      this.blackMarketItems[index] = null;
      this.showShop(); // re-render
    } else {
      this.shop.setNotice('金币不足');
    }
  }

  private purchaseBlindBox(): InstanceComponent | null {
    const cost = 150;
    if (this.progression.coins >= cost) {
      this.progression.coins -= cost;
      const item = ItemGenerator.generateRandom({ minTier: 'COMMON', allowDivine: false });
      item.tier = 'COMMON'; // Force common
      globalInventory.addComponent(item);
      this.shop.setNotice('购买神秘包裹成功！已放入背包');
      this.shop.setCoins(this.progression.coins);
      return item;
    } else {
      this.shop.setNotice('金币不足');
      return null;
    }
  }

  private showShop() {
    this.phase = 'shop';
    this.audio.startMenuAmbience();
    this.shop.setCoins(this.progression.coins);
    this.shop.setNotice(this.shopNotice);
    this.shop.renderCatalog(
      this.progression.upgrades,
      (key) => this.getUpgradeCostV2(key),
      (key) => this.canUpgradeV2(key),
      (key) => this.getUpgradePreviewV2(key),
      (key) => this.purchaseUpgradeV2(key),
      this.blackMarketItems as InstanceComponent[],
      (item, index, cost) => this.purchaseBlackMarketItem(item, index, cost),
      () => this.purchaseBlindBox()
    );
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'grid';
    this.results.root.style.display = 'none';
    this.hud.root.style.display = 'none';
  }

  private showResult(result: BattleResult) {
    this.phase = 'result';
    this.currentResult = result;
    const progressionBefore = this.captureProgressionSnapshot();
    this.applyProgressionResult(result);
    this.audio.startMenuAmbience();
    this.results.render(
      result,
      this.resultRewardText,
      this.retryLabel,
      this.featuredUnlockPart,
      this.championMoment,
      this.lastCoinReward,
      this.progression.coins,
      {
        modeLabel: this.getModeLabelCn(),
        enemyName: this.enemyPreset.name,
        growthTitle: '本局成长变化',
        growthLines: this.getResultGrowthLines(progressionBefore),
      },
    );
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.forgePanel.root.style.display = 'none';
    this.hud.root.style.display = 'none';
    this.turnPanel.root.style.display = 'none';
    this.results.root.style.display = 'grid';
  }

  private startBattle() {
    this.audio.stopMenuAmbience();
    this.currentResult = null;
    this.resultRewardText = '';
    this.lastCoinReward = 0;
    this.retryLabel = this.mode === 'tournament' ? '迎战下一位' : '再战';
    this.featuredUnlockPart = null;
    this.championMoment = null;
    this.launchCharge = 0;
    this.launchAngleDeg = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.charging = false;
    this.paused = false;
    this.timeScale = 1;
    this.hitStop = 0;
    this.dragDirection.set(0, 0);
    this.survivalWave = 1;
    this.survivalScore = 0;
    this.turnState = 'awaiting';
    this.turnTimer = 0;
    this.turnIndex = 1;
    this.activeTurnResolution = null;
    this.turnPanel.setPanelLock(false);
    this.turnPanel.update({ visible: false, resolving: false, turnIndex: this.turnIndex, lastLog: '发射后进入回合博弈。' });
    this.pickups.reset();
    this.hud.combatLog.clear();
    this.phase = 'launch';
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.forgePanel.root.style.display = 'none';
    this.results.root.style.display = 'none';
    this.hud.root.style.display = '';
    this.turnPanel.root.style.display = '';

    this.scene.remove(this.player.mesh, this.enemy.mesh);
    this.player = new TopEntity('player', this.build, this.progression.upgrades, this.progression.partUpgrades);
    this.playerTeam = [this.player];
    this.activePlayerIndex = 0;
    this.enemy = new TopEntity('enemy', this.enemyPreset.build);
    this.scene.add(this.player.mesh, this.enemy.mesh);
    this.player.reset(-6, 0);
    this.enemy.reset(6, 0);
    this.rig.reset();
    this.physics.reset();
    this.arena.setDangerLevel(0);
    this.events.emit('battle_start', {});
    this.energy.reset();
    this.trails.reset();
    this.physics.reset();
    this.rules.reset();
    this.hud.combatLog.clear();
    this.hud.combatLog.log('新一轮战斗开始', '#0ff');
  }

  private refreshGarageStats() {
    const build = this.garage.readBuild();
    const stats = buildStats(build, this.progression.upgrades, this.progression.partUpgrades);
    this.garage.radar.update(stats);
    this.garage.setSummary('当前总加成', this.getGarageSummaryLines(build));
  }
  private cyclePlayerTacticalMode() {
    const index = Game.TACTICAL_MODE_ORDER.indexOf(this.player.tacticalMode);
    const next = Game.TACTICAL_MODE_ORDER[(index + 1) % Game.TACTICAL_MODE_ORDER.length] ?? DEFAULT_TACTICAL_MODE;
    this.player.switchTacticalMode(next);
    this.hud.combatLog.log(`\u6218\u672f\u65b9\u9488\u5207\u6362\uff1a${this.getTacticalModeLabel(next)} - ${this.getTacticalModeHint(next)}`, '#7ef0ff');
  }

  private getTacticalModeLabel(mode: TacticalMode) {
    if (mode === 'assault') return '\u5f3a\u88ad';
    if (mode === 'fortress') return '\u575a\u58c1';
    return '\u5747\u8861';
  }

  private getTacticalModeHint(mode: TacticalMode) {
    if (mode === 'assault') return '\u91cd\u78b0\u649e\u3001\u9ad8\u7834\u9501\u3001\u4f4e\u5bb9\u9519';
    if (mode === 'fortress') return '\u9ad8\u9632\u5b88\u3001\u5f3a\u6297\u7206\u3001\u4f4e\u673a\u52a8';
    return '\u5c5e\u6027\u5e73\u7a33\uff0c\u9002\u5408\u89c2\u5bdf\u8282\u594f';
  }

  private castSkill(skillId: SkillId) {
    if (this.phase !== 'battle') return;

    const result = this.skillManager.castElementSkill(this.player, this.enemy, skillId);
    if (!result.ok) {
      if (result.reason === 'insufficient_spirit') {
        this.hud.combatLog.log(`\u7075\u529b\u4e0d\u8db3\uff1a${getSkillLabel(skillId)}`, '#ff7b5b');
      }
      return;
    }

    this.hud.combatLog.log(`\u91ca\u653e\u6280\u80fd\uff1a${getSkillLabel(skillId)}`, '#ffd166');
  }

  private submitTurnAction(playerAction: TurnAction) {
    if (this.phase !== 'battle' || this.paused || this.turnState !== 'awaiting' || this.currentResult) return;
    if (!this.canAffordTurnAction(this.player, playerAction, this.turnIndex)) {
      this.hud.combatLog.log('Spirit 不足，无法执行该行动。', '#ff7b5b');
      return;
    }

    this.turnState = 'cutin';
    this.turnPanel.setPanelLock(true);

    const proceed = () => {
        const aiAction = this.pickAiTurnAction();
        const resolution = this.turnArbitrator.executeTurnResolution(
          playerAction,
          aiAction,
          this.player,
          this.enemy,
          this.turnIndex
        );

        this.applyTurnSpiritDelta(resolution);
        this.applyTurnVisuals(resolution);
        this.turnState = 'resolving';
        this.turnTimer = 1.5;
        this.activeTurnResolution = resolution;
        this.timeScale = 1.0;
        this.hud.combatLog.log(resolution.log, resolution.winner === 'player' ? '#ffd166' : resolution.winner === 'enemy' ? '#ff7b5b' : '#7ef0ff');
        this.turnPanel.showResolution(resolution);
    };

    if (playerAction.kind === 'attack') {
        const skillName = getSkillLabel(playerAction.skillId);
        this.audio.playVoice('skill_voice'); // This will play skill_voice.mp3 if it exists in public
        this.cutinPanel.showCutin(skillName, playerAction.skillId).then(() => {
          try {
            proceed();
          } catch (e) {
            console.error('Error during turn resolution:', e);
            this.turnState = 'awaiting';
            this.turnPanel.setPanelLock(false);
          }
        });
    } else {
        proceed();
    }
  }

  private canAffordTurnAction(top: TopEntity, action: TurnAction, turnIndex: number) {
    if (action.kind === 'attack') return top.spirit >= ELEMENT_ATTACKS[action.skillId].spiritCost;
    if (action.kind === 'defense' || action.kind === 'evade') {
        return turnIndex <= 3 ? true : top.spirit >= 1;
    }
    return true;
  }

  private pickAiTurnAction(): TurnAction {
    if (this.player.stats.hasStealthEffect && Math.random() < 0.3) {
      // Stealth mode: AI guesses blindly
      const r = Math.random();
      if (r < 0.25) return { kind: 'charge' };
      if (r < 0.50) return { kind: 'defense' };
      if (r < 0.75) return { kind: 'evade' };
      // Fallback attack if they have energy
      const affordableAttacks = (Object.keys(ELEMENT_ATTACKS) as ElementAttackSkillId[])
        .filter((skillId) => this.enemy.spirit >= ELEMENT_ATTACKS[skillId].spiritCost);
      if (affordableAttacks.length > 0) {
        return { kind: 'attack', skillId: affordableAttacks[Math.floor(Math.random() * affordableAttacks.length)] };
      }
      return { kind: 'charge' };
    }

    const affordableAttacks = (Object.keys(ELEMENT_ATTACKS) as ElementAttackSkillId[])
      .filter((skillId) => this.enemy.spirit >= ELEMENT_ATTACKS[skillId].spiritCost);

    const isAssault = this.enemy.tacticalMode === 'assault';
    const isFortress = this.enemy.tacticalMode === 'fortress';

    if (this.enemy.spirit < 25 || affordableAttacks.length === 0) {
      if (isFortress) {
        return Math.random() < 0.4 ? { kind: 'defense' } : Math.random() < 0.6 ? { kind: 'evade' } : { kind: 'charge' };
      }
      return Math.random() < 0.72 ? { kind: 'charge' } : Math.random() < 0.5 ? { kind: 'defense' } : { kind: 'evade' };
    }

    const roll = Math.random();
    
    // Assault favors attacking
    const attackThreshold = isAssault ? 0.75 : 0.58;
    
    if (roll < attackThreshold) {
      const weighted = affordableAttacks.flatMap((skillId) => {
        const tier = ELEMENT_ATTACKS[skillId].tier;
        return Array.from({ length: isAssault && tier === 1 ? tier * 3 : tier }, () => skillId);
      });
      return { kind: 'attack', skillId: pick(weighted) };
    }
    
    const defenseThreshold = isFortress ? 0.85 : (attackThreshold + 0.16);
    if (roll < defenseThreshold) return { kind: 'defense' };
    
    const evadeThreshold = isFortress ? 0.95 : (defenseThreshold + 0.16);
    if (roll < evadeThreshold) return { kind: 'evade' };
    
    return { kind: 'charge' };
  }

  private applyTurnSpiritDelta(resolution: TurnResolution) {
    this.spirit.set(this.player, this.player.spirit + resolution.playerSpiritDelta);
    this.spirit.set(this.enemy, this.enemy.spirit + resolution.enemySpiritDelta);
  }

  private applyTurnVisuals(resolution: TurnResolution) {
    this.applyTopTurnVisual(this.player, this.enemy, resolution.playerVisual, resolution.playerAction);
    this.applyTopTurnVisual(this.enemy, this.player, resolution.enemyVisual, resolution.aiAction);

    const midX = (this.player.position.x + this.enemy.position.x) / 2;
    const midZ = (this.player.position.y + this.enemy.position.y) / 2;
    const shockColor = resolution.winner ? 0xff7b5b : 0x7ef0ff;
    this.shockwave.trigger(midX, 0.45, midZ, resolution.safeNoSpinDamage ? 1.1 : 1.55, shockColor);
    this.sparks.emit(midX, midZ, resolution.safeNoSpinDamage ? 1.2 : 2.0);
    this.audio.clash(resolution.winner ? 1.4 : 0.85);
    this.rig.kickShake(resolution.winner ? 1.2 : 0.65);

    if (resolution.knockbackBoost && resolution.knockbackBoost > 0) {
      // Find who was defending and push them away
      const defender = resolution.playerVisual === 'defense' ? this.player : (resolution.enemyVisual === 'defense' ? this.enemy : null);
      const attacker = defender === this.player ? this.enemy : this.player;
      if (defender) {
        const pushDir = defender.position.clone().sub(attacker.position).normalize();
        defender.velocity.add(pushDir.multiplyScalar(resolution.knockbackBoost * 8));
      }
    }

    if (resolution.firePenetration) {
      // Find defender who is taking penetration damage
      const defender = resolution.playerVisual === 'defense' ? this.player : (resolution.enemyVisual === 'defense' ? this.enemy : null);
      if (defender) {
        defender.integrity = Math.max(0, defender.integrity - 10);
        defender.addBurst(15);
        this.sparks.emit(defender.position.x, defender.position.y, 2.5); // extra sparks
      }
    }

    if (resolution.loser) {
      const loserTop = resolution.loser === 'player' ? this.player : this.enemy;
      const winnerTop = resolution.winner === 'player' ? this.player : this.enemy;
      loserTop.addBurst(100);
      loserTop.setEliminated();
      this.events.emit('burst', { winner: winnerTop.side, loser: loserTop.side });
      this.audio.finish(resolution.winner === 'player');
    }
  }

  private applyTopTurnVisual(top: TopEntity, target: TopEntity, visual: TurnResolution['playerVisual'], action: TurnAction) {
    const element = action.kind === 'attack' ? action.skillId : undefined;
    top.beginTurnMotion(visual, target, element);

    if (action.kind === 'attack') {
      this.skillManager.applyElementSkillVisual(top, target, action.skillId);
    }

    if (visual === 'defense') {
      const color = top.side === 'player' ? 0x7ef0ff : 0xffcc66;
      this.shockwave.trigger(top.position.x, 0.35, top.position.y, 0.72, color);
      this.lightning.strike(top.position.x, 0.32, top.position.y, color);
    }

    if (visual === 'evade') {
      const color = top.side === 'player' ? 0x7ef0ff : 0xff8844;
      this.trails.emitSmoke(top.position.x, 0.18, top.position.y, color, 18, 0.5);
    }
  }

  private emitTurnChargeParticles() {
    const resolution = this.activeTurnResolution;
    if (!resolution) return;

    if (resolution.playerVisual === 'charge') {
      this.sparks.emitAbsorb(this.player.position.x, this.player.position.y, 1.2);
    }
    if (resolution.enemyVisual === 'charge') {
      this.sparks.emitAbsorb(this.enemy.position.x, this.enemy.position.y, 1.2);
    }
  }

  private completeTurnResolution() {
    const resolution = this.activeTurnResolution;
    if (!resolution) return;

    if (resolution.winner) {
      this.showTurnResult(resolution);
      return;
    }

    this.turnIndex += 1;
    this.activeTurnResolution = null;
    this.turnState = 'awaiting';
    this.turnTimer = 0;
    this.player.velocity.multiplyScalar(0.15);
    this.enemy.velocity.multiplyScalar(0.15);
    this.turnPanel.setPanelLock(false);
    this.turnPanel.update({
      visible: true,
      resolving: false,
      spirit: this.player.spirit,
      maxSpirit: this.player.maxSpirit,
      turnIndex: this.turnIndex,
      lastLog: resolution.log,
    });
  }

  private showTurnResult(resolution: TurnResolution) {
    if (!resolution.winner) return;
    const result: BattleResult = {
      winner: resolution.winner,
      loser: resolution.winner === 'player' ? 'enemy' : 'player',
      kind: 'burst finish',
      label: '元素击破',
    };

    this.events.emit('finish', { winner: result.winner, kind: result.kind });
    this.rig.kickShake(1.15);
    this.turnPanel.update({ visible: false, resolving: false, lastLog: resolution.log });
    this.showResult(result);
  }

  private executeTagSubstitution() {
    if (this.phase !== 'battle' || this.paused) return;
    if (this.playerTeam.length <= 1) {
      this.hud.combatLog.log('没有备用陀螺可供切换。', '#ff7b5b');
      return;
    }

    // Find the next alive team member
    let nextIndex = -1;
    for (let i = 1; i < this.playerTeam.length; i++) {
      const candidate = (this.activePlayerIndex + i) % this.playerTeam.length;
      const top = this.playerTeam[candidate];
      if (top && top.alive && top.spin > top.stats.maxSpin * 0.1) {
        nextIndex = candidate;
        break;
      }
    }

    if (nextIndex < 0) {
      this.hud.combatLog.log('队列中无就绪的接力陀螺。', '#ff7b5b');
      return;
    }

    // Queue for safe execution on next postStep (avoid mid-collision swap)
    this.player.queuedTagState = {
      requestedAt: this.time,
      nextIndex,
    };
    this.hud.combatLog.log('接力切换已触发，等待安全窗口执行……', '#7ef0ff');
  }

  /**
   * Actually swap the active top on the field.
   * Called from update() when no collision is happening.
   */
  private processTagSubstitution() {
    const queued = this.player.queuedTagState;
    if (!queued) return;

    // Wait at least 1 frame after request to avoid mid-collision swap
    if (this.time - queued.requestedAt < 0.05) return;

    const nextTop = this.playerTeam[queued.nextIndex];
    if (!nextTop || !nextTop.alive) {
      this.player.queuedTagState = null;
      return;
    }

    // Record current position & velocity of outgoing top
    const savedX = this.player.position.x;
    const savedZ = this.player.position.y;

    // Remove outgoing top from scene
    this.scene.remove(this.player.mesh);

    // Clear queued state on outgoing
    this.player.queuedTagState = null;

    // Activate the new top
    this.activePlayerIndex = queued.nextIndex;
    this.player = nextTop;

    // Inherit position, add to scene
    this.player.position.set(savedX, savedZ);
    this.player.velocity.set(0, 0);
    this.scene.add(this.player.mesh);
    this.player.syncMesh(this.time, this.energy.get('player'));

    // Give initial impulse toward arena center
    const toCenter = new THREE.Vector2(-savedX, -savedZ);
    if (toCenter.lengthSq() > 0.01) {
      this.player.velocity.copy(toCenter.normalize().multiplyScalar(4.5));
    }

    this.hud.combatLog.log('接力完成！新陀螺已上场。', '#7ef0ff');
    this.rig.kickShake(0.35);
  }

  /**
   * Benched (off-field) tops slowly recover 5% of maxSpin per second.
   */
  private processBackgroundCharging(dt: number) {
    for (let i = 0; i < this.playerTeam.length; i++) {
      if (i === this.activePlayerIndex) continue;
      const top = this.playerTeam[i];
      if (!top || !top.alive) continue;
      top.spin = Math.min(top.stats.maxSpin, top.spin + top.stats.maxSpin * 0.05 * dt);
    }
  }

  private getTournamentEnemy() {
    return ENEMIES[Math.min(this.progression.ladderIndex, ENEMIES.length - 1)];
  }


  private getMenuMetaCn() {
    const nextEnemy = this.getTournamentEnemy();
    const nextUnlock = getNextUnlock(this.progression);
    return `\u91d1\u5e01\uff1a${this.progression.coins}\u3002\u9526\u6807\u8d5b\u8fdb\u5ea6\uff1a${this.progression.ladderIndex}/${ENEMIES.length}\u3002\u6700\u4f73\u6210\u7ee9\uff1a${this.progression.bestLadder}\u3002\u4e0b\u4e00\u4f4d\u5bf9\u624b\uff1a${nextEnemy.name}\u3002\u5df2\u89e3\u9501\u90e8\u4ef6\uff1a${this.progression.unlockedSet.size}/${TOTAL_PART_COUNT}\u3002\u6574\u673a\u5347\u7ea7\uff1a\u653b ${this.progression.upgrades.attack} / \u9632 ${this.progression.upgrades.defense} / \u6301 ${this.progression.upgrades.stamina}\u3002${nextUnlock ? `\u4e0b\u4e00\u6b21\u89e3\u9501\uff1a${nextUnlock.name}\u3002` : '\u5168\u90e8\u90e8\u4ef6\u5df2\u89e3\u9501\u3002'}`;
  }

  private getGarageProgressTextCn() {
    const nextEnemy = this.getTournamentEnemy();
    const nextUnlock = getNextUnlock(this.progression);
    const upgradeSummary = `\u6574\u673a\u5f3a\u5316\uff1a\u653b ${this.progression.upgrades.attack} / \u9632 ${this.progression.upgrades.defense} / \u6301 ${this.progression.upgrades.stamina}`;
    return nextUnlock
      ? `\u5f53\u524d\u76ee\u6807\uff1a${nextEnemy.name}\uff08${nextEnemy.crown}\uff09\u3002\u8d62\u4e0b\u4e0b\u4e00\u573a\u5373\u53ef\u89e3\u9501 ${nextUnlock.name}\u3002${upgradeSummary}\u3002`
      : `\u5f53\u524d\u76ee\u6807\uff1a${nextEnemy.name}\uff08${nextEnemy.crown}\uff09\u3002\u5168\u90e8\u90e8\u4ef6\u90fd\u5df2\u89e3\u9501\u3002${upgradeSummary}\u3002`;
  }

  private getGarageSummaryLines(build: BuildSelection) {
    const ringLevel = getPartUpgradeLevel(this.progression, build.attackRing);
    const coreLevel = getPartUpgradeLevel(this.progression, build.core);
    const driverLevel = getPartUpgradeLevel(this.progression, build.driver);
    const stats = buildStats(build, this.progression.upgrades, this.progression.partUpgrades);

    return [
      `\u6574\u673a\u5f3a\u5316\uff1a\u653b\u51fb +${this.progression.upgrades.attack} / \u9632\u5fa1 +${this.progression.upgrades.defense} / \u6301\u4e45 +${this.progression.upgrades.stamina}`,
      `\u90e8\u4ef6\u5f3a\u5316\uff1a\u653b\u51fb\u73af Lv.${ringLevel} / \u6838\u5fc3\u8f74 Lv.${coreLevel} / \u9a71\u52a8\u5e95\u76d8 Lv.${driverLevel}`,
      `\u6218\u6597\u6362\u7b97\uff1a\u6700\u5927\u8f6c\u901f ${stats.maxSpin.toFixed(0)} / \u6700\u5927\u8010\u4e45 ${stats.maxIntegrity.toFixed(0)} / \u91cd\u91cf ${stats.weight.toFixed(2)}`,
      `\u57fa\u7840\u5c5e\u6027\uff1a\u653b ${stats.attack} / \u9632 ${stats.defense} / \u6301 ${stats.stamina} / \u673a\u52a8 ${stats.mobility.toFixed(1)} / \u6297\u7206 ${stats.burstResist}`,
    ];
  }

  private captureProgressionSnapshot() {
    return {
      coins: this.progression.coins,
      ladderIndex: this.progression.ladderIndex,
      bestLadder: this.progression.bestLadder,
      championshipCount: this.progression.championshipCount,
      unlockedIds: new Set(this.progression.unlockedSet),
      upgrades: { ...this.progression.upgrades },
    };
  }

  private getResultGrowthLines(before: ReturnType<Game['captureProgressionSnapshot']>) {
    const lines: string[] = [];

    const coinDelta = this.progression.coins - before.coins;
    if (coinDelta > 0) {
      lines.push(`\u91d1\u5e01\u5165\u8d26\uff1a+${coinDelta}\uff0c\u5f53\u524d\u4f59\u989d ${this.progression.coins}`);
    } else {
      lines.push(`\u91d1\u5e01\u4f59\u989d\uff1a${this.progression.coins}`);
    }

    if (this.progression.ladderIndex !== before.ladderIndex) {
      lines.push(`\u9526\u6807\u8d5b\u63a8\u8fdb\uff1a${before.ladderIndex}/${ENEMIES.length} -> ${this.progression.ladderIndex}/${ENEMIES.length}`);
    } else if (this.mode === 'tournament') {
      lines.push(`\u9526\u6807\u8d5b\u8fdb\u5ea6\uff1a\u505c\u7559\u5728 ${this.progression.ladderIndex}/${ENEMIES.length}`);
    }

    const unlockedNames = [...this.progression.unlockedSet]
      .filter((id) => !before.unlockedIds.has(id))
      .map((id) => getPartById(id)?.name)
      .filter((name): name is string => Boolean(name));
    if (unlockedNames.length > 0) {
      lines.push(`\u65b0\u89e3\u9501\u90e8\u4ef6\uff1a${unlockedNames.join('\u3001')}`);
    }

    if (this.progression.championshipCount !== before.championshipCount) {
      lines.push(`\u51a0\u519b\u738b\u51a0\uff1a${before.championshipCount} -> ${this.progression.championshipCount}`);
    }

    lines.push(`\u5f53\u524d\u6574\u673a\u5f3a\u5316\uff1a\u653b ${this.progression.upgrades.attack} / \u9632 ${this.progression.upgrades.defense} / \u6301 ${this.progression.upgrades.stamina}`);
    return lines;
  }

  private getUpgradeLabelCn(key: UpgradeKey) {
    if (key === 'attack') return '\u653b\u51fb\u8c03\u6821';
    if (key === 'defense') return '\u9632\u5fa1\u88c5\u7532';
    return '\u7eed\u822a\u6838\u5fc3';
  }

  private getUpgradeCostV2(key: UpgradeKey) {
    const level = this.progression.upgrades[key];
    return 180 + level * 120;
  }

  private canUpgradeV2(key: UpgradeKey) {
    return this.progression.upgrades[key] < MAX_SYSTEM_UPGRADE_LEVEL;
  }

  private getUpgradePreviewV2(key: UpgradeKey) {
    const current = this.progression.upgrades[key];
    const next = Math.min(MAX_SYSTEM_UPGRADE_LEVEL, current + 1);
    if (current >= MAX_SYSTEM_UPGRADE_LEVEL) {
      return ['\u5df2\u8fbe\u5230\u5f53\u524d\u7cfb\u7edf\u5f3a\u5316\u4e0a\u9650'];
    }

    if (key === 'attack') {
      return [`\u653b\u51fb\uff1a+${current} -> +${next}`, '\u78b0\u649e\u8f93\u51fa\u4f1a\u66f4\u5f3a'];
    }
    if (key === 'defense') {
      return [`\u9632\u5fa1\uff1a+${current} -> +${next}`, `\u6297\u7206\uff1a+${current} -> +${next}`];
    }
    return [`\u6301\u4e45\uff1a+${current} -> +${next}`, `\u673a\u52a8\uff1a+${(current * 0.5).toFixed(1)} -> +${(next * 0.5).toFixed(1)}`];
  }

  private purchaseUpgradeV2(key: UpgradeKey) {
    if (!this.canUpgradeV2(key)) {
      this.shopNotice = `${this.getUpgradeLabelCn(key)} \u5df2\u8fbe\u5230\u6ee1\u7ea7\u3002`;
      this.showShop();
      return;
    }

    const cost = this.getUpgradeCostV2(key);
    if (this.progression.coins < cost) {
      this.shopNotice = `\u91d1\u5e01\u4e0d\u8db3\uff0c\u5347\u7ea7\u8fd8\u9700\u8981 ${cost - this.progression.coins} \u91d1\u5e01\u3002`;
      this.showShop();
      return;
    }

    this.progression = spendCoins(this.progression, cost);
    this.progression = setUpgradeLevel(this.progression, key, this.progression.upgrades[key] + 1);
    saveProgression(this.progression);
    this.shopNotice = `${this.getUpgradeLabelCn(key)} \u5df2\u63d0\u5347\u5230 Lv.${this.progression.upgrades[key]}\uff0c\u65b0\u7684\u5f3a\u5316\u4f1a\u5728\u4e0b\u4e00\u573a\u6218\u6597\u751f\u6548\u3002`;
    this.refreshGarageStats();
    this.showShop();
  }

  private getPartUpgradeCostV2(id: string) {
    return 140 + getPartUpgradeLevel(this.progression, id) * 110;
  }

  private canPartUpgradeV2(id: string) {
    return getPartUpgradeLevel(this.progression, id) < MAX_PART_UPGRADE_LEVEL;
  }

  // @ts-ignore
  private getPartUpgradePreviewV2(id: string, slot: 'attackRing' | 'core' | 'driver') {
    const current = getPartUpgradeLevel(this.progression, id);
    const next = Math.min(MAX_PART_UPGRADE_LEVEL, current + 1);
    if (current >= MAX_PART_UPGRADE_LEVEL) {
      return ['\u8be5\u90e8\u4ef6\u5df2\u8fbe\u5230\u5f3a\u5316\u4e0a\u9650'];
    }

    if (slot === 'attackRing') {
      return [`\u653b\u51fb\uff1a+${current} -> +${next}`, `\u6297\u7206\uff1a+${Math.floor(current / 2)} -> +${Math.floor(next / 2)}`];
    }
    if (slot === 'core') {
      return [`\u9632\u5fa1\uff1a+${current} -> +${next}`, `\u6297\u7206\uff1a+${current} -> +${next}`];
    }
    return [`\u6301\u4e45\uff1a+${current} -> +${next}`, `\u673a\u52a8\uff1a+${current} -> +${next}`];
  }

  // @ts-ignore
  private purchasePartUpgradeV2(id: string) {
    const part = getPartById(id);
    if (!part) return;

    if (!this.canPartUpgradeV2(id)) {
      this.shopNotice = `${part.name} \u5df2\u8fbe\u5230\u90e8\u4ef6\u5f3a\u5316\u4e0a\u9650\u3002`;
      this.showShop();
      return;
    }

    const cost = this.getPartUpgradeCostV2(id);
    if (this.progression.coins < cost) {
      this.shopNotice = `\u91d1\u5e01\u4e0d\u8db3\uff0c\u5f3a\u5316 ${part.name} \u8fd8\u9700\u8981 ${cost - this.progression.coins} \u91d1\u5e01\u3002`;
      this.showShop();
      return;
    }

    this.progression = spendCoins(this.progression, cost);
    this.progression = setPartUpgradeLevel(this.progression, id, getPartUpgradeLevel(this.progression, id) + 1);
    saveProgression(this.progression);
    this.shopNotice = `${part.name} \u5df2\u5f3a\u5316\u5230 Lv.${getPartUpgradeLevel(this.progression, id)}\uff0c\u5f53\u524d\u88c5\u5907\u7684\u6218\u6597\u6570\u503c\u9884\u89c8\u5df2\u66f4\u65b0\u3002`;
    this.refreshGarageStats();
    this.showShop();
  }

  // @ts-ignore
  private purchaseShopPartV2(id: string) {
    const part = getPartById(id);
    if (!part) return;

    if (this.progression.unlockedSet.has(id)) {
      this.shopNotice = `${part.name} \u5df2\u7ecf\u5728\u4f60\u7684\u8f66\u5e93\u91cc\u4e86\u3002`;
      this.showShop();
      return;
    }

    if (this.progression.coins < part.price) {
      this.shopNotice = `\u91d1\u5e01\u4e0d\u8db3\uff0c\u8d2d\u4e70 ${part.name} \u8fd8\u9700\u8981 ${part.price - this.progression.coins} \u91d1\u5e01\u3002`;
      this.showShop();
      return;
    }

    this.progression = spendCoins(this.progression, part.price);
    this.progression = unlockPart(this.progression, id);
    saveProgression(this.progression);
    this.featuredGarageUnlockId = id;
    this.shopNotice = `${part.name} \u5df2\u8d2d\u4e70\u5e76\u52a0\u5165\u8f66\u5e93\uff0c\u73b0\u5728\u53ef\u4ee5\u8fd4\u56de\u6539\u88c5\u5e93\u8fdb\u884c\u88c5\u914d\u3002`;
    this.showShop();
  }

  private getModeLabelCn() {
    if (this.mode === 'tournament') return '\u9526\u6807\u8d5b';
    if (this.mode === 'survival') return '\u751f\u5b58\u6a21\u5f0f';
    return '\u5feb\u901f\u6218\u6597';
  }

  private applyProgressionResult(result: BattleResult) {
    this.lastCoinReward = result.winner === 'player' ? this.calculateCoinReward(result) : 0;
    if (this.lastCoinReward > 0) {
      this.progression = awardCoins(this.progression, this.lastCoinReward);
    }

    if (this.mode !== 'tournament') {
      this.resultRewardText = result.winner === 'player'
        ? '\u5feb\u901f\u6218\u6597\u7ed3\u675f\uff0c\u8d4f\u91d1\u91d1\u5e01\u5df2\u7ecf\u5165\u8d26\uff0c\u53ef\u7528\u4e8e\u540e\u7eed\u5546\u57ce\u4e0e\u5347\u7ea7\u7cfb\u7edf\u3002'
        : '\u5feb\u901f\u6218\u6597\u5931\u5229\u3002\u8bd5\u7740\u66f4\u6362\u90e8\u4ef6\u642d\u914d\uff0c\u8c03\u6574\u8282\u594f\u540e\u518d\u6765\u6311\u6218\u3002';
      this.retryLabel = '\u518d\u6b21\u6311\u6218';
      this.featuredUnlockPart = null;
      this.championMoment = null;
      saveProgression(this.progression);
      return;
    }

    if (result.winner === 'player') {
      this.progression = advanceLadder(this.progression);
      const unlockResult = unlockNextPart(this.progression);
      this.progression = unlockResult.state;
      this.featuredUnlockPart = unlockResult.reward ? getPartById(unlockResult.reward.id) : null;
      this.featuredGarageUnlockId = unlockResult.reward?.id ?? this.featuredGarageUnlockId;

      if (this.progression.ladderIndex >= ENEMIES.length) {
        this.progression = awardChampionship(this.progression);
        this.audio.champion();
        this.retryLabel = '\u91cd\u65b0\u5f00\u59cb';
        this.championMoment = {
          title: `\u7b2c ${this.progression.championshipCount} \u6b21\u593a\u51a0`,
          body: '\u4f60\u51fb\u8d25\u4e86\u70c8\u7130\u7360\u7259\u3001\u88c2\u9699\u6f02\u79fb\u548c\u963f\u7279\u62c9\u65af\u5b88\u536b\u3002\u8fd9\u6b21\u5b8c\u6574\u901a\u5173\u5df2\u7ecf\u88ab\u8bb0\u5f55\u8fdb\u51a0\u519b\u9648\u5217\u3002',
        };
        this.resultRewardText = unlockResult.reward
          ? `\u9526\u6807\u8d5b\u901a\u5173\uff0c\u51a0\u519b\u5230\u624b\uff0c${unlockResult.reward.name} \u4e5f\u5df2\u89e3\u9501\uff0c\u8d4f\u91d1\u91d1\u5e01\u5df2\u7ecf\u5165\u8d26\u3002\u4e0b\u4e00\u8f6e\u5c06\u4ece\u70c8\u7130\u7360\u7259\u91cd\u65b0\u5f00\u59cb\u3002`
          : '\u9526\u6807\u8d5b\u901a\u5173\uff0c\u51a0\u519b\u5230\u624b\uff0c\u8d4f\u91d1\u91d1\u5e01\u5df2\u7ecf\u5165\u8d26\u3002\u4e0b\u4e00\u8f6e\u5c06\u4ece\u70c8\u7130\u7360\u7259\u91cd\u65b0\u5f00\u59cb\u3002';
        this.progression = resetRun(this.progression);
      } else {
        const nextEnemy = this.getTournamentEnemy();
        this.retryLabel = '\u8fce\u6218\u4e0b\u4e00\u4f4d';
        this.championMoment = null;
        this.resultRewardText = unlockResult.reward
          ? `${unlockResult.reward.name} \u5df2\u89e3\u9501\uff0c\u8d4f\u91d1\u91d1\u5e01\u5df2\u7ecf\u5165\u8d26\u3002\u4e0b\u4e00\u4f4d\u5bf9\u624b\u662f ${nextEnemy.crown} \u7684 ${nextEnemy.name}\u3002`
          : `\u6392\u540d\u63d0\u5347\uff0c\u8d4f\u91d1\u91d1\u5e01\u5df2\u7ecf\u5165\u8d26\u3002\u4e0b\u4e00\u4f4d\u5bf9\u624b\u662f ${nextEnemy.crown} \u7684 ${nextEnemy.name}\u3002`;
      }
    } else {
      const nextEnemy = this.getTournamentEnemy();
      this.retryLabel = '\u518d\u6b21\u6311\u6218';
      this.resultRewardText = `\u8fde\u80dc\u88ab\u7ec8\u7ed3\u4e86\u3002${nextEnemy.name} \u5b88\u4f4f\u4e86\u8fd9\u4e00\u5173\uff0c\u4f60\u7684\u9526\u6807\u8d5b\u8fdb\u5ea6\u505c\u5728\u7b2c ${this.progression.ladderIndex + 1} \u573a\u3002`;
      this.featuredUnlockPart = null;
      this.championMoment = null;
    }

    saveProgression(this.progression);
  }

  private calculateCoinReward(result: BattleResult) {
    if (result.winner !== 'player') return 0;

    const finishBonus: Record<BattleResult['kind'], number> = {
      'ring out': 35,
      'spin finish': 25,
      'burst finish': 50,
      timeout: 20,
    };
    const modeBonus = this.mode === 'tournament' ? 120 + this.progression.ladderIndex * 35 : 80;
    const championBonus = this.mode === 'tournament' && this.progression.ladderIndex >= ENEMIES.length - 1 ? 180 : 0;

    return modeBonus + finishBonus[result.kind] + championBonus;
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.bloom.resize(width, height);
  }

  private onPointerDown() {
    if (this.paused) return;
    if (this.phase === 'launch') {
      this.charging = true;
      return;
    }

    if (this.phase !== 'battle') return;
    this.audio.unlock();
  }

  private onPointerUp() {
    if (this.paused) return;
    if (this.phase !== 'launch' || !this.charging) return;
    this.charging = false;
    this.doLaunch();
  }

  private onTouchLaunchStart() {
    if (this.paused || this.phase !== 'launch') return;
    this.charging = true;
  }

  private onTouchLaunchEnd() {
    if (this.paused || this.phase !== 'launch' || !this.charging) return;
    this.charging = false;
    this.doLaunch();
  }

  private nudgeLaunchAngle(delta: number) {
    if (this.phase !== 'launch' || this.paused) return;
    this.launchAngleDeg = THREE.MathUtils.clamp(this.launchAngleDeg + delta, -35, 35);
  }

  private togglePause() {
    if (this.phase === 'battle' || this.paused) {
      this.paused = !this.paused;
    }
  }

  private touchDashAtEnemy() {
    if (this.phase !== 'battle' || this.paused) return;
    const target = new THREE.Vector3(this.enemy.position.x, 0, this.enemy.position.y);
    this.physics.dashPlayer(this.player, target, this.energy);
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && (this.phase === 'battle' || this.paused)) {
      this.paused = !this.paused;
      return;
    }

    if (this.paused) return;

    if (this.camDebugEnabled) {
      if (event.key === '[') {
        this.adjustCameraTuning(-0.02);
        return;
      }
      if (event.key === ']') {
        this.adjustCameraTuning(0.02);
        return;
      }
      if (event.key === ';') {
        this.cycleCameraTuning(-1);
        return;
      }
      if (event.key === "'") {
        this.cycleCameraTuning(1);
        return;
      }
    }

    if (this.phase === 'launch') {
      if (event.code === 'Space') {
        this.charging = true;
      }
      const lowerKey = event.key.toLowerCase();
      if (lowerKey === 'q') this.launchAngleDeg = Math.max(-35, this.launchAngleDeg - 5);
      if (lowerKey === 'e') this.launchAngleDeg = Math.min(35, this.launchAngleDeg + 5);
      return;
    }

    if (this.phase !== 'battle') return;

    if (event.key.toLowerCase() === 'q') {
      this.cyclePlayerTacticalMode();
      return;
    }
    if (event.key.toLowerCase() === 't') {
      this.executeTagSubstitution();
      return;
    }

    if (this.turnState === 'awaiting') {
      const skillKeyMap: Record<string, ElementAttackSkillId> = {
        '1': 'wind_blade',
        '2': 'aqua_surge',
        '3': 'lightning_bolt',
        '4': 'blazing_meteor',
        '5': 'phantom_clone',
      };
      const skillId = skillKeyMap[event.key];
      const lowerKey = event.key.toLowerCase();
      if (skillId) this.submitTurnAction({ kind: 'attack', skillId });
      if (lowerKey === 'd') this.submitTurnAction({ kind: 'defense' });
      if (lowerKey === 's') this.submitTurnAction({ kind: 'evade' });
      if (lowerKey === 'c') this.submitTurnAction({ kind: 'charge' });
      if (skillId || ['d', 's', 'c'].includes(lowerKey)) return;
    }

    if (event.key >= '1' && event.key <= '5') {
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      this.spirit.set(this.player, this.player.maxSpirit);
      this.hud.combatLog.log('\u73a9\u5bb6\u7075\u529b\u5df2\u56de\u6ee1', '#7ef0ff');
      return;
    }
    if (event.key.toLowerCase() === 'y') {
      this.spirit.set(this.enemy, this.enemy.maxSpirit);
      this.hud.combatLog.log('\u5bf9\u624b\u7075\u529b\u5df2\u56de\u6ee1', '#7ef0ff');
      return;
    }

  }

  private onKeyUp(event: KeyboardEvent) {
    if (this.paused) return;
    if (this.phase === 'launch' && event.code === 'Space' && this.charging) {
      this.charging = false;
      this.doLaunch();
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S'].includes(event.key)) this.dragDirection.y = 0;
    if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) this.dragDirection.x = 0;
  }

  private doLaunch() {
    launchTop(this.player, new THREE.Vector2(1, 0), this.launchCharge, THREE.MathUtils.degToRad(this.launchAngleDeg));
    launchTop(this.enemy, new THREE.Vector2(-1, 0), 0.78 + Math.random() * 0.12, THREE.MathUtils.degToRad((Math.random() - 0.5) * 18));
    this.events.emit('launch', { side: 'player', power: this.launchCharge });
    this.events.emit('launch', { side: 'enemy', power: 0.85 });
    this.triggerLaunchFlash(this.launchCharge);
    this.rig.kickShake(0.65 + this.launchCharge * 0.45);
    this.phase = 'battle';
    this.player.velocity.set(0, 0);
    this.enemy.velocity.set(0, 0);
    this.turnState = 'awaiting';
    this.turnTimer = 0;
    this.turnPanel.update({
      visible: true,
      resolving: false,
      spirit: this.player.spirit,
      maxSpirit: this.player.maxSpirit,
      turnIndex: this.turnIndex,
      lastLog: '选择行动：进攻展开元素技能，或使用回避、防守、蓄能。',
    });
  }

  private update(dt: number) {
    this.time += dt;
    const edgeDanger = Math.max(this.player.position.length() / 8.6, this.enemy.position.length() / 8.6);
    this.arena.setDangerLevel(this.phase === 'battle' ? Math.max(0, (edgeDanger - 0.58) / 0.24) : 0);
    if (this.paused) {
      this.player.syncMesh(this.time, this.energy.get('player'));
      this.enemy.syncMesh(this.time, this.energy.get('enemy'));
      this.energyRings.update(this.player, this.enemy, this.time, this.energy.get('player'));
      this.hud.combatLog.update(dt);
      this.hud.update({
        playerSpin: this.player.spin,
        playerSpinMax: this.player.stats.maxSpin,
        playerIntegrity: this.player.integrity,
        playerIntegrityMax: this.player.stats.maxIntegrity,
        playerBurst: this.player.burst,
        playerEnergy: this.player.spirit,
        enemySpin: this.enemy.spin,
        enemySpinMax: this.enemy.stats.maxSpin,
        enemyIntegrity: this.enemy.integrity,
        enemyIntegrityMax: this.enemy.stats.maxIntegrity,
        enemyBurst: this.enemy.burst,
        enemyEnergy: this.enemy.spirit,
        timeLeft: this.rules.timeLeft,
        result: this.currentResult,
        enemyName: this.enemyPreset.name,
        launchPower: this.launchCharge,
        angleDeg: this.launchAngleDeg,
        phase: this.phase,
        countdown: this.countdown,
        paused: true,
        dangerLevel: 0,
        touchMode: this.touchMode,
        mode: this.mode,
        wave: this.survivalWave,
        score: this.survivalScore,
      });
      this.exposeDiagnostics();
      clearTransientFlags(this.player);
      clearTransientFlags(this.enemy);
      this.bloom.composer.render();
      return;
    }

    const simulationDt = this.hitStop > 0 ? 0 : dt * this.timeScale;
    this.hitStop = Math.max(0, this.hitStop - dt);

    this.skillManager.update(this.player, dt, this.enemy);
    this.skillManager.update(this.enemy, dt, this.player);

    if (this.phase === 'launch') {
      if (this.charging) {
        this.launchCharge = Math.min(1, this.launchCharge + dt * 0.45);
      }
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 0 && !this.charging && this.launchCharge <= 0.1) {
        this.launchCharge = 0.72;
        this.doLaunch();
      }
    }

    if (this.phase === 'battle') {
      document.body.classList.toggle('vignette-active', this.turnState === 'resolving');

      if (this.turnState === 'resolving') {
        this.turnTimer = Math.max(0, this.turnTimer - dt);
        this.physics.update(this.player, this.enemy, simulationDt, true);
        this.emitTurnChargeParticles();

        if (this.turnTimer <= 0) {
          this.completeTurnResolution();
        }
      } else {
        this.player.velocity.multiplyScalar(0.9);
        this.enemy.velocity.multiplyScalar(0.9);
      }

      this.turnPanel.update({
        visible: true,
        resolving: this.turnState === 'resolving',
        spirit: this.player.spirit,
        maxSpirit: this.player.maxSpirit,
        turnIndex: this.turnIndex,
      });

      this.energy.set('player', this.player.spirit / 10);
      this.energy.set('enemy', this.enemy.spirit / 10);
      this.processTagSubstitution();
      this.processBackgroundCharging(simulationDt);
    }

    this.player.syncMesh(this.time, this.energy.get('player'));
    this.enemy.syncMesh(this.time, this.energy.get('enemy'));
    this.player.updateEffects(dt);
    this.enemy.updateEffects(dt);
    this.sparks.update(dt);
    this.lightning.update(dt);
    this.shockwave.update(dt);
    this.trails.update(dt, this.player, this.enemy);

    // 閳光偓閳光偓 Dynamic Visual FX 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    const totalEnergy = this.energy.get('player') + this.energy.get('enemy');
    this.bloom.setBloomStrength(0.65 + (totalEnergy / 20) * 1.2);
    
    // Smoothly apply RGB shift / glitch when timeScale is reduced (bullet time)
    const bulletTimeDepth = 1.0 - this.timeScale;
    this.bloom.setDistortion(bulletTimeDepth * 1.5 + (this.hitStop > 0 ? 0.5 : 0));
    // 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

    this.energyRings.update(this.player, this.enemy, this.time, this.energy.get('player'));
    this.arena.update(dt);
    this.hud.combatLog.update(dt);

    // 閳光偓閳光偓 Edge-grind sparks & scuff marks 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    for (const top of [this.player, this.enemy]) {
      const edgeRatio = top.position.length() / ARENA_RADIUS;
      const speed = top.velocity.length();
      if (edgeRatio > EDGE_GRIND_THRESHOLD && speed > 1.5 && top.alive) {
        this.sparks.emitGrindSparks(top.position.x, top.position.y, speed);
        // Also emit a tiny bit of friction smoke
        const color = top === this.player ? 0x00ffff : 0xff5500;
        this.trails.emitSmoke(top.position.x, 0.1, top.position.y, color, 1, 0.4);
        
        if (Math.random() < 0.3) {
          const angle = Math.atan2(top.velocity.y, top.velocity.x);
          this.arena.addScuffMark(top.position.x, top.position.y, angle);
        }
      }
    }

    this.rig.update(this.player, this.enemy, dt, this.phase);
    this.hud.update({
      playerSpin: this.player.spin,
      playerSpinMax: this.player.stats.maxSpin,
      playerIntegrity: this.player.integrity,
      playerIntegrityMax: this.player.stats.maxIntegrity,
      playerBurst: this.player.burst,
      playerEnergy: this.player.spirit,
      enemySpin: this.enemy.spin,
      enemySpinMax: this.enemy.stats.maxSpin,
      enemyIntegrity: this.enemy.integrity,
      enemyIntegrityMax: this.enemy.stats.maxIntegrity,
      enemyBurst: this.enemy.burst,
      enemyEnergy: this.enemy.spirit,
      timeLeft: this.rules.timeLeft,
      result: this.currentResult,
      enemyName: this.enemyPreset.name,
      launchPower: this.launchCharge,
      angleDeg: this.launchAngleDeg,
      phase: this.phase,
      countdown: this.countdown,
      paused: false,
      dangerLevel: this.phase === 'battle' ? Math.max(0, (edgeDanger - 0.58) / 0.24) : 0,
      touchMode: this.touchMode,
      mode: this.mode,
      wave: this.survivalWave,
      score: this.survivalScore,
    });
    if (this.camDebugEnabled) {
      this.renderCameraDebug();
    }
    this.exposeDiagnostics();
    clearTransientFlags(this.player);
    clearTransientFlags(this.enemy);
    this.bloom.composer.render();
  }

  private exposeDiagnostics() {
    const globalWindow = window as Window & {
      __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown>;
      __RIPTOP_QA__?: Record<string, unknown>;
    };

    if (!this.qaEnabled) {
      delete globalWindow.__THREE_GAME_DIAGNOSTICS__;
      delete globalWindow.__RIPTOP_QA__;
      return;
    }

    globalWindow.__THREE_GAME_DIAGNOSTICS__ = {
      phase: this.phase,
      enemy: this.enemyPreset.name,
      mode: this.mode,
      progression: {
        ladderIndex: this.progression.ladderIndex,
        bestLadder: this.progression.bestLadder,
        championshipCount: this.progression.championshipCount,
        coins: this.progression.coins,
        unlockedParts: [...this.progression.unlockedSet],
      },
      player: {
        spin: this.player.spin,
        integrity: this.player.integrity,
        burst: this.player.burst,
        speed: this.player.velocity.length(),
        spirit: this.player.spirit,
        tacticalMode: this.player.tacticalMode,
        shieldHits: this.player.shieldHits,
        flags: { ...this.player.flags },
        activeEffects: this.player.statusEffects.map((effect) => ({ id: effect.id, remaining: Number(effect.remaining.toFixed(2)) })),
        modifiers: resolveModifiers(this.player),
      },
      team: {
        size: this.playerTeam.length,
        activePlayerIndex: this.activePlayerIndex,
        queuedTagState: this.player.queuedTagState,
      },
      enemyState: {
        spin: this.enemy.spin,
        integrity: this.enemy.integrity,
        burst: this.enemy.burst,
        speed: this.enemy.velocity.length(),
        spirit: this.enemy.spirit,
        tacticalMode: this.enemy.tacticalMode,
        shieldHits: this.enemy.shieldHits,
        flags: { ...this.enemy.flags },
        activeEffects: this.enemy.statusEffects.map((effect) => ({ id: effect.id, remaining: Number(effect.remaining.toFixed(2)) })),
        modifiers: resolveModifiers(this.enemy),
      },
      turn: {
        state: this.turnState,
        timer: this.turnTimer,
        index: this.turnIndex,
        resolution: this.activeTurnResolution?.kind ?? null,
      },
      paused: this.paused,
      camera: this.rig.getDebugState(),
      renderer: {
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
      },
    };

    globalWindow.__RIPTOP_QA__ = {
      startBattle: () => this.startBattle(),
      quickLaunch: () => {
        this.launchCharge = 0.82;
        this.doLaunch();
      },
      forceDanger: () => {
        this.phase = 'battle';
        this.turnState = 'awaiting';
        this.turnPanel.update({ visible: true, resolving: false, spirit: this.player.spirit, maxSpirit: this.player.maxSpirit, turnIndex: this.turnIndex });
        this.player.position.set(6.9, 1.1);
        this.player.velocity.set(2.6, 0.4);
        this.enemy.position.set(3.4, -0.8);
        this.enemy.velocity.set(1.4, 0.2);
        this.player.spin = Math.max(this.player.spin, this.player.stats.maxSpin * 0.72);
        this.enemy.spin = Math.max(this.enemy.spin, this.enemy.stats.maxSpin * 0.74);
      },
      forceRetreatReverseSetup: () => {
        this.phase = 'battle';
        this.turnState = 'awaiting';
        this.turnPanel.update({ visible: true, resolving: false, spirit: this.player.spirit, maxSpirit: this.player.maxSpirit, turnIndex: this.turnIndex });
        this.player.position.set(6.1, 0.4);
        this.player.velocity.set(2.2, 0.2);
        this.enemy.position.set(1.6, -0.2);
        this.enemy.velocity.set(0.6, 0.1);
      },
      forceShieldClashSetup: () => {
        this.phase = 'battle';
        this.turnState = 'awaiting';
        this.turnPanel.update({ visible: true, resolving: false, spirit: this.player.spirit, maxSpirit: this.player.maxSpirit, turnIndex: this.turnIndex });
        this.player.position.set(-0.9, 0.05);
        this.player.velocity.set(2.8, 0);
        this.enemy.position.set(0.95, -0.02);
        this.enemy.velocity.set(-2.4, 0);
      },
      forceResult: (winner: 'player' | 'enemy' = 'player') =>
        this.showResult({
          winner,
          loser: winner === 'player' ? 'enemy' : 'player',
          kind: 'burst finish',
          label: '鐖嗚缁堢粨',
        }),
      garage: () => this.showGarage(),
      menu: () => this.showMenu(),
      tacticalMode: () => this.player.tacticalMode,
      cycleTacticalMode: () => this.cyclePlayerTacticalMode(),
      castSkill: (skillId: SkillId) => this.castSkill(skillId),
      submitTurnAction: (action: TurnAction) => this.submitTurnAction(action),
      executeTagSubstitution: () => this.executeTagSubstitution(),
      fillSpirit: (side: 'player' | 'enemy' = 'player') => {
        const target = side === 'player' ? this.player : this.enemy;
        this.spirit.set(target, target.maxSpirit);
      },
      team: () => ({
        size: this.playerTeam.length,
        activePlayerIndex: this.activePlayerIndex,
        queuedTagState: this.player.queuedTagState,
      }),
      flags: () => ({
        player: { ...this.player.flags },
        enemy: { ...this.enemy.flags },
      }),
      modifiers: () => ({
        player: resolveModifiers(this.player),
        enemy: resolveModifiers(this.enemy),
      }),
      dashCenter: () => this.physics.dashPlayer(this.player, new THREE.Vector3(0, 0, 0), this.energy),
      state: () => globalWindow.__THREE_GAME_DIAGNOSTICS__,
    };
  }

  private triggerLaunchFlash(power: number) {
    this.launchFlash.style.opacity = `${0.28 + power * 0.18}`;
    this.launchFlash.style.transform = 'scale(1.015)';
    window.setTimeout(() => {
      this.launchFlash.style.opacity = '0';
      this.launchFlash.style.transform = 'scale(1)';
    }, 80);
  }
  private renderCameraDebug() {
    const state = this.rig.getDebugState();
    this.cameraDebug.innerHTML = `
      <div class="camera-debug__title">\u955c\u5934\u8c03\u8bd5</div>
      <div class="camera-debug__row"><span>\u6a21\u5f0f</span><strong>${state.mode}</strong></div>
      <div class="camera-debug__row"><span>\u8ffd\u51fb\u6743\u91cd</span><strong>${state.chaseWeight.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u5371\u9669\u6743\u91cd</span><strong>${state.dangerWeight.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u8fb9\u7f18\u5371\u9669</span><strong>${state.edgeDanger.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u95f4\u8ddd</span><strong>${state.separation.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u76f8\u5bf9\u901f\u5ea6</span><strong>${state.relativeSpeed.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u8ddd\u79bb</span><strong>${state.distance.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u9ad8\u5ea6</span><strong>${state.height.toFixed(2)}</strong></div>
      <div class="camera-debug__row"><span>\u8c03\u8282\u9879</span><strong>${this.selectedTuningKey}</strong></div>
      <div class="camera-debug__row"><span>\u6570\u503c</span><strong>${CAMERA_TUNING[this.selectedTuningKey].toFixed(2)}</strong></div>
      <div class="camera-debug__hint">';' / "'" \u5207\u6362\uff0c'[' / ']' \u8c03\u6574</div>
    `;
  }

  private cycleCameraTuning(direction: -1 | 1) {
    const index = this.tuningKeys.indexOf(this.selectedTuningKey);
    const next = (index + direction + this.tuningKeys.length) % this.tuningKeys.length;
    this.selectedTuningKey = this.tuningKeys[next];
  }

  private adjustCameraTuning(delta: number) {
    const next = Math.max(0.01, Number((CAMERA_TUNING[this.selectedTuningKey] + delta).toFixed(2)));
    CAMERA_TUNING[this.selectedTuningKey] = next;
    this.renderCameraDebug();
  }
}


