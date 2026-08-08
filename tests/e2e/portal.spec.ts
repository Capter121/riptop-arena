import { expect, test, type Page } from '@playwright/test';

const identity = {
  version: 1,
  playerId: '123e4567-e89b-42d3-a456-426614174000',
  displayName: 'Nova',
  deviceToken: 'A'.repeat(43),
};

const identityKey = 'nss.inviteIdentity.v1';

async function seedIdentity(page: Page) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: identityKey, value: identity });
}

test('redeems a link invite, saves identity, and restores it after refresh', async ({ page }) => {
  let redeemCount = 0;
  let meCount = 0;
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

  await page.goto('/?invite=VALID01');
  await expect(page.getByLabel('昵称')).toBeVisible();
  await expect(page.getByLabel('邀请码')).toHaveCount(0);
  await expect(page.getByText('NSS 定制器')).toHaveCount(0);

  await page.getByLabel('昵称').fill('Nova');
  await page.getByRole('button', { name: '进入据点' }).click();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  await expect(page.getByText('Nova', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain('invite=');
  expect(await page.evaluate(key => localStorage.getItem(key), identityKey)).toContain(identity.playerId);
  expect(await page.locator('body').innerText()).not.toContain(identity.deviceToken);
  expect(redeemCount).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { name: '私人竞技据点' })).toBeVisible();
  expect(redeemCount).toBe(1);
  expect(meCount).toBe(1);
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
