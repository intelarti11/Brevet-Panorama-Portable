const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.QA_CDP_URL || 'http://127.0.0.1:9006');
  const context = browser.contexts()[0];
  const page = context.pages().find((candidate) => candidate.url().includes('tauri.localhost')) || context.pages()[0];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  const info = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('local_info'));
  assert.ok(info.databasePath.includes('native-test'));
  assert.ok(fs.existsSync(info.databasePath));
  await page.getByText('Édition portable', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.resolve('tmp/native-smoke.png'), fullPage: true });
  const report = { url: page.url(), title: await page.title(), info, errors };
  fs.writeFileSync('tmp/native-smoke.json', JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
