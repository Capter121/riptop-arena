import { expect, test } from '@playwright/test';

test('artifact isolation smoke fixture passes without loading product runtime', async () => {
  expect(1 + 1).toBe(2);
});
