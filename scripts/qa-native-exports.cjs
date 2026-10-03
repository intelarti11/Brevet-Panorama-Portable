const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const XLSX = require('xlsx-js-style');

let browser;
(async () => {
  browser = await chromium.connectOverCDP(process.env.QA_CDP_URL || 'http://127.0.0.1:9006');
  const context = browser.contexts()[0];
  const page = context.pages().find((entry) => entry.url().includes('tauri.localhost'));
  assert.ok(page, 'Application native requise');
  const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const info = await invoke('local_info');
  assert.match(info.databasePath, /[\\/]tmp[\\/]native-test[\\/]/);
  const artifacts = path.resolve('tmp/native-exports');
  fs.mkdirSync(artifacts, { recursive: true });
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && !['tauri.localhost', 'ipc.localhost', '127.0.0.1', 'localhost'].includes(url.hostname)) {
      external.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  const reports = [];
  const navigate = async (suffix) => {
    await page.goto(`http://tauri.localhost/dashboard/${suffix}/`);
    await page.locator('main').last().waitFor();
    await page.waitForLoadState('networkidle');
  };
  for (const moduleName of ['panorama', 'brevet-blanc/panorama']) {
    await navigate(moduleName);
    const button = page.getByRole('button', { name: 'Bilan complet', exact: true });
    await button.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((entry) => entry.textContent.includes('Bilan complet') && !entry.disabled));
    for (const type of ['xlsx', 'pdf']) {
      await button.click();
      const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
      await page.getByRole('menuitem', { name: type === 'xlsx' ? 'Export Excel (.xlsx)' : 'Export PDF (.pdf)', exact: true }).click();
      const download = await downloadPromise;
      const saved = path.join(artifacts, `${moduleName.replaceAll('/', '-')}.${type}`);
      await download.saveAs(saved);
      assert.equal(await download.failure(), null);
      assert.ok(fs.statSync(saved).size > 1000);
      if (type === 'xlsx') {
        const workbook = XLSX.readFile(saved);
        assert.ok(workbook.SheetNames.length > 1);
        const text = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n');
        assert.match(text, /2027/);
        reports.push({ module: moduleName, type, sheets: workbook.SheetNames, bytes: fs.statSync(saved).size });
      } else {
        assert.equal(fs.readFileSync(saved).subarray(0, 5).toString(), '%PDF-');
        reports.push({ module: moduleName, type, bytes: fs.statSync(saved).size });
      }
    }
  }
  const routes = ['donnee', 'pluriannuel', 'brevet-blanc/donnee', 'brevet-blanc/pluriannuel', 'brevet-blanc/voir-notes', 'pix', 'pix/donnees', 'pix/profil', 'admin/cas-par-cas', 'admin/divisions', 'admin/doublons', 'remplacements', 'remplacements/import'];
  for (const route of routes) {
    await navigate(route);
    const heading = (await page.locator('main').last().innerText()).split('\n').filter(Boolean).slice(0, 4).join(' | ');
    assert.ok(heading.length > 0);
    assert.doesNotMatch(await page.locator('main').last().innerText(), /Application error|Internal Server Error|Accès refusé/);
    reports.push({ route, heading });
  }
  const backup = await invoke('local_backup');
  const baseline = JSON.parse(fs.readFileSync('tmp/native-persistence-expected.json', 'utf8'));
  try {
    await page.getByRole('textbox', { name: 'Tableau des remplacements EDT / Pronote' }).fill('Date\tJour\tDébut\tClasse\tProfesseur\tDurée\tMatière\tSalle\n05/10/2026\tlundi\t08h00\t3E TEST\tPROF FICTIF\t1h00\tMathématiques\tA01');
    await page.getByRole('button', { name: 'Analyser le texte collé' }).click();
    await page.getByRole('button', { name: 'Importer les remplacements', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Import terminé' }).first().waitFor();
    const weeks = await invoke('local_list', { collection: 'replacementWeeks' });
    assert.equal(weeks.length, 1);
    assert.equal(weeks[0].data.slots.length, 1);
    assert.equal(weeks[0].data.slots[0].absentProfessor, 'PROF FICTIF');
    reports.push({ replacementImport: 'persisted', week: weeks[0].id });
    await navigate('remplacements');
    await page.screenshot({ path: path.join(artifacts, 'remplacements.png'), fullPage: true });
  } finally {
    await invoke('local_restore', { name: path.basename(backup.path) });
    for (const [collection, records] of Object.entries(baseline)) assert.deepEqual(await invoke('local_list', { collection }), records);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({ reports, errors, external }, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  await context.unroute('**/*');
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => browser?.close());
