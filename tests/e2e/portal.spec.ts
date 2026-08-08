import { expect, test, type Page } from '@playwright/test';

const identity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

const identityKey = 'nss.inviteIdentity.v1';
const progressionKey = 'riptop-progression-v1';

function progressionResponse(requestBody: any, coins = requestBody.initialCoins) {
  return {
    progression: {
      schemaVersion: 1,
      revision: 1,
      coins,
      snapshot: requestBody.snapshot,
    },
    acknowledgedEventIds: requestBody.walletEvents.map((event: { eventId: string }) => event.eventId),
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/progression/sync', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(progressionResponse(body)),
    });
  });
});

async function seedIdentity(page: Page) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: identityKey, value: identity });
}

test('redeems a link invite, saves identity, and restores it after refresh', async ({ page }) => {
  let redeemCount = 0;
  let meCount = 0;
  let syncCount = 0;
  await page.route('**/api/invites/redeem', async route => {
    redeemCount += 1;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ identity }) });
  });
  await page.route('**/api/me', async route => {
    meCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
    });
  });
  await page.route('**/api/progression/sync', async route => {
    syncCount += 1;
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(progressionResponse(body, 240)),
    });
  });
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: progressionKey,
    value: {
      saveSchemaVersion: 2,
      unlockedParts: ['round', 'balanced', 'grip'],
      ladderIndex: 0,
      bestLadder: 0,
      championshipCount: 0,
      coins: 240,
      build: { attackRing: 'round', core: 'balanced', driver: 'grip' },
      upgrades: { attack: 0, defense: 0, stamina: 0 },
      partUpgrades: {},
      latestNssLoadout: null,
    },
  });

  await page.goto('/?invite=VALID01');
  await expect(page.getByLabel('昵称')).toBeVisible();
  await expect(page.getByLabel('邀请码')).toHaveCount(0);
  await expect(page.getByText('NSS 定制器')).toHaveCount(0);

  await page.getByLabel('昵称').fill('Nova');
  await page.getByRole('button', { name: '进入据点' }).click();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  await expect(page.getByText('Nova', { exact: true })).toBeVisible();
  await expect(page.getByText('进度已同步', { exact: true })).toBeVisible();
  await expect(page.getByLabel('玩家摘要')).toContainText('240');
  expect(page.url()).not.toContain('invite=');
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).toContain(identity.playerId);
  expect(await page.locator('body').innerText()).not.toContain(identity.deviceToken);
  expect(redeemCount).toBe(1);
  expect(syncCount).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  expect(redeemCount).toBe(1);
  expect(meCount).toBe(1);
  expect(syncCount).toBe(2);
});

test('shows both fields when an invite is not present in the URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('邀请码')).toBeVisible();
  await expect(page.getByLabel('昵称')).toBeVisible();
});

test('clears a rejected local identity and returns to the invite gate', async ({ page }) => {
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'INVALID_IDENTITY', message: 'Identity is invalid.' } }),
  }));

  await page.goto('/');
  await expect(page.getByLabel('邀请码')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).toBeNull();
});

test('retains identity during a temporary connection failure and retries', async ({ page }) => {
  await seedIdentity(page);
  let failing = true;
  await page.route('**/api/me', route => failing
    ? route.abort('failed')
    : route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
    }));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '重试连接' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).not.toBeNull();
  failing = false;
  await page.getByRole('button', { name: '重试连接' }).click();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
});

test('keeps authenticated play available when progression sync is offline', async ({ page }) => {
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
  }));
  await page.route('**/api/progression/sync', route => route.abort('failed'));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  await expect(page.getByText('进度待同步', { exact: true })).toBeVisible();
  await expect(page.locator('a.portal-mode--open')).toHaveCount(2);
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).not.toBeNull();
});

test('clears identity when progression sync rejects authentication', async ({ page }) => {
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
  }));
  await page.route('**/api/progression/sync', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'AUTH_INVALID', message: 'Player identity is invalid.' } }),
  }));

  await page.goto('/');
  await expect(page.getByLabel('邀请码')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).toBeNull();
});

