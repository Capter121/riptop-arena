export class StableFrameBoundary {
  private awaitingCombinationId: string | null = null;

  constructor(
    private readonly onFirstFrame: (combinationId: string) => void,
    private readonly onStableFrame: (combinationId: string) => void,
  ) {}

  beforeRender(expectedCombinationId: string | null, displayedCombinationId: string) {
    if (!expectedCombinationId || expectedCombinationId !== displayedCombinationId) return;
    if (this.awaitingCombinationId === displayedCombinationId) return;
    this.awaitingCombinationId = displayedCombinationId;
    this.onFirstFrame(displayedCombinationId);
  }

  afterRender(displayedCombinationId: string) {
    if (this.awaitingCombinationId !== displayedCombinationId) return;
    this.awaitingCombinationId = null;
    this.onStableFrame(displayedCombinationId);
  }
}
