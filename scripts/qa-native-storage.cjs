const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');

(async () => {
  const browser = await chromium.connectOverCDP(process.env.QA_CDP_URL || 'http://127.0.0.1:9006');
  const context = browser.contexts()[0];
  const page = context.pages().find((entry) => entry.url().includes('tauri.localhost'));
  assert.ok(page, 'Page native Tauri requise');
  const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const info = await invoke('local_info');
  assert.match(info.databasePath, /[\\/]tmp[\\/]native-test[\\/]/, 'Base native de test uniquement');
  const names = ['BrevetBlanc', 'brevetResults', 'pixResults', 'appSettings'];
  const snapshot = async () => Object.fromEntries(await Promise.all(names.map(async (name) => [name, await invoke('local_list', { collection: name })])));
  const initial = await snapshot();
  const safetyBackup = await invoke('local_backup');
  const backupName = path.basename(safetyBackup.path);
  const initialRevision = (await invoke('local_info')).revision;
  await assert.rejects(invoke('local_commit', { operations: [
    { type: 'set', collection: 'appSettings', id: 'qa-rollback', data: { fictif: true } },
    { type: 'update', collection: 'appSettings', id: 'qa-absent', data: { invalid: true } },
  ] }));
  assert.equal((await invoke('local_info')).revision, initialRevision);
  assert.equal(await invoke('local_get', { collection: 'appSettings', id: 'qa-rollback' }), null);

  // Execute the same source facade against real Rust IPC, without a mock store.
  const bundle = buildSync({ entryPoints: ['src/lib/local/functions.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'PanoramaQA', write: false, define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;
  const devtools = await context.newCDPSession(page);
  const evaluated = await devtools.send('Runtime.evaluate', { expression: bundle });
  assert.equal(evaluated.exceptionDetails, undefined);
  const call = (name, data) => page.evaluate(({ name, data }) => PanoramaQA.httpsCallable({}, name)(data), { name, data });
  const pix = { numeroCertification: 'QA-LOCAL-2027', nom: 'FICTIF', prenom: 'Éloïse', classe: '3EME 1D', anneeCertification: '2027', nombrePix: 500, datePassageCertification: '15/06/2027', dateNaissance: '01/02/2012', statut: 'Certifié', session: 'QA' };
  await call('importPixResults', { expectedYear: '2027', students: [pix] });
  assert.equal((await invoke('local_get', { collection: 'pixResults', id: pix.numeroCertification })).data.nombrePix, 500);
  await call('setDataLockStatus', { module: 'pix', year: '2027', locked: true });
  await assert.rejects(call('importPixResults', { expectedYear: '2027', students: [{ ...pix, nombrePix: 600 }] }));
  assert.equal((await invoke('local_get', { collection: 'pixResults', id: pix.numeroCertification })).data.nombrePix, 500);
  await call('setDataLockStatus', { module: 'pix', year: '2027', locked: false });
  const renamed = await call('renameDivision', { year: '2027', oldName: '3EME 1D', newName: '3EME 2D' });
  assert.equal(renamed.data.success, true);
  assert.equal((await invoke('local_get', { collection: 'pixResults', id: pix.numeroCertification })).data.classe, '3EME 2D');
  await call('importPixResults', { expectedYear: '2027', students: [{ ...pix, nombrePix: 550 }] });
  assert.equal((await invoke('local_get', { collection: 'pixResults', id: pix.numeroCertification })).data.classe, '3EME 2D');
  const invalidBackup = 'panorama-qa-invalid.sqlite3';
  fs.writeFileSync(path.join(info.backupDirectory, invalidBackup), 'This is deliberately not a SQLite database.');
  const beforeInvalidRestore = await snapshot();
  await assert.rejects(invoke('local_restore', { name: invalidBackup }));
  assert.deepEqual(await snapshot(), beforeInvalidRestore);
  fs.unlinkSync(path.join(info.backupDirectory, invalidBackup));
  const restored = await invoke('local_restore', { name: backupName });
  assert.ok(restored.revision > initialRevision);
  assert.deepEqual(await snapshot(), initial);
  fs.writeFileSync('tmp/native-persistence-expected.json', JSON.stringify(initial));
  const report = { sqlite: info.databasePath, backup: safetyBackup.path, restoredRevision: restored.revision, checks: ['rollback atomique', 'PIX stockage reel', 'verrou PIX', 'renommage et reimport alias', 'sauvegarde invalide refusee', 'restauration identique'] };
  fs.writeFileSync('tmp/native-storage-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
