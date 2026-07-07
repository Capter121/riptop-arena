export class Loop {
  private last = 0;
  private raf = 0;
  private readonly tick: (dt: number) => void;

  constructor(tick: (dt: number) => void) {
    this.tick = tick;
  }

  start() {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, 0.033);
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(frame);
    };

    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
