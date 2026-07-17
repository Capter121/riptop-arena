import { expect, type Locator, type Page } from '@playwright/test';

type ObservationSteps = {
  observe: () => Promise<unknown>;
  select: () => Promise<unknown>;
  verify: () => Promise<unknown>;
};

export async function observeBeforeSelection({ observe, select, verify }: ObservationSteps) {
  const observation = observe();
  await Promise.all([observation, select()]);
  await verify();
}

type FocusReadoutSelection = {
  page: Page;
  option: Locator;
  readoutTestId: string;
  expectedText: string;
  readyPredicate: () => Promise<unknown>;
  taskProgress: Locator;
  expectedTaskProgress: string;
  combinationId: Locator;
  expectedCombination: Record<string, string>;
  productSnapshot: () => Promise<{ combination: Record<string, string>; combinationId: string }>;
};

export async function observeFocusReadoutDuringSelection({
  page, option, readoutTestId, expectedText, readyPredicate, taskProgress,
  expectedTaskProgress, combinationId, expectedCombination, productSnapshot,
}: FocusReadoutSelection) {
  const readout = page.getByTestId(readoutTestId);
  await observeBeforeSelection({
    observe: () => Promise.all([
      readout.waitFor({ state: 'visible', timeout: 5000 }),
      expect(readout).toHaveText(expectedText),
    ]),
    select: () => option.click(),
    verify: async () => {
      await readyPredicate();
      await expect(option).toHaveClass(/\bselected\b/);
      await expect(taskProgress).toContainText(expectedTaskProgress);
      const snapshot = await productSnapshot();
      expect(snapshot.combination).toEqual(expectedCombination);
      await expect(combinationId).toHaveText(snapshot.combinationId);
    },
  });
}