test('restores authoritative progression after an insufficient-coins conflict', async ({ page }) => {
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
  }));
  await page.route('**/api/progression/sync', async route => {
    const requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INSUFFICIENT_COINS',
          message: 'Coin balance would become negative.',
          rejectedEventId: '11111111-1111-4111-8111-111111111111',
        },
        progression: progressionResponse(requestBody, 35).progression,
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('金币冲突已恢复', { exact: true })).toBeVisible();
  await expect(page.getByLabel('玩家摘要')).toContainText('35');
  expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), progressionKey))!).coins).toBe(35);
});

test('does not redeem when storage is blocked', async ({ page }) => {
  let redeemCount = 0;
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key.endsWith('.probe')) throw new Error('blocked');
      return original.call(this, key, value);
    };
  });
  await page.route('**/api/invites/redeem', route => {
    redeemCount += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ identity }) });
  });

  await page.goto('/?invite=VALID01');
  await page.getByLabel('昵称').fill('Nova');
  await page.getByRole('button', { name: '进入据点' }).click();
  await expect(page.getByRole('alert')).toContainText('浏览器无法保存身份');
  expect(redeemCount).toBe(0);
});

test('retries a failed identity save without redeeming twice', async ({ page }) => {
  let redeemCount = 0;
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    let shouldFail = true;
    Storage.prototype.setItem = function setItem(storageKey, value) {
      if (storageKey === key && shouldFail) {
        shouldFail = false;
        throw new Error('quota');
      }
      return original.call(this, storageKey, value);
    };
  }, identityKey);
  await page.route('**/api/invites/redeem', route => {
    redeemCount += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ identity }) });
  });

  await page.goto('/?invite=VALID01');
  await page.getByLabel('昵称').fill('Nova');
  await page.getByRole('button', { name: '进入据点' }).click();
  await expect(page.getByRole('button', { name: '重试保存' })).toBeVisible();
  await page.getByRole('button', { name: '重试保存' }).click();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  expect(redeemCount).toBe(1);
});

test('renders the authenticated player summary and six mode states', async ({ page }) => {
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
  }));

  await page.goto('/');
  await expect(page.getByText('Nova Spin System', { exact: true })).toBeVisible();
  await expect(page.getByText('本地身份已验证', { exact: true })).toBeVisible();
  await expect(page.getByLabel('玩家摘要')).toContainText('金币');
  await expect(page.getByLabel('玩家摘要')).toContainText('当前配装');

  const modes = page.getByLabel('游戏模式').locator('.portal-mode');
  await expect(modes).toHaveCount(6);
  const openModes = page.locator('a.portal-mode--open');
  await expect(openModes).toHaveCount(2);
  expect(await openModes.nth(0).getAttribute('href')).toBe('./customizer/');
  expect(await openModes.nth(1).getAttribute('href')).toBe('./arena/');

  const lockedModes = page.locator('.portal-mode--locked');
  await expect(lockedModes).toHaveCount(4);
  expect(await lockedModes.evaluateAll(entries => entries.every(entry => (
    entry.getAttribute('aria-disabled') === 'true' && entry.tagName !== 'A'
  )))).toBe(true);
  const beforeClick = page.url();
  await lockedModes.first().click();
  expect(page.url()).toBe(beforeClick);
});

test('fits the authenticated portal at 390 by 844 with touch-sized entries', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedIdentity(page);
  await page.route('**/api/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ player: { playerId: identity.playerId, displayName: identity.displayName } }),
  }));

  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const modeEntries = page.locator('.portal-mode');
  await expect(modeEntries).toHaveCount(6);
  for (const box of await modeEntries.evaluateAll(entries => entries.map(entry => entry.getBoundingClientRect()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
  }
  expect((await page.getByLabel('游戏模式').evaluate(element => getComputedStyle(element).gridTemplateColumns)).split(' '))
    .toHaveLength(1);
});
