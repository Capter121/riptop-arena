import { chromium } from '@playwright/test';

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:4174/',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--url') args.url = argv[++i];
    else throw new Error(`Unknown argument: ${value}`);
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto(args.url, { waitUntil: 'networkidle' });
  await page.locator('.menu .button').nth(3).click();
  await page.locator('.garage .button').nth(1).click();
  await page.waitForTimeout(250);

  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes('????')) {
    throw new Error('Shop view still contains question-mark placeholder text.');
  }

  const notice = await page.locator('.shop .garage-progress').innerText();
  if (!notice.trim()) {
    throw new Error('Shop notice is empty.');
  }

  console.log(JSON.stringify({ ok: true, noticeLength: notice.trim().length }));
} finally {
  await browser.close();
}
