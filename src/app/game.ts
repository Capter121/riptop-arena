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
import { arenaManager } from '../gameplay/arenaManager';
import { RuleSystem, type BattleResult } from '../gameplay/rules';
import { launchTop } from '../gameplay/launch';
import { applyDamageResult, calculateTurnDamage, type DamageResult } from '../gameplay/damage';
import { clearTransientFlags } from '../gameplay/flags';
import { EnergySystem } from '../gameplay/energy';
import { resolveModifiers } from '../gameplay/modifiers';
import { SkillManager, getSkillLabel } from '../gameplay/skills';
import { SpiritSystem } from '../gameplay/spirit';
import { TurnPanel } from '../ui/turnPanel';
import { ClashQtePanel } from '../ui/clashQtePanel';
import { VoiceBoostOverlay } from '../ui/voiceBoostOverlay';
import { FloatingTextManager } from '../ui/floatingTextManager';
import { MenuPanel } from '../ui/menus';
import { GaragePanel } from '../ui/garage';
import { ResultPanel } from '../ui/results';
import { ShopPanel } from '../ui/shop';
import { Hud } from '../ui/hud';
import {
  accumulateAffinityDamageSummary,
  createAffinityMatchupPresentation,
  createEmptyAffinityDamageSummary,
  formatAffinityDamageLog,
  getResonanceLabel,
  renderAffinityMatchup,
  type AffinityDamageSummary,
} from '../ui/affinityPresentation';
import { CutinPanel } from '../ui/cutinPanel';
import { ForgePanel } from '../ui/forgePanel';
import { BlackMarketPanel } from '../ui/blackMarket';
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
import { NetworkClient } from '../network/networkClient';
import { LanModal } from '../ui/lanModal';
import { DEFAULT_NSS_LOADOUT, NssLoadoutController } from '../nss/loadoutController';
import { buildNssBattleStats } from '../nss/buildStats';
import { NSS_BATTLE_CATALOG_SHA256 } from '../nss/battleCatalog';
import { nssCombinationId } from '../nss/loadout';
import {
  oppositeRole,
  mirrorTurnResolutionForGuest,
  PRIVATE_ROOM_TOKEN_PATTERN,
  type LaunchConfig,
  type NetworkTopState,
  type OnlineLoadout,
  type OnlineRole,
  type ServerMessage,
  type TurnSnapshot,
} from '../network/protocol';
import {
  ELEMENT_ATTACKS,
  DEFAULT_TACTICAL_MODE,
  type ElementAttackSkillId,
  type SkillTier,
  type SkillId,
  type TacticalMode,
  type TurnAction,
} from '../types/battle';
import { resolveBattleAffinityRelation } from '../gameplay/affinityDamage';
import {
  createBattleSeed,
  parseBattleSeed,
  type BattleSeed,
} from '../sim/battleSeed';
import type { RandomSource } from '../sim/rng';
import { BattleRuntime, type BattleTickInput } from '../sim/battleRuntime';
import { encodePlayerVoiceFrame } from '../sim/voiceBoost';
import {
  BattleReplayCursor,
  createBattleOutcomeSummary,
  stringifyBattleOutcomeSummary,
  validateBattleInputLog,
  type BattleInputLogV1,
  type BattleOutcomeSummaryV1,
  type BattleTurnInputV1,
} from '../sim/battleRecord';
import {
  advanceAiQteScore,
  createAiQteRate,
  pickAiLaunch,
  pickAiTurnAction as chooseAiTurnAction,
} from '../gameplay/ai';
import type { GameChallengeOptions } from '../challenges/challengeBootstrap';
import type { CampaignSubmitResult, GameCampaignOptions } from '../campaign/campaignController';
import { buildCampaignCustomizerPath } from '../campaign/campaignReturn';
import { campaignObjectiveText } from '../data/campaign/objectives';
import { commitProgressionSync } from '../progression/progressionClient';
import {
  settleChallengeResult,
  type PendingChallengeEnvelope,
} from '../challenges/pendingChallengeResult';

const QA_HIT_RANDOM: RandomSource = {
  nextFloat: () => 1,
  nextUint32: () => 0xffff_ffff,
  nextInt: (_min, maxExclusive) => maxExclusive - 1,
};

const QA_CRIT_RANDOM: RandomSource = {
  nextFloat: () => 0,
  nextUint32: () => 0,
  nextInt: (min) => min,
};

type TurnState = 'awaiting' | 'approaching' | 'clash_qte' | 'resolving' | 'cutin';

