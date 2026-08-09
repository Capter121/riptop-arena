/**
 * VoiceBoostOverlay
 * 精简、解耦的双侧音爆 UI 组件。
 * 默认隐藏；战斗条件触发后播放横向跑马灯飘字提示，随后滑入显示左侧（玩家）与右侧（AI）音电平柱。
 */
export class VoiceBoostOverlay {
  private readonly container: HTMLDivElement;
  private readonly metersWrapper: HTMLDivElement;
  private readonly badge: HTMLDivElement;
  private readonly leftSegs: HTMLDivElement[] = [];
  private readonly rightSegs: HTMLDivElement[] = [];
  private readonly leftStatus: HTMLDivElement;
  private readonly rightStatus: HTMLDivElement;
  private readonly leftVal: HTMLDivElement;
  private readonly rightVal: HTMLDivElement;

  private unlocked = false;
  private isRevealed = false;
  private boostTimer = 0;

  constructor() {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      fontFamily: "'Segoe UI', 'Microsoft YaHei', monospace",
      overflow: 'hidden',
    });

    // ── Top badge ──────────────────────────────
    this.badge = document.createElement('div');
    Object.assign(this.badge.style, {
      position: 'absolute',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(10,15,25,0.88)',
      border: '1px dashed rgba(100,116,139,0.6)',
      borderRadius: '20px',
      padding: '5px 18px',
      fontSize: '12px',
      fontWeight: '700',
      color: '#64748b',
      whiteSpace: 'nowrap',
      transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      backdropFilter: 'blur(8px)',
      opacity: '0',
    });
    this.container.appendChild(this.badge);

    // ── Meters Wrapper (Hidden initially) ─────
    this.metersWrapper = document.createElement('div');
    Object.assign(this.metersWrapper.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      transform: 'scale(0.95)',
    });
    this.container.appendChild(this.metersWrapper);

    // ── Build Dual VU meters ──────────────────
    const buildMeter = (side: 'left' | 'right', label: string, segsArr: HTMLDivElement[]) => {
      const meter = document.createElement('div');
      Object.assign(meter.style, {
        position: 'absolute',
        top: '50%',
        [side]: '14px',
        transform: 'translateY(-50%)',
        width: '60px',
        background: 'rgba(8,14,24,0.92)',
        border: '1px solid rgba(0,200,255,0.25)',
        borderRadius: '12px',
        padding: '8px 5px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '5px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
      });

      // Header
      const header = document.createElement('div');
      Object.assign(header.style, {
        fontSize: '9px',
        fontWeight: '800',
        color: side === 'left' ? '#7ef0ff' : '#ff9900',
        letterSpacing: '0.5px',
        textAlign: 'center',
      });
      header.textContent = label;
      meter.appendChild(header);

      // Status
      const status = document.createElement('div');
      Object.assign(status.style, {
        fontSize: '9px',
        fontWeight: '700',
        color: '#7ef0ff',
        background: 'rgba(0,240,255,0.12)',
        borderRadius: '4px',
        padding: '2px 4px',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        transition: 'all 0.2s ease',
      });
      status.textContent = '🎙️ 就绪';
      meter.appendChild(status);

      // Track (12 segments, bottom -> top)
      const track = document.createElement('div');
      Object.assign(track.style, {
        width: '100%',
        height: '170px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '3px',
        background: 'rgba(0,0,0,0.55)',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.08)',
        justifyContent: 'space-between',
      });

      for (let i = 12; i >= 1; i--) {
        const seg = document.createElement('div');
        Object.assign(seg.style, {
          flex: '1',
          width: '100%',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.05)',
          transition: 'background 0.06s ease, box-shadow 0.06s ease',
        });
        track.appendChild(seg);
        segsArr.push(seg);
      }
      meter.appendChild(track);

      // Value
      const val = document.createElement('div');
      Object.assign(val.style, {
        fontSize: '10px',
        fontFamily: 'monospace',
        fontWeight: '700',
        color: side === 'left' ? '#7ef0ff' : '#ffaa00',
        textAlign: 'center',
      });
      val.textContent = '0%';
      meter.appendChild(val);

      this.metersWrapper.appendChild(meter);
      return { meter, status, val };
    };

    const left = buildMeter('left', '🎙 玩家音爆', this.leftSegs);
    const right = buildMeter('right', '🤖 AI 音爆', this.rightSegs);
    this.leftStatus = left.status;
    this.rightStatus = right.status;
    this.leftVal = left.val;
    this.rightVal = right.val;

    document.body.appendChild(this.container);
  }

  /**
   * 触发战报横幅提示 (短文本横向跑马灯飞过；长文本屏幕正中央定屏显示 3 秒钟)
   */
  triggerFloatingBanner(text: string, onBannerComplete?: () => void) {
    const isLongText = text.length > 22;
    const banner = document.createElement('div');

    if (isLongText) {
      // 屏幕正中央居中显示 3 秒钟
      Object.assign(banner.style, {
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(0.88)',
        whiteSpace: 'nowrap',
        fontSize: '26px',
        fontWeight: '900',
        color: '#ffffff',
        padding: '16px 44px',
        borderRadius: '36px',
        background: 'linear-gradient(135deg, rgba(12, 18, 32, 0.96), rgba(30, 15, 38, 0.96))',
        boxShadow: '0 0 50px rgba(0, 240, 255, 0.85), inset 0 0 25px rgba(255, 255, 255, 0.35)',
        border: '2.5px solid #00f0ff',
        textShadow: '0 3px 14px rgba(0, 0, 0, 0.95), 0 0 15px #00f0ff',
        letterSpacing: '2px',
        zIndex: '2147483647',
        opacity: '0',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease',
        fontFamily: "'Space Grotesk', 'Microsoft YaHei', sans-serif",
      });
      banner.textContent = text;
      this.container.appendChild(banner);

      requestAnimationFrame(() => {
        banner.style.transform = 'translate(-50%, -50%) scale(1)';
        banner.style.opacity = '1';
      });

      setTimeout(() => {
        banner.style.transform = 'translate(-50%, -50%) scale(0.9)';
        banner.style.opacity = '0';
        setTimeout(() => {
          banner.remove();
          if (onBannerComplete) onBannerComplete();
        }, 300);
      }, 3000);
    } else {
      // 较短文本：横向跑马灯飞过屏幕
      const randomTop = 30 + (Math.random() * 18);
      Object.assign(banner.style, {
        position: 'absolute',
        top: `${randomTop}%`,
        left: '100%',
        transform: 'translateY(-50%)',
        whiteSpace: 'nowrap',
        fontSize: '28px',
        fontWeight: '900',
        color: '#ffffff',
        padding: '14px 44px',
        borderRadius: '36px',
        background: 'linear-gradient(90deg, rgba(255,50,0,0.96), rgba(255,0,110,0.96), rgba(0,210,255,0.96))',
        boxShadow: '0 0 45px rgba(255,100,0,0.95), inset 0 0 25px rgba(255,255,255,0.85)',
        border: '3px solid #ffe600',
        textShadow: '0 3px 14px rgba(0,0,0,0.95), 0 0 15px #ffe600',
        letterSpacing: '2.5px',
        zIndex: '2147483647',
        transition: 'none',
        fontFamily: "'Space Grotesk', 'Microsoft YaHei', sans-serif",
      });
      banner.textContent = text;
      this.container.appendChild(banner);

      const startTime = performance.now();
      const duration = 4000;

      const animateBanner = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const currentLeft = 105 - progress * 210;
        banner.style.left = `${currentLeft}%`;

        if (progress < 1) {
          requestAnimationFrame(animateBanner);
        } else {
          banner.remove();
          if (onBannerComplete) onBannerComplete();
        }
      };

      requestAnimationFrame(animateBanner);
    }
  }

  /**
   * 启动/重置音爆 3 秒爆发倒计时窗口
   */
  startBoostCountdown(duration = 3.0) {
    this.boostTimer = duration;
    this.revealMeters();
  }

  /**
   * 倒计时期间平滑显示左右音条
   */
  private revealMeters() {
    this.unlocked = true;
    this.isRevealed = true;
    this.metersWrapper.style.opacity = '1';
    this.metersWrapper.style.transform = 'scale(1)';
    this.badge.style.opacity = '1';
  }

  private updateSegs(segs: HTMLDivElement[], vol: number, isAi = false) {
    const activeCount = Math.round(vol * 12);
    const isBoosting = vol > 0.35;

    segs.forEach((seg, idx) => {
      const segNum = 12 - idx; // 12 down to 1
      const active = segNum <= activeCount;
      if (active) {
        if (isBoosting) {
          seg.style.background = segNum >= 10 ? '#ff0055' : segNum >= 7 ? '#ffaa00' : isAi ? '#ff6600' : '#00ffaa';
          seg.style.boxShadow = `0 0 8px ${segNum >= 10 ? 'rgba(255,0,85,0.9)' : segNum >= 7 ? 'rgba(255,170,0,0.9)' : 'rgba(0,255,170,0.7)'}`;
        } else {
          seg.style.background = segNum >= 10 ? '#ff3366' : segNum >= 7 ? '#ffcc00' : isAi ? '#ff9900' : '#00f0ff';
          seg.style.boxShadow = `0 0 6px ${segNum >= 10 ? 'rgba(255,51,102,0.7)' : segNum >= 7 ? 'rgba(255,204,0,0.7)' : 'rgba(0,240,255,0.5)'}`;
        }
      } else {
        seg.style.background = 'rgba(255,255,255,0.05)';
        seg.style.boxShadow = 'none';
      }
    });
  }

  /**
   * 逐帧更新双侧分贝与 3.0s 倒计时状态
   */
  update(playerVolume: number, aiVolume: number, dt: number, inBattle: boolean, remainingSeconds?: number) {
    if (remainingSeconds !== undefined) this.boostTimer = Math.max(0, remainingSeconds);
    // 若不在战斗中或倒计时归零，立即关闭音爆 UI 与加成状态！
    if (!inBattle || this.boostTimer <= 0) {
      if (this.unlocked || this.isRevealed) {
        this.resetState();
      }
      return;
    }

    // 倒计时减扣
    if (remainingSeconds === undefined) this.boostTimer = Math.max(0, this.boostTimer - dt);
    if (this.boostTimer <= 0) {
      // 3.0 秒窗口到期，关闭音爆 Overlay！
      this.resetState();
      return;
    }

    const pVol = Math.max(0, Math.min(1, playerVolume));
    const aVol = Math.max(0, Math.min(1, aiVolume));
    const pBoosting = pVol > 0.35;
    const aBoosting = aVol > 0.35;

    // Badge 倒计时与爆气状态显示
    const timeStr = this.boostTimer.toFixed(1);
    if (pBoosting || aBoosting) {
      Object.assign(this.badge.style, {
        background: 'linear-gradient(135deg,rgba(255,100,0,0.95),rgba(255,0,80,0.95))',
        border: '1px solid #ffe600',
        color: '#ffffff',
        boxShadow: '0 0 25px rgba(255,150,0,0.9)',
      });
      this.badge.textContent = `🔥 双侧音爆爆发中！⏱️ 倒计时: ${timeStr}s (持续恢复转速与斗志)`;
    } else {
      Object.assign(this.badge.style, {
        background: 'rgba(0,30,50,0.92)',
        border: '1px solid rgba(0,240,255,0.7)',
        color: '#00f0ff',
        boxShadow: '0 0 14px rgba(0,240,255,0.5)',
      });
      this.badge.textContent = `🎙️ 音爆蓄能窗口 ⏱️ 倒计时: ${timeStr}s (大声叫喊 / 长按 V 键爆发)`;
    }

    // Left Meter (Player)
    this.updateSegs(this.leftSegs, pVol, false);
    this.leftStatus.textContent = pBoosting ? '🔥 爆气!' : '🎙️ 就绪';
    this.leftStatus.style.background = pBoosting ? 'linear-gradient(135deg,#ff9900,#ff0055)' : 'rgba(0,240,255,0.15)';
    this.leftStatus.style.color = pBoosting ? '#fff' : '#7ef0ff';
    this.leftVal.textContent = `${Math.round(pVol * 100)}%`;

    // Right Meter (AI)
    this.updateSegs(this.rightSegs, aVol, true);
    this.rightStatus.textContent = aBoosting ? '🔥 爆气!' : '🤖 监听';
    this.rightStatus.style.background = aBoosting ? 'linear-gradient(135deg,#ff6600,#ff0055)' : 'rgba(255,150,0,0.15)';
    this.rightStatus.style.color = aBoosting ? '#fff' : '#ffaa00';
    this.rightVal.textContent = `${Math.round(aVol * 100)}%`;
  }

  resetState() {
    this.unlocked = false;
    this.isRevealed = false;
    this.boostTimer = 0;
    this.metersWrapper.style.opacity = '0';
    this.metersWrapper.style.transform = 'scale(0.95)';
    this.badge.style.opacity = '0';
  }

  isUnlockedAndRevealed() {
    return this.boostTimer > 0 && this.isRevealed;
  }

  destroy() {
    this.container.remove();
  }
}
