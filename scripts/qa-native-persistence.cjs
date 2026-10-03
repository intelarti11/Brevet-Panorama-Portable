const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

let browser;
(async () => {
  browser = await chromium.connectOverCDP(process.env.QA_CDP_URL || 'http://127.0.0.1:9006');
  const page = browser.contexts()[0].pages().find((entry) => entry.url().includes('tauri.localhost'));
  assert.ok(page);
  const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const info = await invoke('local_info');
  assert.equal(path.normalize(info.dataDirectory), path.resolve('tmp/native-test-moved/data'));
  assert.ok(fs.statSync(info.databasePath).size > 0);
  const expected = JSON.parse(fs.readFileSync('tmp/native-persistence-expected.json', 'utf8'));
  for (const [collection, records] of Object.entries(expected)) assert.deepEqual(await invoke('local_list', { collection }), records);
  const backups = await invoke('local_backups');
  assert.ok(backups.length > 0);
  assert.ok(backups.every((backup) => path.dirname(backup.path) === info.backupDirectory));
  await page.goto('http://tauri.localhost/dashboard/panorama/');
  await page.getByRole('heading', { name: 'Panorama des Résultats', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  assert.match(await page.locator('main').last().innerText(), /14[,.]50?\/20/);
  await page.screenshot({ path: 'tmp/native-moved.png', fullPage: true });
  const report = { movedData: info.dataDirectory, revision: info.revision, collectionsIdentical: Object.keys(expected), backups: backups.length };
  fs.writeFileSync('tmp/native-move-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => browser?.close());
