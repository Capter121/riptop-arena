export class ArenaManager {
  private currentThemeId: string = 'classic_grid';

  public setTheme(themeId: string) {
    this.currentThemeId = themeId;
  }

  public getTheme() {
    return this.currentThemeId;
  }

  /**
   * Returns the linear friction multiplier for the arena floor.
   * Modifies velocity decay (sliding).
   */
  public getFrictionMultiplier(): number {
    if (this.currentThemeId === 'absolute_zero') {
      return 0.2; // 80% less friction
    }
    return 1.0;
  }

  /**
   * Returns the angular damping multiplier for the top's spin.
   * Modifies spin HP decay over time.
   */
  public getAngularDampingMultiplier(): number {
    if (this.currentThemeId === 'absolute_zero') {
      return 0.5; // Spins twice as long
    }
    return 1.0;
  }

  /**
   * Returns whether the arena has bouncy walls.
   */
  public getEdgeBounceMultiplier(): number {
    if (this.currentThemeId === 'absolute_zero') {
      return 1.5; // 50% more bounce from edge
    }
    return 1.0;
  }
}

// Global instance
export const arenaManager = new ArenaManager();