type ClashQteState = {
  resolution: TurnResolution;
  tier: SkillTier;
  phase: 'intro' | 'active';
  introLeft: number;
  playerScore: number;
  enemyScore: number;
  timeLeft: number;
  duration: number;
  aiRate: number;
  tapPower: number;
  lastScoreSentAt: number;
  finalScoreSent: boolean;
  remoteFinalReceived: boolean;
  finishGraceLeft: number;
};
import {
  advanceLadder,
  awardCoins,
  awardChampionship,
  getPartUpgradeLevel,
  getNextUnlock,
  loadProgression,
  progressionFromServer,
  MAX_PART_UPGRADE_LEVEL,
  MAX_SYSTEM_UPGRADE_LEVEL,
  resetRun,
  saveProgression,
  setPartUpgradeLevel,
  setUpgradeLevel,
  spendCoins,
  setBuild as setProgressionBuild,
  setNssLoadout,
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
  private readonly network = new NetworkClient();
  private readonly lanModal = new LanModal();
  private readonly nssLoadouts = new NssLoadoutController();
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
  private readonly blackMarket = new BlackMarketPanel();
  private readonly forgePanel = new ForgePanel(
    () => this.progression.unlockedSet,
    (id) => {
       this.progression = unlockPart(this.progression, id);
       saveProgression(this.progression);
    }
  );
  private readonly cutinPanel = new CutinPanel();
  private readonly hud = new Hud();
  private readonly floatingTexts = new FloatingTextManager(this.camera);
  private readonly audio = new SynthAudio();
  private readonly launchFlash = document.createElement('div');
  private readonly cameraDebug = document.createElement('div');
  private readonly introCard = document.createElement('div');
  private readonly affinityVersus = document.createElement('div');
  private affinityVersusTimer: number | null = null;
  private readonly touchMode = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  private enemy = new TopEntity('enemy', this.enemyPreset.build);
  
  private energy = new EnergySystem();
  private spirit = new SpiritSystem();
  private skillManager = new SkillManager(this.spirit);
  private readonly turnArbitrator = new TurnArbitrator();
  private readonly turnPanel = new TurnPanel((action) => this.submitTurnAction(action));
  private readonly clashQtePanel = new ClashQtePanel();
  private readonly voiceBoostOverlay = new VoiceBoostOverlay();
  private battleRuntime: BattleRuntime | null = null;
  private battleOutcomeSummary: BattleOutcomeSummaryV1 | null = null;
  private battleReplay: { log: BattleInputLogV1; cursor: BattleReplayCursor } | null = null;
  private qaVoiceSample: number | null = null;
  private vKeyHeld = false;
  private playerVoiceVolume = 0;
  private aiVoiceVolume = 0;
  private voiceBoostActive = false;
  private playerDefensiveSuccesses = 0;
  private enemyDefensiveSuccesses = 0;
  private voiceAnalyzerRequested = false;
  private turnState: TurnState = 'awaiting';
  private turnTimer = 0;
  private turnChargeFeedbackEmitted = false;
  private turnIndex = 1;
  private activeTurnResolution: TurnResolution | null = null;
  private activeClashQte: ClashQteState | null = null;
  private battleMode: 'single' | 'online' | 'challenge' | 'campaign' = 'single';
  private onlineTurnId = 0;
  private onlineTurnDeadline = 0;
  private onlineStartAt: number | null = null;
  private onlineLaunchConfig: LaunchConfig | null = null;
  private pendingOnlineSnapshot: TurnSnapshot | null = null;
  private onlineOpponentName = 'Online Rival';
  private onlineLocalLoadout: OnlineLoadout | null = null;

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
  private affinityDamageSummary: AffinityDamageSummary = createEmptyAffinityDamageSummary();
  private shopNotice = '\u91d1\u5e01\u53ef\u7528\u4e8e\u8d2d\u4e70\u65b0\u90e8\u4ef6\u548c\u5f3a\u5316\u5f53\u524d\u914d\u7f6e\u3002\u80dc\u5229\u540e\u56de\u6765\u5347\u7ea7\uff0c\u4e0b\u4e00\u573a\u6218\u6597\u4f1a\u7acb\u5373\u751f\u6548\u3002';
  private time = 0;
  private timeScale = 1;
  private hitStop = 0;
  private dragDirection = new THREE.Vector2();
  private readonly params = new URLSearchParams(window.location.search);
  private readonly nssRequest = this.nssLoadouts.resolve(window.location.search, this.progression.latestNssLoadout);
  private nssBattlePreparing = false;
  private paused = false;
  private readonly camDebugEnabled = this.params.has('camDebug');
  private readonly qaEnabled = this.params.has('qa') || this.params.has('debug') || this.camDebugEnabled
    || (import.meta.env.DEV && (this.params.has('challenge') || this.params.has('campaign')));
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
  private readonly challenge: GameChallengeOptions | null;
  private readonly campaign: GameCampaignOptions | null;
  private challengeEnvelope: PendingChallengeEnvelope | null = null;
  private challengeSettlement: 'idle' | 'submitting' | 'submitted' | 'pending' | 'storage_failed' = 'idle';
  private campaignSettlement: CampaignSubmitResult | null = null;
  private campaignNextOpponentId: string | null = null;

  constructor(mount: HTMLElement, session: GameChallengeOptions | GameCampaignOptions | null = null) {
    this.mount = mount;
    this.campaign = session && 'battleKind' in session && session.battleKind === 'campaign' ? session : null;
    this.challenge = session && !('battleKind' in session) ? session : null;
    this.scene.background = new THREE.Color('#050910');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // 閳光偓閳光偓 Cyberpunk Stage Lighting 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    // Dim ambient (just fills the darkest crevices).
    const ambient = new THREE.AmbientLight('#2a3240', 1.0);

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
    envScene.background = new THREE.Color('#252b36');
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
    this.arena.setScene(this.scene);

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
    this.affinityVersus.className = 'affinity-versus affinity-versus--hidden';
    this.introCard.innerHTML = `
      <div class="intro-card__crest"></div>
      <div class="intro-card__eyebrow">鏂伴挗閾佽仈鐩?/div>
      <div class="intro-card__title">鎴樻枟闄€铻虹珵鎶€鍦?/div>
      <div class="intro-card__subtitle">鐐圭噧鏃嬭浆锛岄攣瀹氳妭濂忥紝缁熸不璧涘満</div>
    `;
    this.mount.innerHTML = '';
    this.mount.append(this.renderer.domElement, this.overlay, this.launchFlash, this.introCard, this.affinityVersus);
    this.overlay.append(this.menu.root, this.garage.root, this.shop.root, this.results.root, this.cutinPanel.root, this.forgePanel.root, this.blackMarket.root);
    if (this.camDebugEnabled) {
      this.mount.append(this.cameraDebug);
    }
    this.hud.attach(this.mount);
    this.floatingTexts.attach(this.mount);
    this.turnPanel.attach(this.mount);
    this.clashQtePanel.attach(this.mount);
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
      this.sparks.clear();
      if (this.isChargeTurnResolving()) return;

      const isAbsoluteZero = arenaManager.getTheme() === 'absolute_zero';
      const particleIntensity = isAbsoluteZero ? intensity * 0.55 : intensity;

      // Trigger shockwave ring on medium-to-strong impact
      if (intensity > 0.4) {
        const ringColor = isAbsoluteZero ? 0x00ffff : (intensity > 1.2 ? 0xff4400 : 0xffaa00);
        this.shockwave.trigger(x, 0.3, z, particleIntensity * 0.8, ringColor);
      }

      // Trigger lightning bolts and friction smoke on strong collisions
      if (!isAbsoluteZero && intensity > 0.7) {
        this.lightning.strike(x, 0.4, z, intensity > 1.2 ? 0xff0055 : 0x00ffff);
        this.trails.emitSmoke(x, 0.2, z, 0xffaa00, Math.floor(intensity * 12), 0.5);
      }
    });

    this.events.on('collision_damage', ({ side, amount, x, z, intensity }) => {
      this.floatingTexts.spawnCollisionDamage(side, amount, x, 0.72, z, intensity);
    });

    this.events.on('shield_block', ({ x, z, side, shieldHits }) => {
      const color = side === 'player' ? 0x7ef0ff : 0xffcc66;
      this.shockwave.trigger(x, 0.35, z, 1.2, color);
      this.lightning.strike(x, 0.28, z, color);
      this.lightning.strike(x, 0.45, z, 0xffffff);
      this.trails.emitSmoke(x, 0.18, z, color, 15, 0.5);
      this.audio.clash(0.55);
      this.hud.combatLog.log(`护盾格挡！剩余 ${shieldHits} 层`, '#7ef0ff');
    });

    this.events.on('retreat_reverse_trigger', ({ x, z, side }) => {
      const color = side === 'player' ? 0x7ef0ff : 0xff8844;
      this.shockwave.trigger(x, 0.4, z, 1.0, color);
      this.lightning.strike(x, 0.32, z, color);
      this.hud.combatLog.log('回旋伪退发动', '#ffd166');
    });

    this.events.on('spark', ({ intensity }) => this.audio.clash(intensity));

    this.events.on('launch', ({ power }) => {
      this.audio.launch(power);
      // Emit launch shockwave & smoke
      this.shockwave.trigger(-6, 0.3, 0, power * 1.5, 0x00ffff);
      this.shockwave.trigger(6, 0.3, 0, power * 1.5, 0xff5500);
      this.trails.emitSmoke(-6, 0.3, 0, 0x00ffff, 20, 0.6);
      this.trails.emitSmoke(6, 0.3, 0, 0xff5500, 20, 0.6);
      this.hud.combatLog.log(`3, 2, 1，发射！(力度 ${Math.round(power * 100)}%)`, '#7ef0ff');
    });

    this.events.on('dash', () => {
      this.audio.dash();
      this.hud.combatLog.log('闪避冲刺', '#00ccff');
    });

    this.events.on('burst', ({ loser }) => {
      const target = loser === 'player' ? this.player : this.enemy;
      const tx = target.position.x;
      const tz = target.position.y;
      this.sparks.burst(tx, tz);
      this.shockwave.trigger(tx, 0.4, tz, 2.5, 0xff0033);
      this.lightning.strike(tx, 0.5, tz, 0xffaa00);
      this.lightning.strike(tx, 0.8, tz, 0xffffff);
      this.trails.emitSmoke(tx, 0.3, tz, 0xff3300, 35, 1.0);
      this.audio.burst();
      this.hitStop = Math.max(this.hitStop, 0.08);
      this.rig.kickShake(1.2);
      this.hud.combatLog.log('爆裂击破', '#ff3300');
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
      this.beginSingleSession();
      this.mode = 'quick';
      this.enemyPreset = pick(ENEMIES);
      this.startBattle();
    });
    this.menu.online.addEventListener('click', () => {
      if (this.onlineActive()) this.cancelOnlineQueue();
      else this.lanModal.show();
    });
    this.lanModal.setupCallbacks({
      onRandom: (url, displayName) => void this.startOnlineMatch('random', displayName, url),
      onCreate: (url, displayName) => void this.startOnlineMatch('create', displayName, url),
      onJoin: (url, displayName, roomToken) => void this.startOnlineMatch('join', displayName, url, roomToken),
      onCancel: () => this.cancelOnlineQueue(),
    });
    this.menu.survival.addEventListener('click', () => {
      this.beginSingleSession();
      this.mode = 'survival';
      this.enemyPreset = pick(ENEMIES);
      this.startBattle();
    });
    this.menu.tournament.addEventListener('click', () => {
      window.location.assign('/campaign/');
    });
    this.menu.garage.addEventListener('click', () => this.showGarage());
    this.menu.forge.addEventListener('click', () => {
      this.forgePanel.open();
    });
    this.menu.blackMarket.addEventListener('click', () => {
      this.blackMarket.open(
        (cost) => {
          this.progression = spendCoins(this.progression, cost);
          saveProgression(this.progression);
          this.menu.setMeta(this.getMenuMetaCn());
        },
        () => this.progression.coins
      );
    });
    this.menu.stageSelect.addEventListener('change', () => {
      const theme = this.menu.stageSelect.value;
      this.arena.setTheme(theme);
      this.garage.stageSelect.value = theme;
    });

    this.garage.stageSelect.addEventListener('change', () => {
      const theme = this.garage.stageSelect.value;
      this.arena.setTheme(theme);
      this.menu.stageSelect.value = theme;
    });

    
    this.garage.backButton.addEventListener('click', () => {
      this.showMenu();
    });
    this.garage.shopButton.addEventListener('click', () => this.showShop());
    this.garage.battleButton.addEventListener('click', () => {
      this.beginSingleSession();
      if (this.nssRequest.kind === 'ready') {
        this.progression = setNssLoadout(this.progression, this.nssRequest.loadout);
      } else {
        this.build = this.garage.readBuild();
        this.progression = setProgressionBuild(this.progression, this.build);
      }
      saveProgression(this.progression);
      this.enemyPreset = this.mode === 'tournament' ? this.getTournamentEnemy() : pick(ENEMIES);
      this.arena.setTheme(this.garage.stageSelect.value);
      this.startBattle();
    });
    for (const select of this.garage.selects.values()) {
      select.addEventListener('change', () => this.refreshGarageStats());
    }

    this.results.retry.addEventListener('click', () => {
      if (this.battleMode === 'campaign') {
        window.location.assign(`/campaign/?opponent=${encodeURIComponent(this.campaign!.opponentId)}`);
        return;
      }
      if (this.battleMode === 'challenge') {
        window.location.assign('/challenges/');
        return;
      }
      if (this.battleMode === 'online') {
        this.network.disconnect();
        this.battleMode = 'single';
        this.showMenu();
        return;
      }
      this.enemyPreset = this.mode === 'tournament' ? this.getTournamentEnemy() : pick(ENEMIES);
      this.arena.setTheme(this.garage.stageSelect.value);
      this.startBattle();
    });
    this.results.garage.addEventListener('click', () => {
      if (this.battleMode === 'campaign') {
        window.location.assign(`/campaign/?opponent=${encodeURIComponent(this.campaign!.opponentId)}`);
        return;
      }
      if (this.battleMode === 'challenge') {
        if (this.challengeSettlement === 'submitted') void this.createChallengeRematch();
        else void this.submitChallengeResult();
        return;
      }
      this.showGarage();
    });
    this.results.campaignNext.addEventListener('click', () => {
      if (this.campaignNextOpponentId) window.location.assign(`/arena/?campaign=${encodeURIComponent(this.campaignNextOpponentId)}`);
    });
    this.results.campaignReplay.addEventListener('click', () => {
      if (this.campaign) window.location.assign(`/arena/?campaign=${encodeURIComponent(this.campaign.opponentId)}`);
    });
    this.results.campaignCustomize.addEventListener('click', () => {
      if (this.campaign) window.location.assign(buildCampaignCustomizerPath(this.campaign.opponentId, this.progression.latestNssLoadout));
    });
    this.results.campaignArchive.addEventListener('click', () => {
      if (this.campaign) window.location.assign(`/campaign/?opponent=${encodeURIComponent(this.campaign.opponentId)}`);
    });
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

    this.network.onStateChange((state) => this.updateOnlineMenuState(state));
    this.network.onMessage((message) => this.handleNetworkMessage(message));
    this.refreshBlackMarket();
    this.resize();
    if (this.challenge) void this.startChallengeBattle();
    else if (this.campaign) void this.startCampaignBattle();
    else {
      this.showMenu();
      const roomToken = this.params.get('room');
      if (roomToken !== null) {
        this.lanModal.showJoin(roomToken);
        if (!PRIVATE_ROOM_TOKEN_PATTERN.test(roomToken)) this.lanModal.updateStatus('error', '好友房间链接无效');
      }
    }
    window.setTimeout(() => this.introCard.classList.add('intro-card--hidden'), 1800);

    this.exposeDiagnostics();
    if (!this.challenge && !this.campaign && this.params.has('qa')) {
      this.enemyPreset = ENEMIES[0];
      this.startBattle();
      this.launchCharge = 0.84;
      this.doLaunch();
    }
  }

  start() {
    this.loop.start();
  }

  private beginSingleSession() {
    // [ONLINE HOOK] Single-player entry points always release queue or room state.
    this.network.disconnect();
    this.battleMode = 'single';
    this.onlineTurnId = 0;
    this.onlineStartAt = null;
    this.onlineLaunchConfig = null;
    this.pendingOnlineSnapshot = null;
    this.onlineLocalLoadout = null;
  }

  private battleRandom() {
    if (!this.battleRuntime) throw new Error('Battle simulation runtime is not initialized.');
    return this.battleRuntime.context.random;
  }

  private turnRandomSources() {
    const random = this.battleRandom();
    return { combat: random.combat, physics: random.physics };
  }

  private onlineActive() {
    return ['connecting', 'queued', 'private_waiting', 'matched', 'in_battle'].includes(this.network.state);
  }

  private cancelOnlineQueue() {
    this.network.cancelQueue();
    this.onlineLocalLoadout = null;
    this.battleMode = 'single';
    this.menu.setOnlineState('真人联机', '已取消匹配');
    this.lanModal.updateStatus('idle', '已取消匹配');
  }

  private createOnlineLoadout(): OnlineLoadout {
    return this.nssRequest.kind === 'ready'
      ? {
          kind: 'nss-v1',
          comboId: nssCombinationId(this.nssRequest.loadout.combination),
          loadout: this.nssRequest.loadout,
          upgrades: { ...this.progression.upgrades },
          catalogSha256: NSS_BATTLE_CATALOG_SHA256,
        }
      : {
          kind: 'legacy',
          build: cloneBuild(this.build),
          upgrades: { ...this.progression.upgrades },
          partUpgrades: { ...this.progression.partUpgrades },
        };
  }

  private async startOnlineMatch(kind: 'random' | 'create' | 'join', displayName: string, customUrl?: string, roomToken = '') {
    if (this.onlineActive()) return;
    this.battleMode = 'online';
    this.mode = 'quick';
    const loadout = this.createOnlineLoadout();
    this.onlineLocalLoadout = loadout;
    try {
      this.lanModal.updateStatus('connecting', '正在连接真人匹配服务...');
      if (kind === 'create') await this.network.createPrivateRoom(displayName, loadout, customUrl);
      else if (kind === 'join') await this.network.joinPrivateRoom(roomToken, displayName, loadout, customUrl);
      else await this.network.joinQueue(displayName, loadout, customUrl);
    } catch (error) {
      this.network.disconnect();
      this.battleMode = 'single';
      this.onlineLocalLoadout = null;
      const msg = error instanceof Error ? error.message : '真人匹配服务不可用';
      this.menu.setOnlineState('真人联机', msg);
      this.lanModal.updateStatus('error', msg);
    }
  }

  private updateOnlineMenuState(state: string) {
    if (state === 'connecting') {
      this.menu.setOnlineState('连接中...', '正在连接真人对战服务', true);
      this.lanModal.updateStatus(state, '正在连接真人匹配服务...');
    } else if (state === 'queued') {
      this.menu.setOnlineState('匹配中...（点击取消）', '等待另一位玩家加入', true);
      this.lanModal.updateStatus(state, '随机匹配排队中，等待另一位玩家');
    } else if (state === 'private_waiting') {
      this.menu.setOnlineState('好友房间等待中', '复制链接邀请指定朋友', true);
    } else if (state === 'matched') {
      this.menu.setOnlineState('对手已找到', '正在准备战斗场地', true);
      this.lanModal.updateStatus(state, '已找到对手，正在进入赛场...');
      setTimeout(() => this.lanModal.hide(), 1200);
    } else if (state === 'in_battle') {
      this.menu.setOnlineState('真人联机', '联机对战进行中', true);
      this.lanModal.updateStatus(state, '真人对战进行中');
      this.lanModal.hide();
    } else if (state === 'idle') {
      this.menu.setOnlineState('真人联机', '随机匹配或指定好友房间');
      this.lanModal.updateStatus(state, '请选择匹配方式');
    } else if (state === 'closed' && this.battleMode === 'online' && (this.phase === 'launch' || this.phase === 'battle')) {
      this.handleOnlineAbort('真人联机服务已断开');
    }
  }

  private handleNetworkMessage(message: ServerMessage) {
    switch (message.type) {
      case 'PRIVATE_ROOM_CREATED':
        this.lanModal.showPrivateRoomLink(this.createPrivateRoomLink(message.roomToken));
        break;
      case 'MATCHED':
        this.removePrivateRoomParameter();
        void this.prepareOnlineBattle(message.opponentLoadout, message.opponentName);
        break;
      case 'ALL_READY':
        if (this.network.role === 'host') {
          this.network.sendMatchStart(3_000, {
            hostX: -6,
            guestX: 6,
            z: 0,
            hostPower: 0.82,
            guestPower: 0.82,
          });
        }
        break;
      case 'MATCH_START':
        this.onlineStartAt = performance.now() + message.startDelayMs;
        this.onlineLaunchConfig = message.launchConfig;
        this.countdown = message.startDelayMs / 1000;
        break;
      case 'STATE':
        this.applyRemoteNetworkState(message);
        break;
      case 'TURN_OPEN':
        this.onlineTurnId = message.turnId;
        this.onlineTurnDeadline = message.deadline;
        this.turnIndex = message.turnId;
        this.turnState = 'awaiting';
        this.turnPanel.setPanelLock(false);
        break;
      case 'TURN_ACTION_SET':
        if (this.network.role === 'host') this.resolveOnlineHostTurn(message.hostAction, message.guestAction, message.turnId);
        break;
      case 'TURN_RESOLVED':
        if (this.network.role === 'guest') this.beginOnlineGuestTurn(message.resolution, message.snapshot);
        break;
      case 'CLASH_QTE_START':
        if (this.network.role === 'guest') this.beginOnlineGuestClashQte(message.resolution);
        break;
      case 'CLASH_QTE_SCORE':
        this.receiveOnlineClashQteScore(message.turnId, message.score, message.final);
        break;
      case 'CRIT_TRIGGERED':
        this.playRemoteCrit(message.target, message.damage, message.skillTier);
        break;
      case 'SUBSTITUTE_HERO':
        this.playOnlineSubstitution(message.actor === this.network.role ? this.player : this.enemy, '\u5bf9\u624b\u6362\u4eba');
        break;
      case 'TURN_TIMEOUT': {
        const winner = message.winner === this.network.role ? 'player' : 'enemy';
        this.showResult({ winner, loser: winner === 'player' ? 'enemy' : 'player', kind: 'timeout', label: '\u56de\u5408\u8d85\u65f6' });
        this.network.disconnect();
        break;
      }
      case 'PEER_DISCONNECTED':
        this.handleOnlineAbort('\u5bf9\u624b\u5df2\u65ad\u5f00\uff0c\u8054\u673a\u5bf9\u6218\u5df2\u7ed3\u675f');
        break;
      case 'ERROR':
        if (['INVALID_ROOM_TOKEN', 'PRIVATE_ROOM_NOT_FOUND', 'ALREADY_WAITING', 'ALREADY_MATCHED'].includes(message.code)) {
          const labels: Record<string, string> = {
            INVALID_ROOM_TOKEN: '好友房间链接无效',
            PRIVATE_ROOM_NOT_FOUND: '房间已失效，请让好友重新创建',
            ALREADY_WAITING: '当前已经在等待对手',
            ALREADY_MATCHED: '当前已经进入其他对战房间',
          };
          this.network.disconnect();
          this.battleMode = 'single';
          this.onlineLocalLoadout = null;
          this.lanModal.updateStatus('error', labels[message.code] ?? message.message);
        } else if (message.code === 'READY_TIMEOUT' || message.code === 'ROOM_NOT_FOUND') this.handleOnlineAbort(message.message);
        else if (['connecting', 'queued', 'private_waiting'].includes(this.network.state)) {
          this.network.disconnect();
          this.battleMode = 'single';
          this.onlineLocalLoadout = null;
          this.lanModal.updateStatus('error', message.message);
        }
        else this.hud.combatLog.log(`Network: ${message.message}`, '#ff7b5b');
        break;
    }
  }

  private createPrivateRoomLink(roomToken: string) {
    const url = new URL('/arena/', window.location.origin);
    url.searchParams.set('room', roomToken);
    return url.toString();
  }

  private removePrivateRoomParameter() {
    if (!this.params.has('room')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  private async prepareOnlineBattle(loadout: OnlineLoadout, opponentName: string) {
    if (!this.onlineLocalLoadout) {
      this.handleOnlineAbort('Local online loadout is missing.');
      return;
    }
    this.battleMode = 'online';
    this.onlineOpponentName = opponentName;
    const roomId = this.network.roomId;
    try {
      const [player, enemy] = await Promise.all([
        this.createOnlineTop('player', this.onlineLocalLoadout),
        this.createOnlineTop('enemy', loadout),
      ]);
      if (!roomId || this.network.roomId !== roomId || this.network.state !== 'matched') {
        player.detachNssVisual();
        enemy.detachNssVisual();
        return;
      }
      this.startBattleWithPlayer(player);
      this.scene.remove(this.enemy.mesh);
      this.enemy.detachNssVisual();
      this.enemy = enemy;
      this.enemy.reset(6, 0);
      this.scene.add(this.enemy.mesh);
      this.phase = 'launch';
      this.charging = false;
      this.countdown = COUNTDOWN_SECONDS;
      this.network.sendReady();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.handleOnlineAbort('Online model load failed: ' + detail);
    }
  }

  private createOnlineTop(side: 'player' | 'enemy', loadout: OnlineLoadout): Promise<TopEntity> {
    return loadout.kind === 'nss-v1'
      ? this.nssLoadouts.createTop(side, loadout.loadout, loadout.upgrades)
      : Promise.resolve(new TopEntity(side, loadout.build, loadout.upgrades, loadout.partUpgrades));
  }

  private handleOnlineAbort(message: string) {
    this.network.disconnect();
    this.battleMode = 'single';
    this.onlineLocalLoadout = null;
    this.activeTurnResolution = null;
    this.activeClashQte = null;
    this.clashQtePanel.hide();
    this.pendingOnlineSnapshot = null;
    this.turnState = 'awaiting';
    this.turnPanel.setPanelLock(false);
    this.showMenu();
    this.menu.setOnlineState('\u771f\u4eba\u8054\u673a', message);
  }

  private applyRemoteNetworkState(state: NetworkTopState) {
    // [ONLINE HOOK] Deliberate direct overwrite: no prediction or interpolation in the MVP.
    this.enemy.position.set(
      THREE.MathUtils.clamp(state.x, -20, 20),
      THREE.MathUtils.clamp(state.z, -20, 20),
    );
    this.enemy.velocity.set(
      THREE.MathUtils.clamp(state.vx, -100, 100),
      THREE.MathUtils.clamp(state.vz, -100, 100),
    );
    this.enemy.spin = THREE.MathUtils.clamp(state.spin, 0, this.enemy.stats.maxSpin * 2);
    if (this.network.role === 'guest') {
      this.enemy.integrity = THREE.MathUtils.clamp(state.hp, 0, this.enemy.stats.maxIntegrity);
      this.enemy.alive = state.alive && this.enemy.integrity > 0;
    }
  }

  private playRemoteCrit(targetRole: OnlineRole, damage: number, skillTier: SkillTier) {
    const target = targetRole === this.network.role ? this.player : this.enemy;
    this.floatingTexts.spawn(`CRIT T${skillTier} -${damage}`, target.position.x, 0.78, target.position.y, '#ff4d3d', true);
    this.shockwave.trigger(target.position.x, 0.45, target.position.y, 1.25, 0xff4d3d);
    this.rig.kickShake(0.8);
  }

  private playOnlineSubstitution(top: TopEntity, label: string) {
    const startedAt = performance.now();
    this.floatingTexts.spawn(label, top.position.x, 0.82, top.position.y, '#7ef0ff');
    this.shockwave.trigger(top.position.x, 0.35, top.position.y, 0.9, 0x7ef0ff);
    const animate = (now: number) => {
      const progress = THREE.MathUtils.clamp((now - startedAt) / 350, 0, 1);
      const scale = Math.max(0.08, Math.abs(progress * 2 - 1));
      top.mesh.scale.multiplyScalar(scale);
      top.mesh.visible = progress < 0.44 || progress > 0.56;
      if (progress < 1) requestAnimationFrame(animate);
      else top.mesh.visible = true;
    };
    requestAnimationFrame(animate);
  }

  private resolveOnlineHostTurn(hostAction: TurnAction, guestAction: TurnAction, turnId: number) {
    // [ONLINE HOOK] Host is the only client that invokes random turn arbitration.
    this.battleRuntime?.recordTurn(hostAction, guestAction);
    const rawResolution = this.turnArbitrator.executeTurnResolution(
      hostAction,
      guestAction,
      this.player,
      this.enemy,
      turnId,
      this.turnRandomSources(),
    );
    const resolution = rawResolution.kind === 'clash_qte'
      ? this.createOnlineSafeClashResolution(rawResolution)
      : rawResolution;
    if (resolution.kind === 'clash_qte') {
      this.network.sendClashQteStart(turnId, resolution);
      this.startTurnPresentation(resolution);
      return;
    }
    const snapshot = this.projectOnlineSnapshot(resolution);
    this.pendingOnlineSnapshot = snapshot;
    this.network.sendTurnResolved(turnId, resolution, snapshot);
    this.startTurnPresentation(resolution);
  }

  private createOnlineSafeClashResolution(resolution: TurnResolution): TurnResolution {
    return {
      ...resolution,
      kind: 'same_attack_cancel',
      winner: null,
      loser: null,
      playerVisual: 'clash',
      enemyVisual: 'clash',
      safeNoSpinDamage: true,
      damageResults: [],
      log: '真人联机同级技能相持：按空格蓄力已禁用，双方能量即时抵消。',
    };
  }

  private beginOnlineGuestTurn(hostResolution: TurnResolution, snapshot: TurnSnapshot) {
    if (hostResolution.kind === 'clash_qte' || this.turnState === 'clash_qte') {
      this.completeOnlineGuestClashQte(mirrorTurnResolutionForGuest(hostResolution), snapshot);
      return;
    }
    this.pendingOnlineSnapshot = snapshot;
    this.startTurnPresentation(mirrorTurnResolutionForGuest(hostResolution));
  }

  private beginOnlineGuestClashQte(hostResolution: TurnResolution) {
    this.pendingOnlineSnapshot = null;
    this.startTurnPresentation(mirrorTurnResolutionForGuest(hostResolution));
  }

  private projectOnlineSnapshot(resolution: TurnResolution): TurnSnapshot {
    const snapshot: TurnSnapshot = {
      host: this.snapshotTop(this.player),
      guest: this.snapshotTop(this.enemy),
    };
    snapshot.host.spirit = THREE.MathUtils.clamp(snapshot.host.spirit + resolution.playerSpiritDelta, 0, this.player.maxSpirit);
    snapshot.guest.spirit = THREE.MathUtils.clamp(snapshot.guest.spirit + resolution.enemySpiritDelta, 0, this.enemy.maxSpirit);

    for (const damage of resolution.damageResults ?? []) {
      if (damage.didMiss || damage.finalDamage <= 0) continue;
      const target = damage.defender === 'player' ? snapshot.host : snapshot.guest;
      target.integrity = Math.max(0, target.integrity - damage.finalDamage);
      target.lockStability = Math.max(0, target.lockStability - damage.lockDamage);
      target.alive = target.integrity > 0;
    }
    if (resolution.firePenetration) {
      const target = resolution.playerVisual === 'defense' ? snapshot.host : resolution.enemyVisual === 'defense' ? snapshot.guest : null;
      if (target) {
        target.integrity = Math.max(0, target.integrity - 10);
        target.alive = target.integrity > 0;
      }
    }
    return snapshot;
  }

  private snapshotTop(top: TopEntity) {
    return {
      integrity: top.integrity,
      spirit: top.spirit,
      lockStability: top.lockStability,
      spin: top.spin,
      alive: top.alive,
    };
  }

  private applyOnlineSnapshot(snapshot: TurnSnapshot) {
    const localRole = this.network.role;
    if (!localRole) return;
    const local = localRole === 'host' ? snapshot.host : snapshot.guest;
    const remote = localRole === 'host' ? snapshot.guest : snapshot.host;
    this.applyActorSnapshot(this.player, local);
    this.applyActorSnapshot(this.enemy, remote);
    this.pendingOnlineSnapshot = null;
  }

  private applyActorSnapshot(top: TopEntity, snapshot: TurnSnapshot['host']) {
    top.integrity = THREE.MathUtils.clamp(snapshot.integrity, 0, top.stats.maxIntegrity);
    top.spirit = THREE.MathUtils.clamp(snapshot.spirit, 0, top.maxSpirit);
    top.lockStability = THREE.MathUtils.clamp(snapshot.lockStability, 0, 100);
    top.spin = THREE.MathUtils.clamp(snapshot.spin, 0, top.stats.maxSpin * 2);
    top.alive = snapshot.alive && top.integrity > 0;
  }

  private receiveOnlineClashQteScore(turnId: number, score: number, final: boolean) {
    const qte = this.activeClashQte;
    if (!qte || this.turnState !== 'clash_qte' || turnId !== this.onlineTurnId || !Number.isFinite(score)) return;
    qte.enemyScore = THREE.MathUtils.clamp(score, 0, 9999);
    if (final) qte.remoteFinalReceived = true;
    this.clashQtePanel.update({
      visible: true,
      playerScore: qte.playerScore,
      enemyScore: qte.enemyScore,
      timeLeft: qte.phase === 'intro' ? qte.introLeft : qte.timeLeft,
      duration: qte.phase === 'intro' ? 1 : qte.duration,
      tier: qte.tier,
      resultText: qte.phase === 'intro' ? '进入相持阶段' : undefined,
    });
  }

  private completeOnlineGuestClashQte(resolution: TurnResolution, snapshot: TurnSnapshot) {
    const qte = this.activeClashQte;
    this.activeClashQte = null;
    this.activeTurnResolution = resolution;
    this.clashQtePanel.update({
      visible: true,
      playerScore: qte?.playerScore ?? 50,
      enemyScore: qte?.enemyScore ?? 50,
      timeLeft: 0,
      duration: qte?.duration ?? 5,
      tier: this.getClashQteTier(resolution),
      resultText: this.getClashQteResultText(resolution),
    });
    this.hud.combatLog.log(resolution.log, resolution.playerVisual === 'attack' ? '#7ef0ff' : resolution.enemyVisual === 'attack' ? '#ff7b5b' : '#ffd166');
    this.applyTurnVisuals(resolution);
    this.applyOnlineSnapshot(snapshot);
    this.turnState = 'resolving';
    this.turnTimer = this.player.integrity <= 0 || this.enemy.integrity <= 0 ? 0.5 : 1.5;
    this.turnPanel.showResolution(resolution);
    window.setTimeout(() => this.clashQtePanel.hide(), 650);
  }

  private projectOnlineQteSnapshot(resolution: TurnResolution): TurnSnapshot {
    const snapshot: TurnSnapshot = {
      host: this.snapshotTop(this.player),
      guest: this.snapshotTop(this.enemy),
    };

    for (const damage of resolution.damageResults ?? []) {
      if (damage.didMiss || damage.finalDamage <= 0) continue;
      const target = damage.defender === 'player' ? snapshot.host : snapshot.guest;
      target.integrity = Math.max(0, target.integrity - damage.finalDamage);
      target.lockStability = Math.max(0, target.lockStability - damage.lockDamage);
      target.alive = target.integrity > 0;
    }

    return snapshot;
  }

  private updateCustomizerLinks() {
    const currentNssLoadout = this.nssRequest.kind === 'ready'
      ? this.nssRequest.loadout
      : (this.progression.latestNssLoadout ?? DEFAULT_NSS_LOADOUT);

    const customizerUrl = this.nssLoadouts.customizerLink(
      currentNssLoadout,
      new URL(window.location.href),
      import.meta.env.VITE_CUSTOMIZER_URL
    );

    this.menu.setNssCustomizerUrl(customizerUrl);
  }

  private showMenu() {
    this.phase = 'menu';
    this.audio.startMenuAmbience();
    this.arena.setTheme(this.menu.stageSelect.value);
    this.menu.setMeta(this.getMenuMetaCn());
    this.menu.setTrophyShelf(this.getTrophyTitle(), this.getTrophyBody());
    this.updateCustomizerLinks();
    this.menu.root.style.display = 'grid';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.results.root.style.display = 'none';
    this.hud.setVisible(false);
    this.turnPanel.root.style.display = 'none';
    this.activeClashQte = null;
    this.clashQtePanel.hide();
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
    if (this.nssRequest.kind === 'ready') {
      const stats = buildNssBattleStats(this.nssRequest.loadout, this.progression.upgrades);
      this.garage.showNssMode(
        this.nssRequest.loadout,
        stats,
        this.nssLoadouts.customizerLink(this.nssRequest.loadout, new URL(window.location.href), import.meta.env.VITE_CUSTOMIZER_URL),
      );
      this.garage.setProgress(this.nssRequest.notice ?? `NSS model ready · ${this.nssRequest.source}`);
    } else {
      this.garage.showLegacyMode();
      this.refreshGarageStats();
    }
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'grid';
    this.hud.setVisible(false);
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
    this.hud.setVisible(false);
  }

  private showResult(result: BattleResult) {
    if ((this.battleMode === 'challenge' || this.battleMode === 'campaign') && this.currentResult) return;
    if (!this.battleOutcomeSummary && this.battleRuntime?.inputLog) {
      const topState = (top: TopEntity) => ({
        spin: top.spin,
        integrity: top.integrity,
        stamina: top.stamina,
        spirit: top.spirit,
        burst: top.burst,
        tilt: top.tilt,
        alive: top.alive,
      });
      this.battleOutcomeSummary = createBattleOutcomeSummary({
        seed: this.battleRuntime.context.seed,
        winner: result.winner,
        kind: result.kind,
        turnCount: this.battleRuntime.inputLog.turns.length,
        tickCount: this.battleRuntime.tickCount,
        player: topState(this.player),
        enemy: topState(this.enemy),
      });
    }
    this.phase = 'result';
    this.currentResult = result;
    this.activeClashQte = null;
    this.clashQtePanel.hide();
    const progressionBefore = this.captureProgressionSnapshot();
    if (this.battleMode === 'challenge') {
      this.resultRewardText = '好友幽灵挑战不修改单人成长、金币或零件解锁。';
      this.retryLabel = '返回挑战中心';
      this.lastCoinReward = 0;
      this.featuredUnlockPart = null;
      this.championMoment = null;
      if (!this.challengeEnvelope && this.battleRuntime?.inputLog && this.battleOutcomeSummary) {
        this.challengeEnvelope = {
          submissionId: crypto.randomUUID(),
          inputLog: structuredClone(this.battleRuntime.inputLog) as unknown as Record<string, unknown>,
          outcome: structuredClone(this.battleOutcomeSummary) as unknown as Record<string, unknown>,
        };
      }
    } else if (this.battleMode === 'campaign') {
      this.resultRewardText = '战役结果等待服务器确认，不在本地提前发放奖励。';
      this.retryLabel = '返回战役档案';
      this.lastCoinReward = 0;
      this.featuredUnlockPart = null;
      this.championMoment = null;
    } else if (this.battleMode === 'online') {
      this.resultRewardText = '\u771f\u4eba\u8054\u673a MVP \u4e0d\u8ba1\u5165\u5355\u673a\u6210\u957f\u4e0e\u91d1\u5e01\u3002';
      this.retryLabel = '\u8fd4\u56de\u4e3b\u83dc\u5355';
      this.lastCoinReward = 0;
      this.featuredUnlockPart = null;
      this.championMoment = null;
    } else {
      this.applyProgressionResult(result);
    }
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
        modeLabel: this.battleMode === 'campaign' ? '八人战役' : this.battleMode === 'challenge' ? '好友幽灵挑战' : this.battleMode === 'online' ? '\u771f\u4eba\u8054\u673a' : this.getModeLabelCn(),
        enemyName: this.battleMode === 'campaign' ? this.campaign?.opponentName : this.battleMode === 'challenge' ? this.challenge?.enemy.displayName : this.battleMode === 'online' ? this.onlineOpponentName : this.enemyPreset.name,
        growthTitle: '本局成长变化',
        growthLines: this.battleMode === 'campaign'
          ? ['等待服务端确认战役进度与奖励']
          : this.battleMode === 'challenge'
          ? ['挑战结果独立保存，不修改单人成长数据']
          : this.battleMode === 'online' ? ['\u8054\u673a\u5bf9\u6218\u4e0d\u4fee\u6539\u5355\u673a\u6210\u957f\u6570\u636e'] : this.getResultGrowthLines(progressionBefore),
        affinitySummary: this.affinityDamageSummary,
        challengeDetails: this.challenge ? {
          rule: this.challenge.mode === 'fair' ? '公平模式 · 冻结零升级' : '全力模式 · 冻结强化',
          playerName: this.challenge.player.displayName,
          enemyName: this.challenge.enemy.displayName,
          playerLoadout: nssCombinationId(this.challenge.player.loadout.combination),
          enemyLoadout: nssCombinationId(this.challenge.enemy.loadout.combination),
          submissionStatus: '正在安全保存…',
        } : undefined,
        campaignDetails: this.campaign ? {
          opponentName: this.campaign.opponentName,
          stars: '等待服务器确认',
          objectives: `策略：${campaignObjectiveText(this.campaign.objectives.strategy)} · 表现：${campaignObjectiveText(this.campaign.objectives.performance)}`,
          rewards: '确认前不提前发放',
          submissionStatus: '正在安全保存…',
        } : undefined,
      },
    );
    this.menu.root.style.display = 'none';
    this.garage.root.style.display = 'none';
    this.shop.root.style.display = 'none';
    this.forgePanel.root.style.display = 'none';
    this.hud.setVisible(false);
    this.turnPanel.update({ visible: false, resolving: false });
    this.floatingTexts.clear();
    this.results.root.style.display = 'grid';
    if (this.battleMode === 'challenge') void this.submitChallengeResult();
    if (this.battleMode === 'campaign') {
      this.results.setCampaignSettlement({
        opponentName: this.campaign!.opponentName,
        stars: '等待服务器确认',
        objectives: '战斗摘要已冻结',
        rewards: '确认前不提前发放',
        submissionStatus: '正在提交结果…',
      }, false, false);
      void this.submitCampaignResult();
    }
  }

  private async submitCampaignResult() {
    if (!this.campaign || !this.battleOutcomeSummary || this.campaignSettlement) return;
    this.campaignSettlement = await this.campaign.controller.settle(this.battleOutcomeSummary);
    if (this.campaignSettlement.status === 'submitted') {
      const settlement = this.campaignSettlement.settlement;
      this.progression = progressionFromServer(settlement.progression.snapshot, settlement.progression.coins);
      saveProgression(this.progression, { trackWallet: false });
      commitProgressionSync(this.campaign.controller.identity, {
        status: 'synced', progression: settlement.progression, acknowledgedEventIds: [],
      });
      const opponent = settlement.progress.opponents.find(item => item.id === settlement.opponentId);
      const stars = opponent?.starsMask ?? 0;
      const totalCoins = settlement.rewards.battleCoins + settlement.rewards.firstWinCoins
        + settlement.rewards.starCoins + settlement.rewards.partConversionCoins;
      const rewardParts = [totalCoins ? `${totalCoins} 金币` : '无新增金币'];
      if (settlement.rewards.partUnlocked) rewardParts.push(`解锁 ${settlement.rewards.partUnlocked}`);
      if (settlement.rewards.championshipCrowns) rewardParts.push(`冠军王冠 +${settlement.rewards.championshipCrowns}`);
      const newStars = [1, 2, 4].filter(bit => settlement.newStarsMask & bit).length;
      const achieved = [
        settlement.earnedStarsMask & 1 ? '赢得战斗' : '',
        settlement.earnedStarsMask & 2 ? campaignObjectiveText(this.campaign.objectives.strategy) : '',
        settlement.earnedStarsMask & 4 ? campaignObjectiveText(this.campaign.objectives.performance) : '',
      ].filter(Boolean);
      this.campaignNextOpponentId = this.currentResult?.winner === 'player'
        && settlement.progress.nextOpponentId !== settlement.opponentId
        ? settlement.progress.nextOpponentId
        : null;
      this.results.setCampaignSettlement({
        opponentName: this.campaign.opponentName,
        stars: `${[1, 2, 4].filter(bit => stars & bit).length} / 3${newStars ? ` · 新增 ${newStars}` : ' · 无新增'}`,
        objectives: achieved.length ? achieved.join(' · ') : '本场未达成星级目标',
        rewards: rewardParts.join(' · '),
        submissionStatus: '结果已确认',
      }, Boolean(this.campaignNextOpponentId), true);
      return;
    }
    const status = {
      pending: '网络中断，结果已保存在本机并等待确认',
      storage_failed: '浏览器无法安全保存，结果未发送',
      conflict: '结果与已提交记录冲突，请返回档案处理',
    }[this.campaignSettlement.status];
    this.results.setCampaignSettlement({
      opponentName: this.campaign.opponentName,
      stars: '尚未确认',
      objectives: '确认前不更新目标进度',
      rewards: '确认前不提前发放',
      submissionStatus: status,
    }, false, false);
  }

  private async submitChallengeResult() {
    if (!this.challenge || !this.challengeEnvelope || this.challengeSettlement === 'submitting' || this.challengeSettlement === 'submitted') return;
    this.challengeSettlement = 'submitting';
    this.results.setChallengeSettlement('正在提交结果…', '重新提交', true);
    this.challengeSettlement = await settleChallengeResult(
      this.challenge.identity.playerId,
      this.challenge.id,
      this.challengeEnvelope,
      (id, envelope) => this.challenge!.client.submitResult(id, envelope),
    );
    if (this.challengeSettlement === 'submitted') {
      this.results.setChallengeSettlement('结果已确认', '发起回挑战');
    } else if (this.challengeSettlement === 'storage_failed') {
      this.results.setChallengeSettlement('浏览器无法安全保存，结果未发送', '重新提交');
    } else {
      this.results.setChallengeSettlement('网络中断，结果已保存在本机', '重新提交');
    }
  }

  private async createChallengeRematch() {
    if (!this.challenge || this.challengeSettlement !== 'submitted') return;
    this.results.setChallengeSettlement('正在创建回挑战…', '发起回挑战', true);
    try {
      const offer = await this.challenge.client.createRematch(this.challenge.id);
      window.location.assign(`/challenge/${offer.id}`);
    } catch {
      this.results.setChallengeSettlement('回挑战创建失败，请重试', '发起回挑战');
    }
  }

  private startBattle(seed?: BattleSeed, preserveReplay = false) {
    if (this.battleMode === 'single' && this.nssRequest.kind === 'ready' && this.nssBattlePreparing) return;
    if (!preserveReplay) this.battleReplay = null;
    const battleSeed = seed ?? createBattleSeed();
    if (this.battleMode === 'single' && this.nssRequest.kind === 'ready') {
      this.nssBattlePreparing = true;
      this.garage.setProgress('Loading the approved NSS battle model…');
      this.progression = setNssLoadout(this.progression, this.nssRequest.loadout);
      saveProgression(this.progression);
      void this.nssLoadouts.createTop('player', this.nssRequest.loadout, this.progression.upgrades)
        .then(player => {
          this.nssBattlePreparing = false;
          this.startBattleWithPlayer(player, battleSeed);
        })
        .catch(error => {
          this.nssBattlePreparing = false;
          this.showGarage();
          this.garage.setProgress(`NSS model load failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      return;
    }
    this.startBattleWithPlayer(new TopEntity('player', this.build, this.progression.upgrades, this.progression.partUpgrades), battleSeed);
  }

  private async startChallengeBattle() {
    if (!this.challenge) return;
    this.battleMode = 'challenge';
    this.mode = 'quick';
    this.arena.setTheme(this.challenge.arena);
    this.menu.stageSelect.value = this.challenge.arena;
    this.garage.stageSelect.value = this.challenge.arena;
    try {
      const [player, enemy] = await this.nssLoadouts.createChallengePair(this.challenge.player, this.challenge.enemy);
      this.startBattleWithPlayer(player, this.challenge.seed, enemy);
    } catch (error) {
      this.loop.stop();
      this.mount.innerHTML = '';
      const state = document.createElement('main'); state.className = 'portal-state';
      const title = document.createElement('h1'); title.textContent = '幽灵装配加载失败';
      const detail = document.createElement('p'); detail.textContent = error instanceof Error ? error.message : '无法读取挑战模型。';
      const back = document.createElement('a'); back.href = '/challenges/'; back.textContent = '返回挑战中心';
      state.append(title, detail, back); this.mount.append(state);
    }
  }

  private async startCampaignBattle() {
    if (!this.campaign) return;
    this.battleMode = 'campaign';
    this.mode = 'quick';
    this.arena.setTheme(this.campaign.arena);
    this.menu.stageSelect.value = this.campaign.arena;
    this.garage.stageSelect.value = this.campaign.arena;
    try {
      const [player, enemy] = await this.nssLoadouts.createChallengePair(this.campaign.player, this.campaign.enemy);
      this.startBattleWithPlayer(player, this.campaign.seed, enemy);
    } catch (error) {
      this.loop.stop();
      this.mount.innerHTML = '';
      const state = document.createElement('main'); state.className = 'portal-state';
      const title = document.createElement('h1'); title.textContent = '战役装配加载失败';
      const detail = document.createElement('p'); detail.textContent = error instanceof Error ? error.message : '无法读取战役模型。';
      const back = document.createElement('a'); back.href = `/campaign/?opponent=${encodeURIComponent(this.campaign.opponentId)}`; back.textContent = '返回战役档案';
      state.append(title, detail, back); this.mount.append(state);
    }
  }

  private startBattleWithPlayer(nextPlayer: TopEntity, seed = createBattleSeed(), nextEnemy?: TopEntity) {
    this.battleRuntime = new BattleRuntime(seed);
    this.battleOutcomeSummary = null;
    this.playerVoiceVolume = 0;
    this.aiVoiceVolume = 0;
    this.voiceBoostActive = false;
    this.audio.stopMenuAmbience();
    this.floatingTexts.clear();
    this.affinityDamageSummary = createEmptyAffinityDamageSummary();
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
    this.activeClashQte = null;
    this.clashQtePanel.hide();
    this.playerDefensiveSuccesses = 0;
    this.enemyDefensiveSuccesses = 0;
    this.voiceBoostOverlay.resetState();
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
    this.hud.setVisible(true);
    this.turnPanel.root.style.display = '';

    this.scene.remove(this.player.mesh, this.enemy.mesh);
    this.player.detachNssVisual();
    this.player = nextPlayer;
    this.playerTeam = [this.player];
    this.activePlayerIndex = 0;
    this.enemy = nextEnemy ?? new TopEntity('enemy', this.enemyPreset.build);
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
    this.showAffinityMatchup();
    this.logHarmonyResonance('我方', this.player.stats.affinity);
    this.logHarmonyResonance('敌方', this.enemy.stats.affinity);
    this.hud.combatLog.log('新一轮战斗开始', '#0ff');
  }

  private showAffinityMatchup() {
    const playerAffinity = this.player.stats.affinity;
    const enemyAffinity = this.enemy.stats.affinity;
    renderAffinityMatchup(this.affinityVersus, createAffinityMatchupPresentation(
      playerAffinity,
      enemyAffinity,
      resolveBattleAffinityRelation(playerAffinity, enemyAffinity),
      resolveBattleAffinityRelation(enemyAffinity, playerAffinity),
    ));
    this.affinityVersus.classList.remove('affinity-versus--hidden', 'affinity-versus--active');
    void this.affinityVersus.offsetWidth;
    this.affinityVersus.classList.add('affinity-versus--active');
    if (this.affinityVersusTimer !== null) window.clearTimeout(this.affinityVersusTimer);
    this.affinityVersusTimer = window.setTimeout(() => {
      this.affinityVersus.classList.add('affinity-versus--hidden');
      this.affinityVersus.classList.remove('affinity-versus--active');
      this.affinityVersusTimer = null;
    }, 2200);
  }

  private logHarmonyResonance(sideLabel: string, profile: TopEntity['stats']['affinity']) {
    if (profile.resonance.kind !== 'harmony') return;
    this.hud.combatLog.log(`${sideLabel}：${getResonanceLabel(profile)}`, '#7ef0ff');
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
    if (this.phase !== 'battle' || this.paused || this.turnState !== 'awaiting' || this.currentResult || this.rules.timeLeft <= 0) return;
    if (!this.canAffordTurnAction(this.player, playerAction)) {
      this.hud.combatLog.log('Spirit 不足，无法执行该行动。', '#ff7b5b');
      return;
    }

    this.turnState = 'cutin';
    this.turnPanel.setPanelLock(true);

    if (this.battleMode === 'online') {
      // [ONLINE HOOK] Online clients submit once and wait for the Host result.
      this.network.sendTurnAction(this.onlineTurnId, playerAction);
      return;
    }

    const proceed = () => this.resolveSinglePlayerTurn(playerAction);

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

  private resolveSinglePlayerTurn(playerAction: TurnAction, replayTurn?: BattleTurnInputV1) {
    const aiAction = this.pickAiTurnAction();
    if (replayTurn) this.battleReplay?.cursor.assertAiAction(this.turnIndex, aiAction);
    this.battleRuntime?.recordTurn(playerAction, aiAction);
    const resolution = this.turnArbitrator.executeTurnResolution(
      playerAction,
      aiAction,
      this.player,
      this.enemy,
      this.turnIndex,
      this.turnRandomSources(),
    );
    this.startTurnPresentation(resolution);
  }

  private submitReplayTurnIfReady() {
    const replay = this.battleReplay;
    if (!replay || this.turnState !== 'awaiting' || this.turnIndex > replay.log.turns.length) return;
    const turn = replay.cursor.turnAtDecisionTick(this.turnIndex, this.battleRuntime?.decisionTicks ?? 0);
    if (!turn) return;
    this.turnState = 'cutin';
    this.turnPanel.setPanelLock(true);
    this.resolveSinglePlayerTurn(turn.playerAction, turn);
  }

  private startTurnPresentation(resolution: TurnResolution) {
    this.activeTurnResolution = resolution;
    this.turnState = 'approaching';
    this.turnTimer = 0;

    const dist = this.player.position.distanceTo(this.enemy.position);
    if (dist > 0) {
      const dirP = this.enemy.position.clone().sub(this.player.position).normalize();
      const dirE = this.player.position.clone().sub(this.enemy.position).normalize();
      const chargeSpeed = Math.max(15, dist * 1.5);
      this.player.velocity.copy(dirP).multiplyScalar(chargeSpeed);
      this.enemy.velocity.copy(dirE).multiplyScalar(chargeSpeed);
    }
    this.timeScale = 1;
    this.rules.reset();
    this.player.dashCooldown = 0;
    this.player.stunTimer = 0;
    this.enemy.dashCooldown = 0;
    this.enemy.stunTimer = 0;
    this.physics.dashPlayer(this.player, new THREE.Vector3(this.enemy.position.x, 0, this.enemy.position.y));
    this.physics.dashPlayer(this.enemy, new THREE.Vector3(this.player.position.x, 0, this.player.position.y));
  }

  private landTurnResolution() {
    const resolution = this.activeTurnResolution;
    if (!resolution || this.turnState !== 'approaching') return false;
    this.applyTurnSpiritDelta(resolution);
    this.applyTurnVisuals(resolution);
    if (this.battleMode === 'online' && this.pendingOnlineSnapshot) {
      this.applyOnlineSnapshot(this.pendingOnlineSnapshot);
    }
    this.hud.combatLog.log(resolution.log, resolution.winner === 'player' ? '#ffd166' : resolution.winner === 'enemy' ? '#ff7b5b' : '#7ef0ff');
    if (resolution.log && resolution.log !== 'Ready') {
      this.voiceBoostOverlay.triggerFloatingBanner(resolution.log);
    }
    if (resolution.kind === 'clash_qte') {
      this.beginClashQte(resolution);
      return true;
    }
    this.turnState = 'resolving';
    this.turnTimer = this.player.integrity <= 0 || this.enemy.integrity <= 0 ? 0.5 : 2;
    this.turnPanel.showResolution(resolution);
    return true;
  }

  private beginClashQte(resolution: TurnResolution) {
    const tier = this.getClashQteTier(resolution);
    const duration = 5;
    const introDuration = 1;
    const enemyPressure = this.battleMode === 'online' ? 0 : 15 + tier * 3 + this.enemy.stats.attack * 0.7;
    this.activeClashQte = {
      resolution,
      tier,
      phase: 'intro',
      introLeft: introDuration,
      playerScore: 50,
      enemyScore: 50,
      timeLeft: duration,
      duration,
      aiRate: createAiQteRate(enemyPressure, this.battleRandom().ai),
      tapPower: 7 + tier * 1.4 + this.player.stats.attack * 0.18,
      lastScoreSentAt: 0,
      finalScoreSent: false,
      remoteFinalReceived: false,
      finishGraceLeft: 3.5,
    };
    this.turnState = 'clash_qte';
    this.turnTimer = introDuration;
    this.turnPanel.update({ visible: false, resolving: true, lastLog: resolution.log });
    this.clashQtePanel.update({
      visible: true,
      playerScore: 50,
      enemyScore: 50,
      timeLeft: introDuration,
      duration: introDuration,
      tier,
      resultText: '进入相持阶段',
    });
    this.sendOnlineClashQteScore(false, true);
    const midX = (this.player.position.x + this.enemy.position.x) * 0.5;
    const midZ = (this.player.position.y + this.enemy.position.y) * 0.5;
    this.floatingTexts.spawn('进入相持阶段', midX, 1.05, midZ, '#ffd166', true);
    this.hud.combatLog.log('同级技能触发相持：准备阶段结束后开始按 SPACE 蓄力！', '#ffd166');
  }

  private getClashQteTier(resolution: TurnResolution): SkillTier {
    if (resolution.playerAction.kind === 'attack') {
      return ELEMENT_ATTACKS[resolution.playerAction.skillId].tier;
    }
    if (resolution.aiAction.kind === 'attack') {
      return ELEMENT_ATTACKS[resolution.aiAction.skillId].tier;
    }
    return 1;
  }

  private updateClashQte(dt: number, simulationDt: number) {
    const qte = this.activeClashQte;
    if (!qte) return;

    if (qte.phase === 'intro') {
      qte.introLeft = Math.max(0, qte.introLeft - dt);
      this.turnTimer = qte.introLeft;
      this.physics.update(this.player, this.enemy, simulationDt, true);
      this.clashQtePanel.update({
        visible: true,
        playerScore: qte.playerScore,
        enemyScore: qte.enemyScore,
        timeLeft: qte.introLeft,
        duration: 1,
        tier: qte.tier,
        resultText: '进入相持阶段',
      });
      if (qte.introLeft <= 0) {
        qte.phase = 'active';
        qte.timeLeft = qte.duration;
        this.turnTimer = qte.duration;
        this.sendOnlineClashQteScore(false, true);
        this.clashQtePanel.update({
          visible: true,
          playerScore: qte.playerScore,
          enemyScore: qte.enemyScore,
          timeLeft: qte.timeLeft,
          duration: qte.duration,
          tier: qte.tier,
          resultText: undefined,
        });
        this.hud.combatLog.log('开始蓄力：狂按 SPACE！', '#7ef0ff');
      }
      return;
    }

    qte.timeLeft = Math.max(0, qte.timeLeft - dt);
    this.turnTimer = qte.timeLeft;

    if (this.battleMode === 'online') {
      this.sendOnlineClashQteScore(false);
    } else {
      qte.enemyScore = advanceAiQteScore({
        score: qte.enemyScore,
        aiRate: qte.aiRate,
        tier: qte.tier,
        tickCount: this.battleRuntime?.tickCount ?? 0,
      }, this.battleRandom().ai);
    }
    this.physics.update(this.player, this.enemy, simulationDt, true);

    const midX = (this.player.position.x + this.enemy.position.x) * 0.5;
    const midZ = (this.player.position.y + this.enemy.position.y) * 0.5;
    this.sparks.emit(midX, midZ, 0.45 + qte.tier * 0.08);
    this.sparks.emitAbsorb(this.player.position.x, this.player.position.y, 1.0 + qte.tier * 0.2);
    this.sparks.emitAbsorb(this.enemy.position.x, this.enemy.position.y, 1.0 + qte.tier * 0.2);
    if (Math.random() < 0.25) {
      this.lightning.strike(midX, 0.4, midZ, 0xffaa00);
      this.shockwave.trigger(midX, 0.35, midZ, 0.6, 0xffdd00);
    }

    this.clashQtePanel.update({
      visible: true,
      playerScore: qte.playerScore,
      enemyScore: qte.enemyScore,
      timeLeft: qte.timeLeft,
      duration: qte.duration,
      tier: qte.tier,
    });

    if (qte.timeLeft <= 0) {
      if (this.battleMode === 'online' && this.network.role === 'guest') {
        this.sendOnlineClashQteScore(true, true);
        this.clashQtePanel.update({
          visible: true,
          playerScore: qte.playerScore,
          enemyScore: qte.enemyScore,
          timeLeft: 0,
          duration: qte.duration,
          tier: qte.tier,
          resultText: '等待 Host 结算...',
        });
        return;
      }
      if (this.battleMode === 'online' && this.network.role === 'host') {
        this.sendOnlineClashQteScore(true, true);
        if (!qte.remoteFinalReceived && qte.finishGraceLeft > 0) {
          qte.finishGraceLeft = Math.max(0, qte.finishGraceLeft - dt);
          this.clashQtePanel.update({
            visible: true,
            playerScore: qte.playerScore,
            enemyScore: qte.enemyScore,
            timeLeft: qte.finishGraceLeft,
            duration: 3.5,
            tier: qte.tier,
            resultText: '等待对手蓄力结果...',
          });
          return;
        }
      }
      const replayQte = this.battleReplay?.log.turns[this.turnIndex - 1]?.qteFinal;
      if (replayQte) {
        qte.playerScore = replayQte.playerScore;
        qte.enemyScore = replayQte.enemyScore;
      }
      this.finishClashQte();
    }
  }

  private registerClashQteTap(event: KeyboardEvent) {
    const qte = this.activeClashQte;
    if (!qte || this.turnState !== 'clash_qte' || event.repeat) return false;

    event.preventDefault();
    if (qte.phase !== 'active') return true;
    qte.playerScore += qte.tapPower;
    this.sendOnlineClashQteScore(false, true);
    this.sparks.emit(this.player.position.x, this.player.position.y, 0.8 + qte.tier * 0.1);
    this.audio.clash(0.25);
    this.clashQtePanel.update({
      visible: true,
      playerScore: qte.playerScore,
      enemyScore: qte.enemyScore,
      timeLeft: qte.timeLeft,
      duration: qte.duration,
      tier: qte.tier,
    });
    return true;
  }

  private sendOnlineClashQteScore(final: boolean, force = false) {
    const qte = this.activeClashQte;
    if (!qte || this.battleMode !== 'online') return;
    if (final && qte.finalScoreSent) return;
    if (!force && !final && this.time - qte.lastScoreSentAt < 0.1) return;
    qte.lastScoreSentAt = this.time;
    if (final) qte.finalScoreSent = true;
    this.network.sendClashQteScore(this.onlineTurnId, qte.playerScore, final);
  }

  private finishClashQte() {
    const qte = this.activeClashQte;
    if (!qte) return;

    if (this.battleRuntime?.inputLog?.turns[this.turnIndex - 1]) {
      this.battleRuntime.recordQteFinal(this.turnIndex, qte.playerScore, qte.enemyScore);
    }

    const diff = qte.playerScore - qte.enemyScore;
    const margin = Math.abs(diff);
    const damageResults: DamageResult[] = [];
    let playerVisual: TurnResolution['playerVisual'] = 'clash';
    let enemyVisual: TurnResolution['enemyVisual'] = 'clash';
    let resultText = '平分秋色';
    let log = '真三国无双拔河平局：同级能量互相抵消。';

    if (margin < 1) {
      damageResults.push(
        calculateTurnDamage({ attacker: this.enemy, defender: this.player, skillTier: qte.tier, isCounter: false, isClash: true, isBlockOrMiss: false, contextMultiplier: 0.5, random: this.battleRandom().combat }),
        calculateTurnDamage({ attacker: this.player, defender: this.enemy, skillTier: qte.tier, isCounter: false, isClash: true, isBlockOrMiss: false, contextMultiplier: 0.5, random: this.battleRandom().combat }),
      );
    } else {
      const playerWins = diff > 0;
      const attacker = playerWins ? this.player : this.enemy;
      const defender = playerWins ? this.enemy : this.player;
      damageResults.push(
        calculateTurnDamage({
          attacker,
          defender,
          skillTier: qte.tier,
          isCounter: false,
          isClash: true,
          isBlockOrMiss: false,
          contextMultiplier: 0.5,
          random: this.battleRandom().combat,
        }),
      );
      playerVisual = playerWins ? 'attack' : 'hit';
      enemyVisual = playerWins ? 'hit' : 'attack';
      resultText = playerWins ? 'PLAYER WINS' : 'AI WINS';
      const winnerLabel = playerWins ? '玩家' : 'AI';
      const loserLabel = playerWins ? 'AI' : '玩家';
      log = `${winnerLabel} 拔河胜利：T${qte.tier} 同级技能压制，${loserLabel} 承受 ${damageResults[0]?.finalDamage ?? 0} 点冲击伤害。`;
    }

    const finalResolution: TurnResolution = {
      ...qte.resolution,
      playerVisual,
      enemyVisual,
      winner: null,
      loser: null,
      log,
      damageResults,
    };

    if (this.battleMode === 'online' && this.network.role === 'host') {
      this.sendOnlineClashQteScore(true, true);
      const snapshot = this.projectOnlineQteSnapshot(finalResolution);
      this.network.sendTurnResolved(this.onlineTurnId, finalResolution, snapshot);
    }

    this.activeClashQte = null;
    this.activeTurnResolution = finalResolution;
    this.clashQtePanel.update({
      visible: true,
      playerScore: qte.playerScore,
      enemyScore: qte.enemyScore,
      timeLeft: 0,
      duration: qte.duration,
      tier: qte.tier,
      resultText,
    });
    this.hud.combatLog.log(log, diff >= 0 ? '#7ef0ff' : '#ff7b5b');
    this.applyTurnVisuals(finalResolution);
    this.turnState = 'resolving';
    this.turnTimer = this.player.integrity <= 0 || this.enemy.integrity <= 0 ? 0.5 : 1.5;
    this.turnPanel.showResolution(finalResolution);
    window.setTimeout(() => this.clashQtePanel.hide(), 650);
  }

  private getClashQteResultText(resolution: TurnResolution) {
    if (resolution.playerVisual === 'attack') return 'PLAYER WINS';
    if (resolution.enemyVisual === 'attack') return 'RIVAL WINS';
    return '平分秋色';
  }

  private canAffordTurnAction(top: TopEntity, action: TurnAction) {
    if (action.kind === 'attack') return top.spirit >= ELEMENT_ATTACKS[action.skillId].spiritCost;
    if (action.kind === 'defense' || action.kind === 'evade') {
        return top.spirit >= 1 || top.freeDefensiveMoves > 0;
    }
    return true;
  }

  private pickAiTurnAction(): TurnAction {
    return chooseAiTurnAction({
      playerHasStealthEffect: this.player.stats.hasStealthEffect === true,
      enemySpirit: this.enemy.spirit,
      enemyTacticalMode: this.enemy.tacticalMode,
      enemyFreeDefensiveMoves: this.enemy.freeDefensiveMoves,
      campaignAiProfileId: this.campaign?.aiProfileId,
    }, this.battleRandom().ai);
  }

  private applyTurnSpiritDelta(resolution: TurnResolution) {
    const pOld = this.player.spirit;
    const eOld = this.enemy.spirit;
    this.spirit.set(this.player, this.player.spirit + resolution.playerSpiritDelta);
    this.spirit.set(this.enemy, this.enemy.spirit + resolution.enemySpiritDelta);
    
    if ((resolution.playerAction.kind === 'evade' || resolution.playerAction.kind === 'defense') && pOld < 1) {
      const penalty = arenaManager.getTheme() === 'absolute_zero' ? 2 : 1;
      this.player.freeDefensiveMoves = Math.max(0, this.player.freeDefensiveMoves - penalty);
    }
    if ((resolution.aiAction.kind === 'evade' || resolution.aiAction.kind === 'defense') && eOld < 1) {
      const penalty = arenaManager.getTheme() === 'absolute_zero' ? 2 : 1;
      this.enemy.freeDefensiveMoves = Math.max(0, this.enemy.freeDefensiveMoves - penalty);
    }
  }

  private applyTurnVisuals(resolution: TurnResolution) {
    this.applyTopTurnVisual(this.player, this.enemy, resolution.playerVisual, resolution.playerAction);
    this.applyTopTurnVisual(this.enemy, this.player, resolution.enemyVisual, resolution.aiAction);

    if (resolution.playerVisual === 'defense' || resolution.playerVisual === 'evade') {
      this.playerDefensiveSuccesses++;
    }
    if (resolution.enemyVisual === 'defense' || resolution.enemyVisual === 'evade') {
      this.enemyDefensiveSuccesses++;
    }

    const isStandoff = resolution.kind === 'standoff' || resolution.kind === 'clash_qte';

    // Condition trigger: Floating text banner flies across screen, starting 3.0s countdown window immediately
    if (this.playerDefensiveSuccesses >= 1 && this.enemyDefensiveSuccesses >= 1 && isStandoff) {
      this.hud.combatLog.log('🎙️【音爆爆发】3秒限时爆发蓄能开启！对着麦克风喊叫/按 V 键爆发！', '#ff00ff');
      this.battleRuntime?.startVoiceBoost();
      this.voiceBoostOverlay.startBoostCountdown(3.0);
      this.voiceBoostOverlay.triggerFloatingBanner(
        '🎙️【音爆爆发】3秒限时爆发开启！大声叫喊或长按 V 键蓄能！'
      );
    }

    // Trigger AI shouting on attacks or standoff
    if (resolution.aiAction.kind === 'attack' || isStandoff) {
      this.battleRuntime?.aiVoice.triggerShout(2.0);
    }

    const midX = (this.player.position.x + this.enemy.position.x) / 2;
    const midZ = (this.player.position.y + this.enemy.position.y) / 2;
    const shockColor = resolution.winner ? 0xff7b5b : 0x7ef0ff;
    const highestLandedTier = Math.max(1, ...(resolution.damageResults ?? [])
      .filter((damage) => !damage.didMiss && damage.finalDamage > 0)
      .map((damage) => damage.skillTier));
    const tierImpact = 1 + (highestLandedTier - 1) * 0.15;
    this.shockwave.trigger(midX, 0.45, midZ, (resolution.safeNoSpinDamage ? 1.1 : 1.55) * tierImpact, shockColor);
    this.sparks.emit(midX, midZ, (resolution.safeNoSpinDamage ? 1.2 : 2.0) * tierImpact);
    this.audio.clash((resolution.winner ? 1.4 : 0.85) * tierImpact);
    this.rig.kickShake((resolution.winner ? 1.2 : 0.65) * tierImpact);

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

    if (resolution.damageResults) {
      for (const dmg of resolution.damageResults) {
        const target = dmg.defender === 'player' ? this.player : this.enemy;

        if (dmg.didMiss) {
          const blocked = dmg.tags.includes('block');
          this.floatingTexts.spawn(
            blocked ? 'BLOCK' : 'MISS',
            target.position.x,
            0.78,
            target.position.y,
            blocked ? '#7ef0ff' : '#aaaaaa',
          );
          this.hud.combatLog.log(blocked ? `${dmg.defender === 'player' ? '玩家' : '敌方'} BLOCK` : `${dmg.defender === 'player' ? '玩家' : '敌方'} MISS`, blocked ? '#7ef0ff' : '#aaaaaa');
        } else {
          applyDamageResult(target, dmg);
          this.affinityDamageSummary = accumulateAffinityDamageSummary(this.affinityDamageSummary, dmg);
          const label = dmg.defender === 'player' ? '玩家' : '敌方';
          const isCounter = dmg.tags.includes('counter');
          const impactTag = isCounter ? ' 反击!' : dmg.didCrit ? ' 暴击!' : '';
          const remoteCritPresentation = this.battleMode === 'online' && this.network.role === 'guest' && dmg.didCrit;
          const affinityDetail = formatAffinityDamageLog(dmg);
          if (!remoteCritPresentation) {
            const damagePrefix = isCounter ? `COUNTER T${dmg.skillTier}` : dmg.didCrit ? `CRIT T${dmg.skillTier}` : `T${dmg.skillTier}`;
            this.floatingTexts.spawn(
              `${damagePrefix} -${dmg.finalDamage}`,
              target.position.x,
              0.78,
              target.position.y,
              isCounter ? '#ff9f1c' : dmg.didCrit ? '#ff4d3d' : (dmg.defender === 'player' ? '#ff6b5f' : '#ffd166'),
              isCounter || dmg.didCrit || dmg.skillTier >= 4,
            );
            this.hud.combatLog.log(`${label} T${dmg.skillTier} -${dmg.finalDamage} HP${impactTag}${dmg.armorReduced > 0 ? ` (${dmg.armorReduced} 减伤)` : ''}`, isCounter ? '#ff9f1c' : dmg.didCrit ? '#ff3300' : (dmg.defender === 'player' ? '#ff7b5b' : '#ffffff'));
          }
          if (affinityDetail && !remoteCritPresentation) {
            this.hud.combatLog.log(affinityDetail, dmg.affinityRelation === 'advantage' ? '#ffd166' : '#c6a7ff');
          }
          if (dmg.didCrit && this.battleMode === 'online' && this.network.role === 'host') {
            const targetRole: OnlineRole = dmg.defender === 'player' ? 'host' : 'guest';
            this.network.sendCritTriggered(
              this.onlineTurnId,
              oppositeRole(targetRole),
              targetRole,
              dmg.finalDamage,
              dmg.skillTier,
              { x: target.position.x, z: target.position.y },
            );
          }
        }
      }
    }

    if (this.player.integrity <= 0 || this.enemy.integrity <= 0) {
      const loserTop = this.player.integrity <= 0 ? this.player : this.enemy;
      const winnerTop = loserTop === this.player ? this.enemy : this.player;
      if (!resolution.loser) {
        loserTop.addBurst(100);
        loserTop.setEliminated();
        this.events.emit('burst', { winner: winnerTop.side, loser: loserTop.side });
        this.audio.finish(winnerTop.side === 'player');
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
      const attack = ELEMENT_ATTACKS[action.skillId];
      this.skillManager.applyElementSkillVisual(top, target, action.skillId, attack.visualSchool);
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

  private isChargeTurnResolving() {
    const resolution = this.activeTurnResolution;
    return this.turnState === 'resolving'
      && (resolution?.playerVisual === 'charge' || resolution?.enemyVisual === 'charge');
  }

  private emitTurnChargeFeedback() {
    const resolution = this.activeTurnResolution;
    if (!resolution || this.turnChargeFeedbackEmitted) return;
    this.turnChargeFeedbackEmitted = true;
    this.sparks.clear();

    if (resolution.playerVisual === 'charge') {
      this.shockwave.trigger(this.player.position.x, 0.08, this.player.position.y, 0.55, 0xffdd66);
    }
    if (resolution.enemyVisual === 'charge') {
      this.shockwave.trigger(this.enemy.position.x, 0.08, this.enemy.position.y, 0.55, 0xffdd66);
    }
  }

  private completeTurnResolution() {
    const resolution = this.activeTurnResolution;
    if (!resolution) return;

    if (this.player.integrity <= 0 || this.enemy.integrity <= 0) {
      const winnerSide: 'player' | 'enemy' = this.player.integrity <= 0 ? 'enemy' : 'player';
      const loserSide: 'player' | 'enemy' = this.player.integrity <= 0 ? 'player' : 'enemy';
      this.showTurnResult({ ...resolution, winner: winnerSide, loser: loserSide });
      return;
    }

    if (resolution.winner) {
      this.showTurnResult(resolution);
      return;
    }

    this.turnIndex += 1;
    this.activeTurnResolution = null;
    this.activeClashQte = null;
    this.clashQtePanel.hide();
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
      freeDefensiveMoves: this.player.freeDefensiveMoves,
      turnIndex: this.turnIndex,
      lastLog: resolution.log,
    });
    if (this.battleMode === 'online' && this.network.role === 'host') {
      // [ONLINE HOOK] Server starts the next authoritative action window.
      this.network.openTurn(this.onlineTurnId + 1);
    }
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
    this.logHarmonyResonance('我方属性变更', this.player.stats.affinity);
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
      ? `\u5f53\u524d\u76ee\u6807\uff1a${nextEnemy.name}\uff08${nextEnemy.crown}\uff09\u3002\u8d62\u4e0b\u4e00\u573a\u5373\u53ef\u89e3\u9501 ${nextUnlock.name}\u3002${upgradeSummary}\u3002`
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.bloom.resize(width, height);
  }

  private onPointerDown() {
    if (this.paused) return;
    if (this.phase === 'launch' && this.battleMode !== 'online') {
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
    if (this.paused || this.phase !== 'launch' || this.battleMode === 'online') return;
    this.charging = true;
  }

  private onTouchLaunchEnd() {
    if (this.paused || this.phase !== 'launch' || !this.charging || this.battleMode === 'online') return;
    this.charging = false;
    this.doLaunch();
  }

  private nudgeLaunchAngle(delta: number) {
    if (this.phase !== 'launch' || this.paused || this.battleMode === 'online') return;
    this.launchAngleDeg = THREE.MathUtils.clamp(this.launchAngleDeg + delta, -35, 35);
  }

  private togglePause() {
    if (this.battleMode === 'online') return;
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

    if (this.turnState === 'clash_qte' && event.code === 'Space') {
      if (this.registerClashQteTap(event)) return;
    }

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
      if (this.battleMode === 'online') return;
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
      if (this.battleMode === 'online') {
        this.playOnlineSubstitution(this.player, '\u63a5\u529b\u5207\u6362');
        this.network.sendSubstitution({ x: this.player.position.x, z: this.player.position.y });
      } else {
        this.executeTagSubstitution();
      }
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
      if (lowerKey === 'f') this.submitTurnAction({ kind: 'light_reflect' });
      if (lowerKey === 'r') this.submitTurnAction({ kind: 'heavy_reflect' });
      if (lowerKey === 'v') {
        this.vKeyHeld = true;
        if (!this.voiceAnalyzerRequested) {
          this.voiceAnalyzerRequested = true;
          void this.audio.initVoiceAnalyzer();
        }
        return;
      }
      if (skillId || ['d', 's', 'c', 'f', 'r'].includes(lowerKey)) return;
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
    if (event.key.toLowerCase() === 'v') {
      this.vKeyHeld = false;
      return;
    }
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
    const aiLaunch = pickAiLaunch(this.battleRandom().ai);
    this.battleReplay?.cursor.assertAiLaunch(aiLaunch.power, aiLaunch.angleDeg);
    const launch = this.battleReplay?.log.launch ?? {
      playerPower: this.launchCharge,
      playerAngleDeg: this.launchAngleDeg,
      enemyPower: aiLaunch.power,
      enemyAngleDeg: aiLaunch.angleDeg,
    };
    this.battleRuntime?.beginLaunch({ ...launch });
    const recordedLaunch = this.battleRuntime?.inputLog?.launch ?? launch;
    launchTop(this.player, new THREE.Vector2(1, 0), recordedLaunch.playerPower, THREE.MathUtils.degToRad(recordedLaunch.playerAngleDeg));
    launchTop(this.enemy, new THREE.Vector2(-1, 0), recordedLaunch.enemyPower, THREE.MathUtils.degToRad(recordedLaunch.enemyAngleDeg));
    this.events.emit('launch', { side: 'player', power: this.launchCharge });
    this.events.emit('launch', { side: 'enemy', power: 0.85 });
    this.triggerLaunchFlash(this.launchCharge);
    this.rig.kickShake(0.65 + this.launchCharge * 0.45);
    this.phase = 'battle';
    this.player.velocity.set(0, 0);
    this.enemy.velocity.set(0, 0);
    this.turnState = 'awaiting';
    this.turnTimer = 0;
    this.activeClashQte = null;
    this.clashQtePanel.hide();
    this.turnPanel.update({
      visible: true,
      resolving: false,
      spirit: this.player.spirit,
      maxSpirit: this.player.maxSpirit,
      freeDefensiveMoves: this.player.freeDefensiveMoves,
      turnIndex: this.turnIndex,
      lastLog: '选择行动：进攻展开元素技能，或使用回避、防守、蓄能。',
    });
    this.submitReplayTurnIfReady();
  }

  private doOnlineLaunch(config: LaunchConfig) {
    const isHost = this.network.role === 'host';
    const localX = isHost ? config.hostX : config.guestX;
    const remoteX = isHost ? config.guestX : config.hostX;
    this.player.reset(localX, config.z);
    this.enemy.reset(remoteX, config.z);
    launchTop(this.player, new THREE.Vector2(isHost ? 1 : -1, 0), isHost ? config.hostPower : config.guestPower, 0);
    launchTop(this.enemy, new THREE.Vector2(isHost ? -1 : 1, 0), isHost ? config.guestPower : config.hostPower, 0);
    this.battleRuntime?.beginLaunch({
      playerPower: isHost ? config.hostPower : config.guestPower,
      playerAngleDeg: 0,
      enemyPower: isHost ? config.guestPower : config.hostPower,
      enemyAngleDeg: 0,
    });
    this.events.emit('launch', { side: 'player', power: isHost ? config.hostPower : config.guestPower });
    this.events.emit('launch', { side: 'enemy', power: isHost ? config.guestPower : config.hostPower });
    this.triggerLaunchFlash(0.82);
    this.phase = 'battle';
    this.player.velocity.set(0, 0);
    this.enemy.velocity.set(0, 0);
    this.turnState = this.onlineTurnId > 0 ? 'awaiting' : 'cutin';
    this.activeClashQte = null;
    this.clashQtePanel.hide();
    this.turnPanel.setPanelLock(this.onlineTurnId <= 0);
    this.onlineStartAt = null;
    this.onlineLaunchConfig = null;
  }

  private updateBattleTick(input: BattleTickInput) {
    this.playerVoiceVolume = input.playerVolume;
    this.aiVoiceVolume = input.aiVolume;
    this.voiceBoostActive = input.voiceBoostActive;

    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - input.dt);
      return;
    }

    const simulationDt = input.dt * this.timeScale;
    if (input.voiceBoostActive) {
      if (input.playerVolume > 0.35) {
        this.player.spin = Math.min(this.player.stats.maxSpin * 1.5, this.player.spin + input.playerVolume * 450 * simulationDt);
        this.player.spirit = Math.min(100, this.player.spirit + input.playerVolume * 35 * simulationDt);
      }
      if (input.aiVolume > 0.35) {
        this.enemy.spin = Math.min(this.enemy.stats.maxSpin * 1.5, this.enemy.spin + input.aiVolume * 400 * simulationDt);
        this.enemy.spirit = Math.min(100, this.enemy.spirit + input.aiVolume * 30 * simulationDt);
      }
    }

    const random = this.battleRandom();
    this.skillManager.updateSimulation(this.player, input.dt, this.enemy, random.physics);
    this.skillManager.updateSimulation(this.enemy, input.dt, this.player, random.physics);

    if (this.turnState === 'awaiting') {
      this.rules.timeLeft = Math.max(0, this.rules.timeLeft - input.dt);
      if (this.rules.timeLeft <= 0 && !this.currentResult) {
        this.rules.timeLeft = 0;
        this.player.spin = Math.max(0, this.player.spin - this.player.stats.maxSpin * 0.4 * input.dt);
        if (this.player.spin <= 0) {
          this.player.alive = false;
          this.showResult({ winner: 'enemy', loser: 'player', kind: 'timeout', label: '瓒呮椂鍒よ礋' });
        }
      }
    }

    if (this.turnState === 'approaching') {
      this.turnTimer += input.dt;
      this.physics.update(this.player, this.enemy, simulationDt, true);
      if (this.physics.checkClashProximity(this.player, this.enemy) || this.turnTimer > 1.5) this.landTurnResolution();
    } else if (this.turnState === 'resolving') {
      this.turnTimer = Math.max(0, this.turnTimer - input.dt);
      this.physics.update(this.player, this.enemy, simulationDt, true);
      if (this.turnTimer <= 0) this.completeTurnResolution();
    } else if (this.turnState === 'clash_qte') {
      this.updateClashQte(input.dt, simulationDt);
    } else {
      this.player.velocity.multiplyScalar(0.9);
      this.enemy.velocity.multiplyScalar(0.9);
    }

    this.processTagSubstitution();
    this.processBackgroundCharging(simulationDt);
    clearTransientFlags(this.player);
    clearTransientFlags(this.enemy);
    this.submitReplayTurnIfReady();
  }

  private update(dt: number) {
    this.time += dt;
    const edgeDanger = Math.max(this.player.position.length() / 8.6, this.enemy.position.length() / 8.6);
    this.arena.setDangerLevel(this.phase === 'battle' ? Math.max(0, (edgeDanger - 0.58) / 0.24) : 0);
    if (this.paused) {
      this.player.syncMesh(this.time, this.energy.get('player'), dt);
      this.enemy.syncMesh(this.time, this.energy.get('enemy'), dt);
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
        enemyName: this.battleMode === 'online' ? this.onlineOpponentName : this.enemyPreset.name,
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
        playerAttributes: this.player.stats.attributes,
        enemyAttributes: this.enemy.stats.attributes,
        playerAffinity: this.player.stats.affinity,
        enemyAffinity: this.enemy.stats.affinity,
      });
      this.exposeDiagnostics();
      clearTransientFlags(this.player);
      clearTransientFlags(this.enemy);
      this.bloom.composer.render();
      return;
    }

    const rawMic = this.audio.getVoiceVolumeLevel();
    const playerVoiceByte = this.qaVoiceSample
      ?? encodePlayerVoiceFrame(this.vKeyHeld ? 0.95 : rawMic);
    if (this.phase === 'battle' && this.battleRuntime?.inputLog) {
      this.battleRuntime.advance(
        dt,
        this.battleReplay
          ? tickIndex => this.battleReplay!.cursor.playerVoiceAtTick(tickIndex)
          : playerVoiceByte,
        this.turnState === 'awaiting',
        input => {
          this.updateBattleTick(input);
          return this.phase === 'battle';
        },
      );
    }
    this.voiceBoostOverlay.update(
      this.playerVoiceVolume,
      this.aiVoiceVolume,
      dt,
      this.phase === 'battle',
      this.battleRuntime?.voiceBoostSecondsRemaining,
    );
    if (this.voiceBoostActive && this.playerVoiceVolume > 0.35) {
      this.shockwave.trigger(this.player.position.x, 0.4, this.player.position.y, 0.8 + this.playerVoiceVolume, 0xffaa00);
      this.sparks.emit(this.player.position.x, this.player.position.y, this.playerVoiceVolume * 1.5);
      this.rig.kickShake(0.08 * this.playerVoiceVolume);
    }
    if (this.voiceBoostActive && this.aiVoiceVolume > 0.35) {
      this.shockwave.trigger(this.enemy.position.x, 0.4, this.enemy.position.y, 0.8 + this.aiVoiceVolume, 0xff5500);
      this.sparks.emit(this.enemy.position.x, this.enemy.position.y, this.aiVoiceVolume * 1.5);
    }
    this.skillManager.updateVisual(this.player, dt, this.enemy);
    this.skillManager.updateVisual(this.enemy, dt, this.player);

    if (this.phase === 'launch') {
      if (this.battleMode === 'online' && this.onlineStartAt && this.onlineLaunchConfig) {
        this.countdown = Math.max(0, (this.onlineStartAt - performance.now()) / 1000);
        if (performance.now() >= this.onlineStartAt) this.doOnlineLaunch(this.onlineLaunchConfig);
      } else {
        if (this.charging) {
          this.launchCharge = Math.min(1, this.launchCharge + dt * 0.45);
          // Continuous energy gathering particle swirl during launch charge!
          this.sparks.emitAbsorb(-6, 0, 0.8 + this.launchCharge * 1.5);
          if (Math.random() < 0.35) {
            this.lightning.strike(-6, 0.35, 0, 0x00ffff);
            this.shockwave.trigger(-6, 0.3, 0, 0.4 + this.launchCharge * 0.5, 0x00ffff);
          }
        }
        this.countdown = Math.max(0, this.countdown - dt);
        if (this.countdown <= 0 && !this.charging && this.launchCharge <= 0.1) {
          this.launchCharge = 0.72;
          this.doLaunch();
        }
      }
    }

    if (this.phase === 'battle') {
      document.body.classList.toggle('vignette-active', this.turnState === 'resolving' || this.turnState === 'clash_qte');

      if (this.turnState === 'resolving') {
        this.emitTurnChargeFeedback();
      } else {
        this.turnChargeFeedbackEmitted = false;
      }

      this.turnPanel.update({
        visible: (this.turnState === 'awaiting' && this.rules.timeLeft > 0) || this.turnState === 'resolving',
        resolving: this.turnState === 'resolving',
        spirit: this.player.spirit,
        maxSpirit: this.player.maxSpirit,
        freeDefensiveMoves: this.player.freeDefensiveMoves,
        turnIndex: this.turnIndex,
      });

      this.energy.set('player', this.player.spirit / 10);
      this.energy.set('enemy', this.enemy.spirit / 10);
    }

    if (this.battleMode === 'online' && this.phase === 'battle') {
      // [ONLINE HOOK] Send only the newest local state at a fixed 20Hz cadence.
      this.network.update(dt, () => ({
        x: this.player.position.x,
        z: this.player.position.y,
        vx: this.player.velocity.x,
        vz: this.player.velocity.y,
        spin: this.player.spin,
        hp: this.player.integrity,
        alive: this.player.alive,
      }));
    }

    this.player.syncMesh(this.time, this.energy.get('player'), dt);
    this.enemy.syncMesh(this.time, this.energy.get('enemy'), dt);
    this.player.updateEffects(dt);
    this.enemy.updateEffects(dt);
    this.sparks.update(dt);
    this.lightning.update(dt);
    this.shockwave.update(dt);
    this.floatingTexts.update(dt);
    this.trails.update(dt, this.player, this.enemy, this.lightning, this.shockwave);

    // 閳光偓閳光偓 Dynamic Visual FX 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓
    const totalEnergy = this.energy.get('player') + this.energy.get('enemy');
    const normalBloom = 0.65 + (totalEnergy / 20) * 1.2;
    const bloomStrength = arenaManager.getTheme() === 'absolute_zero'
      ? Math.min(normalBloom * 0.42, 0.75)
      : normalBloom;
    this.bloom.setBloomStrength(bloomStrength);
    
    // Smoothly apply RGB shift / glitch when timeScale is reduced (bullet time)
    const bulletTimeDepth = 1.0 - this.timeScale;
    this.bloom.setDistortion(bulletTimeDepth * 1.5 + (this.hitStop > 0 ? 0.5 : 0));
    // 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

    this.energyRings.update(this.player, this.enemy, this.time, this.energy.get('player'));
    this.arena.update(dt, this.time);
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
      enemyName: this.battleMode === 'online' ? this.onlineOpponentName : this.enemyPreset.name,
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
      playerAttributes: this.player.stats.attributes,
      enemyAttributes: this.enemy.stats.attributes,
      playerAffinity: this.player.stats.affinity,
      enemyAffinity: this.enemy.stats.affinity,
    });
    if (this.camDebugEnabled) {
      this.renderCameraDebug();
    }
    this.exposeDiagnostics();
    clearTransientFlags(this.player);
    clearTransientFlags(this.enemy);
    this.bloom.composer.render();
  }

  private startQaBattleWithSeed(seed: string) {
    this.startBattle(parseBattleSeed(seed));
  }

  private setQaVoiceSample(value: number | null) {
    if (value === null) {
      this.qaVoiceSample = null;
      return;
    }
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError('QA voice sample must be an integer byte or null.');
    }
    this.qaVoiceSample = value;
  }

  private getQaBattleInputLog() {
    const log = this.battleRuntime?.inputLog;
    return log ? structuredClone(log) : null;
  }

  private startQaBattleReplay(input: BattleInputLogV1) {
    const log = structuredClone(input);
    validateBattleInputLog(log);
    this.battleReplay = { log, cursor: new BattleReplayCursor(log) };
    this.startBattle(log.seed, true);
    this.launchCharge = log.launch.playerPower;
    this.launchAngleDeg = log.launch.playerAngleDeg;
    this.doLaunch();
  }

  private getQaBattleOutcomeSummary() {
    return this.battleOutcomeSummary
      ? stringifyBattleOutcomeSummary(this.battleOutcomeSummary)
      : null;
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
      online: {
        battleMode: this.battleMode,
        turnId: this.onlineTurnId,
        turnDeadline: this.onlineTurnDeadline,
        ...this.network.getDiagnostics(),
      },
      progression: {
        ladderIndex: this.progression.ladderIndex,
        bestLadder: this.progression.bestLadder,
        championshipCount: this.progression.championshipCount,
        coins: this.progression.coins,
        unlockedParts: [...this.progression.unlockedSet],
      },
      player: {
        spin: this.player.spin,
        visualRotation: this.player.getVisualRotationAngles(),
        visualSpinRatio: this.player.getVisualSpinRatio(),
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
        visualRotation: this.enemy.getVisualRotationAngles(),
        visualSpinRatio: this.enemy.getVisualSpinRatio(),
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
        qte: this.activeClashQte
          ? {
              phase: this.activeClashQte.phase,
              tier: this.activeClashQte.tier,
              playerScore: Number(this.activeClashQte.playerScore.toFixed(1)),
              enemyScore: Number(this.activeClashQte.enemyScore.toFixed(1)),
              timeLeft: Number((this.activeClashQte.phase === 'intro' ? this.activeClashQte.introLeft : this.activeClashQte.timeLeft).toFixed(2)),
            }
          : null,
      },
      paused: this.paused,
      affinityDamageSummary: this.affinityDamageSummary,
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
      startBattleWithSeed: (seed: string) => this.startQaBattleWithSeed(seed),
      setVoiceSample: (value: number | null) => this.setQaVoiceSample(value),
      getBattleInputLog: () => this.getQaBattleInputLog(),
      startBattleReplay: (log: BattleInputLogV1) => this.startQaBattleReplay(log),
      getBattleOutcomeSummary: () => this.getQaBattleOutcomeSummary(),
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
      forceCollisionDamage: (playerDamage = 8, enemyDamage = 12) => {
        this.physics.applyClashImpulse(this.player, this.enemy, 1.4, 1.4, playerDamage, enemyDamage);
        return {
          playerIntegrity: this.player.integrity,
          enemyIntegrity: this.enemy.integrity,
        };
      },
      setSpinTestState: (side: 'player' | 'enemy', hpRatio: number, combatSpin = 0) => {
        const target = side === 'player' ? this.player : this.enemy;
        const safeHpRatio = THREE.MathUtils.clamp(Number.isFinite(hpRatio) ? hpRatio : 0, 0, 1);
        target.integrity = target.stats.maxIntegrity * safeHpRatio;
        target.spin = THREE.MathUtils.clamp(Number.isFinite(combatSpin) ? combatSpin : 0, 0, target.stats.maxSpin);
        target.alive = safeHpRatio > 0;
        return {
          integrity: target.integrity,
          spin: target.spin,
          visualSpinRatio: target.getVisualSpinRatio(),
        };
      },
      forceResult: (winner: 'player' | 'enemy' = 'player') =>
        this.showResult({
          winner,
          loser: winner === 'player' ? 'enemy' : 'player',
          kind: 'burst finish',
          label: '爆裂终结',
        }),
      garage: () => this.showGarage(),
      menu: () => this.showMenu(),
      tacticalMode: () => this.player.tacticalMode,
      cycleTacticalMode: () => this.cyclePlayerTacticalMode(),
      castSkill: (skillId: SkillId) => this.castSkill(skillId),
      submitTurnAction: (action: TurnAction) => this.submitTurnAction(action),
      forceClashQte: (skillId: ElementAttackSkillId = 'wind_blade') => {
        this.phase = 'battle';
        this.currentResult = null;
        this.turnState = 'awaiting';
        this.spirit.set(this.player, this.player.maxSpirit);
        this.spirit.set(this.enemy, this.enemy.maxSpirit);
        const action: TurnAction = { kind: 'attack', skillId };
        const resolution = this.turnArbitrator.executeTurnResolution(
          action,
          action,
          this.player,
          this.enemy,
          this.turnIndex,
          this.turnRandomSources(),
        );
        this.startTurnPresentation(resolution);
        return resolution.kind;
      },
      qteTap: () => {
        const event = new KeyboardEvent('keydown', { code: 'Space', key: ' ' });
        return this.registerClashQteTap(event);
      },
      finishClashQte: () => {
        this.finishClashQte();
        return this.turnState;
      },
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
      sampleVisualSpin: (frameDt: number, frames: number, side: 'player' | 'enemy' = 'player') => {
        const safeDt = THREE.MathUtils.clamp(Number.isFinite(frameDt) ? frameDt : 0, 0, 1 / 20);
        const safeFrames = THREE.MathUtils.clamp(Math.floor(Number.isFinite(frames) ? frames : 0), 0, 600);
        const target = side === 'player' ? this.player : this.enemy;
        const before = target.getVisualRotationAngles();
        for (let frame = 0; frame < safeFrames; frame += 1) {
          target.syncMesh(this.time + frame * safeDt, this.energy.get(side), safeDt);
        }
        const after = target.getVisualRotationAngles();
        return {
          seconds: safeDt * safeFrames,
          visualSpinRatio: target.getVisualSpinRatio(),
          coreDelta: after.core - before.core,
          ringDelta: after.ring - before.ring,
        };
      },
      skillDamageMatrix: () => {
        const attackerStats = {
          attack: this.player.stats.attack,
          critChance: this.player.stats.critChance,
          critMultiplier: this.player.stats.critMultiplier,
        };
        const defenderStats = {
          armor: this.enemy.stats.armor,
          evasion: this.enemy.stats.evasion,
        };
        Object.assign(this.player.stats, { attack: 8, critChance: 0, critMultiplier: 2 });
        Object.assign(this.enemy.stats, { armor: 30, evasion: 0 });
        try {
          const tiers: SkillTier[] = [1, 2, 3, 4, 5];
          const calculate = (skillTier: SkillTier, options: { counter?: boolean; clash?: boolean; multiplier?: number } = {}) => calculateTurnDamage({
            attacker: this.player,
            defender: this.enemy,
            skillTier,
            isCounter: options.counter ?? false,
            isClash: options.clash ?? false,
            isBlockOrMiss: false,
            contextMultiplier: options.multiplier ?? 1,
            random: QA_HIT_RANDOM,
          });
          Object.assign(this.player.stats, { critChance: 1, critMultiplier: 3 });
          const counterCritCheck = calculateTurnDamage({
            attacker: this.player,
            defender: this.enemy,
            skillTier: 5,
            isCounter: true,
            isClash: false,
            isBlockOrMiss: false,
            random: QA_CRIT_RANDOM,
          });
          Object.assign(this.player.stats, { critChance: 0, critMultiplier: 2 });
          return {
            normal: tiers.map((tier) => calculate(tier).finalDamage),
            counter: tiers.map((tier) => calculate(tier, { counter: true }).finalDamage),
            overpower: tiers.map((tier) => calculate(tier, { multiplier: 1.15 }).finalDamage),
            clash: tiers.map((tier) => calculate(tier, { clash: true, multiplier: 0.5 }).finalDamage),
            counterCritMutualExclusion: {
              didCrit: counterCritCheck.didCrit,
              tags: counterCritCheck.tags,
              finalDamage: counterCritCheck.finalDamage,
            },
          };
        } finally {
          Object.assign(this.player.stats, attackerStats);
          Object.assign(this.enemy.stats, defenderStats);
        }
      },
      previewTierHit: (requestedTier: number, counter = false) => {
        const skillTier = THREE.MathUtils.clamp(Math.round(requestedTier), 1, 5) as SkillTier;
        const skillByTier: Record<SkillTier, ElementAttackSkillId> = {
          1: 'wind_blade',
          2: 'aqua_surge',
          3: 'lightning_bolt',
          4: 'blazing_meteor',
          5: 'phantom_clone',
        };
        const damage = calculateTurnDamage({
          attacker: this.player,
          defender: this.enemy,
          skillTier,
          isCounter: counter,
          isClash: false,
          isBlockOrMiss: false,
          random: QA_HIT_RANDOM,
        });
        this.enemy.integrity = this.enemy.stats.maxIntegrity;
        this.enemy.alive = true;
        this.applyTurnVisuals({
          kind: counter ? 'attack_catches_charge' : 'defense_fail',
          playerAction: { kind: 'attack', skillId: skillByTier[skillTier] },
          aiAction: counter ? { kind: 'charge' } : { kind: 'defense' },
          winner: null,
          loser: null,
          playerSpiritDelta: 0,
          enemySpiritDelta: 0,
          playerVisual: 'attack',
          enemyVisual: 'hit',
          safeNoSpinDamage: false,
          log: `T${skillTier} damage preview`,
          damageResults: [damage],
        });
        return damage;
      },
      sampleNetworkCadence: (seconds = 1, fps = 60) => {
        const safeSeconds = THREE.MathUtils.clamp(Number.isFinite(seconds) ? seconds : 1, 0, 10);
        const safeFps = THREE.MathUtils.clamp(Math.floor(Number.isFinite(fps) ? fps : 60), 1, 240);
        const before = this.network.getDiagnostics().sentStatePackets;
        const frames = Math.round(safeSeconds * safeFps);
        for (let frame = 0; frame < frames; frame += 1) {
          this.network.update(1 / safeFps, () => ({
            x: this.player.position.x,
            z: this.player.position.y,
            vx: this.player.velocity.x,
            vz: this.player.velocity.y,
            spin: this.player.spin,
            hp: this.player.integrity,
            alive: this.player.alive,
          }));
        }
        return this.network.getDiagnostics().sentStatePackets - before;
      },
      forceOnlineLaunch: () => {
        if (this.onlineLaunchConfig) this.doOnlineLaunch(this.onlineLaunchConfig);
        return this.phase;
      },
      landTurnResolution: () => this.landTurnResolution(),
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
