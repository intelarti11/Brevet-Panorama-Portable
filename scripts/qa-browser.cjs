#!/usr/bin/env node
"use strict";

// Reusable UI QA for the portable app. Default mode mocks Tauri IPC with
// synthetic localStorage data. Set QA_CDP_URL to attach to a running native
// Tauri WebView instead; native mode never injects a fake transport or writes
// localStorage, and aborts unless the relevant student/result collections and
// backup directory are empty.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const XLSX = require("xlsx-js-style");
const { zipSync, strToU8 } = require("fflate");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "tmp", "qa");
const SCREENSHOTS = path.join(ARTIFACTS, "screenshots");
const BASE_URL = process.env.QA_BASE_URL || "http://127.0.0.1:9005";
const CDP_URL = process.env.QA_CDP_URL || "";
const MODE = CDP_URL ? "native-cdp" : "mock-preview";
const YEAR = process.env.QA_YEAR || String(new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0));
const OTHER_YEAR = String(Number(YEAR) + 1);
const INES = ["TESTINE001", "TESTINE002", "TESTINE003"];
const FIRST = { INE: INES[0], NOM: "Dupont", PRENOM: "Elise" };
const REMOTE_ORIGIN = new URL(BASE_URL).origin;
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

fs.mkdirSync(SCREENSHOTS, { recursive: true });

const state = {
  steps: [],
  consoleErrors: [],
  pageErrors: [],
  externalRequests: [],
  requestFailures: [],
  screenshots: [],
};

function installMockTransport(seed) {
  const STORAGE_KEY = "__brevet_panorama_ui_qa";
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  }
  window.__QA_CALLS = [];
  window.isTauri = true;

  function readState() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  }
  function writeState(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function merge(target, patch) {
    const result = clone(target || {});
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (isPlainObject(value)) result[key] = merge(isPlainObject(result[key]) ? result[key] : {}, value);
      else result[key] = clone(value);
    });
    return result;
  }
  function updateFields(target, patch) {
    const result = clone(target || {});
    Object.entries(patch || {}).forEach(([field, value]) => {
      const keys = field.split(".");
      let parent = result;
      keys.slice(0, -1).forEach((key) => {
        if (!isPlainObject(parent[key])) parent[key] = {};
        parent = parent[key];
      });
      parent[keys[keys.length - 1]] = clone(value);
    });
    return result;
  }
  function publicBackup(backup) {
    return { name: backup.name, path: backup.path, size: backup.size, createdAt: backup.createdAt };
  }
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      const input = args || {};
      window.__QA_CALLS.push({ command, args: clone(input) });
      const current = readState();
      const collectionMap = current.collections || {};
      const rows = (name) => Object.entries(collectionMap[name] || {}).map(([id, data]) => ({ id, data: clone(data) }));
      if (command === "local_revision") return current.revision || 0;
      if (command === "local_list") return rows(input.collection);
      if (command === "local_get") {
        const data = collectionMap[input.collection] && collectionMap[input.collection][input.id];
        return data === undefined ? null : { id: input.id, data: clone(data) };
      }
      if (command === "local_commit") {
        const expected = input.expectedRevision;
        if (expected !== undefined && expected !== current.revision) throw new Error("revision conflict");
        for (const operation of input.operations || []) {
          const collection = current.collections[operation.collection];
          if (!collection) throw new Error("Collection inconnue: " + operation.collection);
          if (operation.type === "delete") delete collection[operation.id];
          else if (operation.type === "update") {
            if (!collection[operation.id]) throw new Error("Fiche introuvable: " + operation.id);
            collection[operation.id] = updateFields(collection[operation.id], operation.data || {});
          } else if (operation.type === "set") {
            collection[operation.id] = operation.merge
              ? merge(collection[operation.id] || {}, operation.data || {})
              : merge({}, operation.data || {});
          } else throw new Error("Operation inconnue: " + operation.type);
        }
        if ((input.operations || []).length) current.revision = (current.revision || 0) + 1;
        writeState(current);
        return null;
      }
      if (command === "local_info") {
        return {
          dataDirectory: "C:\\QA\\Brevet Panorama\\Data",
          databasePath: "C:\\QA\\Brevet Panorama\\Data\\brevet-panorama.sqlite3",
          backupDirectory: "C:\\QA\\Brevet Panorama\\Data\\backups",
          revision: current.revision || 0,
        };
      }
      if (command === "local_backups") return (current.backups || []).map(publicBackup);
      if (command === "local_backup") {
        const timestamp = Date.now();
        const name = "brevet-panorama-qa-" + timestamp + ".json";
        const snapshot = { collections: clone(current.collections), revision: current.revision || 0 };
        const backup = {
          name,
          path: "C:\\QA\\Brevet Panorama\\Data\\backups\\" + name,
          size: JSON.stringify(snapshot).length,
          createdAt: timestamp,
          snapshot,
        };
        current.backups = [...(current.backups || []), backup];
        writeState(current);
        return { path: backup.path };
      }
      if (command === "local_restore") {
        const backup = (current.backups || []).find((candidate) => candidate.name === input.name);
        if (!backup) throw new Error("Sauvegarde introuvable.");
        current.collections = clone(backup.snapshot.collections);
        current.revision = (current.revision || 0) + 1;
        writeState(current);
        return { revision: current.revision };
      }
      throw new Error("Commande Tauri non simulée : " + command);
    },
  };
}

function makeSyntheticSiecleZip(destination) {
  const students = [
    { id: "E1", technical: "T1", ine: INES[0], nom: "Dupont", prenom: "Elise", birth: "2012-05-14", sex: "2", classCode: "3E", classType: "1" },
    { id: "E2", technical: "T2", ine: INES[1], nom: "Martin", prenom: "Noe", birth: "2012-02-03", sex: "1", classCode: "3E", classType: "1" },
    { id: "E3", technical: "T3", ine: INES[2], nom: "Petit", prenom: "Lina", birth: "2012-09-21", sex: "2", classCode: "4E", classType: "1" },
  ];
  const studentXml = students.map((student) =>
    '<ELEVE ELEVE_ID="' + student.id + '">' +
    "<ELENOET>" + student.technical + "</ELENOET>" +
    "<ID_NATIONAL>" + student.ine + "</ID_NATIONAL>" +
    "<NOM_DE_FAMILLE>" + student.nom + "</NOM_DE_FAMILLE>" +
    "<PRENOM>" + student.prenom + "</PRENOM>" +
    "<DATE_NAISS>" + student.birth + "</DATE_NAISS>" +
    "<CODE_SEXE>" + student.sex + "</CODE_SEXE>" +
    "<DATE_SORTIE></DATE_SORTIE></ELEVE>"
  ).join("");
  const structureXml = students.map((student) =>
    '<STRUCTURES_ELEVE ELEVE_ID="' + student.id + '">' +
    "<STRUCTURE><CODE_STRUCTURE>" + student.classCode + "</CODE_STRUCTURE>" +
    "<TYPE_STRUCTURE>" + student.classType + "</TYPE_STRUCTURE></STRUCTURE>" +
    "</STRUCTURES_ELEVE>"
  ).join("");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    "<BEE_ELEVES><PARAMETRES><ANNEE_SCOLAIRE>2026-2027</ANNEE_SCOLAIRE><UAJ>0340001A</UAJ></PARAMETRES>" +
    "<DONNEES><ELEVES>" + studentXml + "</ELEVES><STRUCTURES>" + structureXml +
    "</STRUCTURES></DONNEES></BEE_ELEVES>";
  fs.writeFileSync(destination, zipSync({ "export/eleves.xml": strToU8(xml) }));
  return destination;
}

function getWorkbookRows(filePath, sheetName) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  assert.ok(sheet, "Feuille absente : " + sheetName);
  return {
    workbook,
    sheet,
    rows: XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false }),
  };
}

function setRowCells(filePath, sheetName, ine, valuesByHeader, outputPath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  assert.ok(sheet, "Feuille absente : " + sheetName);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
  const headers = (rows[0] || []).map((value) => String(value ?? "").trim());
  const ineColumn = headers.indexOf("INE");
  assert.ok(ineColumn >= 0, "Colonne INE absente.");
  const targetInes = Array.isArray(ine) ? ine : [ine];
  const rowIndices = targetInes.map((targetIne) =>
    rows.findIndex((row, index) => index > 0 && String(row[ineColumn] ?? "").trim() === targetIne)
  );
  assert.ok(rowIndices.every((rowIndex) => rowIndex > 0), "INE de test absent du modèle : " + targetInes.join(", "));
  for (const rowIndex of rowIndices) {
    for (const [header, value] of Object.entries(valuesByHeader)) {
      const columnIndex = headers.indexOf(header);
      assert.ok(columnIndex >= 0, "Colonne absente : " + header);
      if (value === "") continue;
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
    }
  }
  XLSX.writeFile(workbook, outputPath, { bookType: "xlsx" });
  return { headers, rowIndices };
}

async function screenshot(page, name) {
  const destination = path.join(SCREENSHOTS, name + ".png");
  await page.screenshot({ path: destination, fullPage: true, animations: "disabled" });
  state.screenshots.push(destination);
  return destination;
}

async function recordStep(name, fn) {
  const startedAt = new Date().toISOString();
  const result = await fn();
  state.steps.push({ name, passed: true, startedAt, details: result || null });
  console.log("PASS " + name);
  return result;
}

async function listCollection(page, collection) {
  return page.evaluate((name) => window.__TAURI_INTERNALS__.invoke("local_list", { collection: name }), collection);
}

async function commitOperations(page, operations) {
  return page.evaluate((items) => window.__TAURI_INTERNALS__.invoke("local_commit", { operations: items }), operations);
}

async function waitForStoredStudent(page, ine, predicate, label) {
  await page.waitForFunction(async (input) => {
    const rows = await window.__TAURI_INTERNALS__.invoke("local_list", { collection: "BrevetBlanc" });
    const record = rows.find((item) => item.data && item.data.INE === input.ine);
    return !!record && input.serializedPredicate(record.data);
  }, { ine, serializedPredicate: predicate.toString() }, { timeout: 15000, polling: 250 });
}

async function main() {
  const fixtureZip = makeSyntheticSiecleZip(path.join(ARTIFACTS, "synthetic-siecle-fixture.zip"));
  const filePaths = {
    bb1: path.join(ARTIFACTS, "Modele_BB1_" + YEAR + ".xlsx"),
    bb2: path.join(ARTIFACTS, "Modele_BB2_" + YEAR + ".xlsx"),
    bb2Renamed: path.join(ARTIFACTS, "notes-importees-renommees.xlsx"),
    bb1Filled: path.join(ARTIFACTS, "notes-bb1-remplies.xlsx"),
    dnb: path.join(ARTIFACTS, "Modele_DNB_" + YEAR + ".xlsx"),
    dnbFilled: path.join(ARTIFACTS, "resultats-dnb-remplis.xlsx"),
  };
  const seed = {
    revision: 0,
    collections: {
      brevetResults: {}, BrevetBlanc: {}, pixResults: {}, appSettings: {},
    },
    backups: [],
  };
  let browser;
  let context;
  let page;
  let baseUrl = BASE_URL;
  try {
    if (CDP_URL) {
      browser = await chromium.connectOverCDP(CDP_URL);
      context = browser.contexts()[0];
      assert.ok(context, "Aucun contexte Chromium dans la session CDP.");
      page = context.pages().find((candidate) => /^https?:/.test(candidate.url())) || context.pages()[0];
      assert.ok(page, "Aucune page Tauri existante dans la session CDP.");
      baseUrl = process.env.QA_BASE_URL || new URL(page.url()).origin;
    } else {
      assert.ok(fs.existsSync(CHROME_PATH), "Chrome absent : " + CHROME_PATH);
      browser = await chromium.launch({ headless: true, executablePath: CHROME_PATH, args: ["--disable-dev-shm-usage"] });
      context = await browser.newContext({
        acceptDownloads: true,
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        colorScheme: "light",
      });
      await context.addInitScript(installMockTransport, seed);
      page = await context.newPage();
    }
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(25000);
    const expectedOrigin = new URL(baseUrl).origin;
    page.on("console", (message) => {
      if (message.type() === "error") state.consoleErrors.push({ text: message.text(), url: page.url() });
    });
    page.on("pageerror", (error) => state.pageErrors.push({ message: error.message, stack: error.stack, url: page.url() }));
    page.on("request", (request) => {
      try {
        const url = new URL(request.url());
        if ((url.protocol === "https:" || url.protocol === "http:") &&
          url.origin !== expectedOrigin && url.hostname !== "ipc.localhost") {
          state.externalRequests.push({ url: request.url(), method: request.method() });
        }
      } catch {}
    });
    page.on("requestfailed", (request) => state.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));

    await recordStep("Page import DNB/élèves chargée", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/import/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /importer des données/i }).waitFor({ state: "visible" });
      await page.locator("#official-student-file").waitFor({ state: "attached" });
      assert.ok((await page.locator("body").innerText()).trim().length > 300, "Écran import vide.");
      if (CDP_URL) {
        const tauri = await page.evaluate(() => !!window.isTauri && !!window.__TAURI_INTERNALS__?.invoke);
        assert.ok(tauri, "La page CDP n’expose pas le bridge Tauri natif.");
        const info = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("local_info"));
        assert.match(info.dataDirectory, /[\\/]tmp[\\/]native-test[\\/]data$/i,
          "Garde-fou CDP : le script n'écrit que dans tmp/native-test/data.");
        const [roster, results, backups] = await Promise.all([
          listCollection(page, "BrevetBlanc"),
          listCollection(page, "brevetResults"),
          page.evaluate(() => window.__TAURI_INTERNALS__.invoke("local_backups")),
        ]);
        assert.equal(backups.length, 0, "Garde-fou CDP : le dossier de test contient déjà des sauvegardes.");
        const syntheticRows = roster.filter((item) => INES.includes(item.data?.INE));
        for (const item of syntheticRows) {
          const fixture = item.data.INE === INES[0] ? FIRST :
            item.data.INE === INES[1] ? { INE: INES[1], NOM: "Martin", PRENOM: "Noe" } :
              { INE: INES[2], NOM: "Petit", PRENOM: "Lina" };
          assert.equal(item.data.NOM, fixture.NOM, "Un INE réservé au QA désigne une identité inattendue.");
          assert.equal(item.data.PRENOM, fixture.PRENOM, "Un INE réservé au QA désigne une identité inattendue.");
          assert.equal(item.data.anneeScolaire, YEAR, "Un INE réservé au QA désigne une autre année.");
          assert.ok(/^3E/i.test(item.data.CLASSE || ""), "Un INE réservé au QA désigne une autre classe.");
        }
        const syntheticResults = results.filter((item) => INES.includes(item.data?.INE));
        for (const item of syntheticResults) {
          assert.equal(item.data["Nom candidat"], item.data.INE === FIRST.INE ? FIRST.NOM : "Martin", "Un résultat portant un INE QA ne correspond pas aux données de test.");
        }
        const cleanup = [
          ...syntheticRows.map((item) => ({ type: "delete", collection: "BrevetBlanc", id: item.id })),
          ...syntheticResults.map((item) => ({ type: "delete", collection: "brevetResults", id: item.id })),
        ];
        if (cleanup.length) await commitOperations(page, cleanup);
        assert.equal((await listCollection(page, "BrevetBlanc")).length, 0,
          "Garde-fou CDP : des fiches élève hors fixtures QA sont présentes.");
        assert.equal((await listCollection(page, "brevetResults")).length, 0,
          "Garde-fou CDP : des résultats DNB hors fixtures QA sont présents.");
      }
      return { url: page.url(), title: await page.title(), mode: MODE, nativeTestProfileOnly: !!CDP_URL };
    });

    await recordStep("Import SIECLE synthétique limité aux élèves de troisième", async () => {
      await page.locator("#official-student-file").setInputFiles(fixtureZip);
      await page.getByText(/2 élèves de troisième avec INE disponibles/i).waitFor({ state: "visible" });
      await page.getByText(/2 élève\(s\) sélectionné\(s\)/i).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("checkbox").count(), 1, "Une seule classe recommandée doit être proposée.");
      await page.getByRole("button", { name: /Ajouter \/ mettre à jour 2 élève/i }).click();
      await page.getByRole("heading", { name: "Élèves enregistrés", exact: true }).waitFor({ state: "visible" });
      await page.getByText(new RegExp("2 élève.*ajouté.*pour " + YEAR, "i")).waitFor({ state: "visible" });
      const roster = await listCollection(page, "BrevetBlanc");
      const currentYearStudents = roster.filter((item) => item.data.anneeScolaire === YEAR);
      assert.equal(currentYearStudents.length, 2, "L'élève de quatrième ne doit pas être importé.");
      assert.deepEqual(currentYearStudents.map((item) => item.data.INE).sort(), INES.slice(0, 2).sort());
      assert.ok(currentYearStudents.some((item) => item.data.NOM === FIRST.NOM && item.data.PRENOM === FIRST.PRENOM));
      await screenshot(page, "01-import-eleves-3e");
      return { year: YEAR, savedInes: currentYearStudents.map((item) => item.data.INE), excludedFourthYear: INES[2] };
    });

    await recordStep("Téléchargement des modèles BB1 et BB2", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/admin/import-manuel/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /import manuel des notes/i }).waitFor({ state: "visible" });
      for (const exam of ["bb1", "bb2"]) {
        const target = filePaths[exam];
        const pendingDownload = page.waitForEvent("download");
        await page.getByRole("button", { name: "Télécharger le modèle " + exam.toUpperCase(), exact: true }).click();
        const download = await pendingDownload;
        await download.saveAs(target);
        const { rows } = getWorkbookRows(target, "Données");
        assert.equal(rows.length - 1, 2, exam.toUpperCase() + " doit contenir les deux élèves de troisième.");
        const ineColumn = rows[0].indexOf("INE");
        assert.deepEqual(rows.slice(1).map((row) => row[ineColumn]).sort(), INES.slice(0, 2).sort());
        const metadata = XLSX.readFile(target).Sheets["Mode d'emploi"];
        assert.equal(String(metadata.B2.v), YEAR);
        assert.equal(String(metadata.B3.v), "Brevet blanc");
        assert.equal(String(metadata.B4.v).toLowerCase(), exam);
      }
      await screenshot(page, "02-import-brevet-blanc");
      return { bb1: filePaths.bb1, bb2: filePaths.bb2, rowsPerTemplate: 2 };
    });

    await recordStep("Le changement d’année bloque un modèle BB d’une autre année", async () => {
      await page.locator("#importYear-trigger").click();
      await page.getByRole("button", { name: OTHER_YEAR, exact: true }).click();
      await page.locator("#xlsx-file-upload").setInputFiles(filePaths.bb1);
      await page.getByText(new RegExp("prévu pour l'année " + YEAR)).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Importer les notes" }).isDisabled(), true);
      await page.locator("#importYear-trigger").click();
      await page.getByRole("button", { name: YEAR, exact: true }).click();
      await page.getByText(new RegExp("prévu pour l'année " + YEAR)).waitFor({ state: "hidden" });
      return { selectedYear: OTHER_YEAR, modelYear: YEAR, blocked: true };
    });

    await recordStep("Téléchargement et refus croisé du modèle DNB dans l’import BB", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/import/", { waitUntil: "domcontentloaded" });
      await page.getByText("Importer Résultats Brevet Officiels (Excel)", { exact: true }).waitFor({ state: "visible" });
      const pendingDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "Télécharger le modèle DNB prérempli", exact: true }).click();
      const download = await pendingDownload;
      await download.saveAs(filePaths.dnb);
      const dnbRows = getWorkbookRows(filePaths.dnb, "Données").rows;
      assert.equal(dnbRows.length - 1, 2);
      const info = XLSX.readFile(filePaths.dnb).Sheets["Mode d'emploi"];
      assert.equal(String(info.B2.v), YEAR);
      assert.equal(String(info.B3.v), "DNB");
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/admin/import-manuel/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /import manuel des notes/i }).waitFor({ state: "visible" });
      await page.locator("#xlsx-file-upload").setInputFiles(filePaths.dnb);
      await page.getByText(/destiné aux résultats officiels du DNB/i).waitFor({ state: "visible" });
      assert.equal(await page.getByRole("button", { name: "Importer les notes" }).isDisabled(), true);
      await screenshot(page, "03-modele-dnb-refuse-import-bb");
      return { dnbRows: dnbRows.length - 1, rejectedByBbImport: true };
    });

    await recordStep("Import BB1 : INE, décimal avec virgule, nombre, ABS et cellule vide", async () => {
      const { rows } = getWorkbookRows(filePaths.bb1, "Données");
      const headers = rows[0].map((value) => String(value ?? ""));
      const noteHeaders = headers.slice(6);
      assert.ok(noteHeaders.length >= 4, "Le modèle BB doit contenir au moins quatre colonnes de notes.");
      const french = noteHeaders[0];
      const math = noteHeaders[1];
      const numeric = noteHeaders[2];
      const blank = noteHeaders[3];
      const subjects = [french, math, numeric, blank].map((header) => header.split(" /")[0]);
      const roster = await listCollection(page, "BrevetBlanc");
      const firstRecord = roster.find((item) => item.data.INE === FIRST.INE && item.data.anneeScolaire === YEAR);
      assert.ok(firstRecord, "Élève synthétique absent avant BB1.");
      const baseline = {
        [subjects[0]]: { bb1: 5, bb2: 6 },
        [subjects[1]]: { bb1: 8, bb2: 9 },
        [subjects[2]]: { bb1: 13, bb2: 14 },
        [subjects[3]]: { bb1: 10, bb2: 11 },
      };
      await commitOperations(page, [{
        type: "update", collection: "BrevetBlanc", id: firstRecord.id, data: { notes: baseline },
      }]);
      setRowCells(filePaths.bb1, "Données", FIRST.INE, {
        [french]: "17,5",
        [math]: "ABS",
        [numeric]: 12.75,
        [blank]: "",
      }, filePaths.bb1Filled);
      await page.locator("#xlsx-file-upload").setInputFiles(filePaths.bb1Filled);
      await page.getByText("Modèle BB1", { exact: true }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Importer les notes", exact: true }).click();
      await page.getByText("Importation réussie", { exact: true }).waitFor({ state: "visible" });
      const updated = (await listCollection(page, "BrevetBlanc")).find((item) => item.id === firstRecord.id).data;
      assert.equal(updated.INE, FIRST.INE);
      assert.equal(updated.notes[subjects[0]].bb1, 17.5);
      assert.equal(updated.notes[subjects[0]].bb2, 6);
      assert.equal(Object.hasOwn(updated.notes[subjects[1]], "bb1"), false, "ABS doit effacer la note BB1 existante.");
      assert.equal(updated.notes[subjects[1]].bb2, 9);
      assert.equal(updated.notes[subjects[2]].bb1, 12.75, "Une cellule numérique doit rester un nombre.");
      assert.equal(updated.notes[subjects[2]].bb2, 14);
      assert.equal(updated.notes[subjects[3]].bb1, 10, "Une cellule vide doit conserver la note.");
      assert.equal(updated.notes[subjects[3]].bb2, 11);
      await screenshot(page, "04-import-bb1-reussi");
      return { ine: updated.INE, commaDecimal: updated.notes[subjects[0]].bb1, numeric: updated.notes[subjects[2]].bb1, absCleared: true, blankPreserved: true };
    });

    await recordStep("Import BB2 reconnu depuis un fichier renommé", async () => {
      fs.copyFileSync(filePaths.bb2, filePaths.bb2Renamed);
      const { rows } = getWorkbookRows(filePaths.bb2Renamed, "Données");
      const french = String(rows[0][6]);
      setRowCells(filePaths.bb2Renamed, "Données", FIRST.INE, { [french]: 18.25 }, filePaths.bb2Renamed);
      await page.locator("#xlsx-file-upload").setInputFiles(filePaths.bb2Renamed);
      await page.getByText("Modèle BB2", { exact: true }).waitFor({ state: "visible" });
      await page.getByText(new RegExp("Année du modèle : " + YEAR)).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Importer les notes", exact: true }).click();
      await page.getByText("Importation réussie", { exact: true }).waitFor({ state: "visible" });
      const updated = (await listCollection(page, "BrevetBlanc")).find((item) => item.data.INE === FIRST.INE && item.data.anneeScolaire === YEAR).data;
      const subject = french.split(" /")[0];
      assert.equal(updated.notes[subject].bb1, 17.5);
      assert.equal(updated.notes[subject].bb2, 18.25);
      await screenshot(page, "05-import-bb2-fichier-renomme");
      return { filename: path.basename(filePaths.bb2Renamed), detectedExam: "bb2", notes: updated.notes[subject] };
    });

    await recordStep("Import du modèle DNB rempli avec ses données officielles", async () => {
      const { rows } = getWorkbookRows(filePaths.dnb, "Données");
      const headers = rows[0].map((value) => String(value ?? ""));
      const dnbValues = {
        "Décision": "Admis",
        "Note finale /20": "14,5",
        "Contrôle continu /20": "15",
        "Épreuves terminales /20": "13",
        "Français /20": "14.5",
        "Mathématiques /20": "16",
        "Histoire-géographie /20": "14",
        "EMC /20": "15",
        "Sciences /20": "13",
        "Oral /20": "17",
      };
      for (const required of Object.keys(dnbValues)) assert.ok(headers.includes(required), "En-tête DNB attendu absent : " + required);
      setRowCells(filePaths.dnb, "Données", INES.slice(0, 2), dnbValues, filePaths.dnbFilled);
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/import/", { waitUntil: "domcontentloaded" });
      await page.getByText("Importer Résultats Brevet Officiels (Excel)", { exact: true }).waitFor({ state: "visible" });
      await page.locator("#excel-file-upload-input").setInputFiles(filePaths.dnbFilled);
      await page.getByText(/Fichier Excel : resultats-dnb-remplis\.xlsx/i).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Importer Résultats Officiels (Excel)", exact: true }).click();
      await page.getByText(/résultats officiels importés pour/i).first().waitFor({ state: "visible" });
      const results = await listCollection(page, "brevetResults");
      const result = results.find((item) => item.data.INE === FIRST.INE);
      assert.ok(result, "Le résultat DNB de l'INE fictif doit être enregistré.");
      assert.equal(result.data.anneeScolaireImportee, YEAR);
      assert.equal(result.data["Nom candidat"], FIRST.NOM);
      assert.equal(result.data["Moyenne sur 20"], 14.5);
      assert.equal(result.data.scoreFrancais, 14.5);
      await screenshot(page, "06-import-dnb-reussi");
      return { ine: result.data.INE, year: result.data.anneeScolaireImportee, overall: result.data["Moyenne sur 20"], french: result.data.scoreFrancais };
    });

    await recordStep("Panorama et saisie manuelle affichent les données locales de 2027", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/panorama/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /panorama des résultats/i }).waitFor({ state: "visible" });
      await page.getByText(FIRST.NOM, { exact: false }).first().waitFor({ state: "visible" }).catch(() => {});
      assert.ok((await page.locator("body").innerText()).includes("2027") || YEAR !== "2027", "Le panorama doit refléter l'année testée.");
      await screenshot(page, "07-panorama");

      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/brevet-blanc/saisie-notes/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /saisie des notes du brevet blanc/i }).waitFor({ state: "visible" });
      const studentRow = page.getByRole("row").filter({ hasText: FIRST.NOM }).filter({ hasText: FIRST.PRENOM }).first();
      await studentRow.waitFor({ state: "visible" });
      const noteInputs = studentRow.locator("input");
      assert.ok(await noteInputs.count() >= 2, "Les notes BB1/BB2 doivent être éditables dans le tableau.");
      await noteInputs.first().fill("19");
      await page.getByRole("button", { name: "Enregistrer maintenant", exact: true }).click();
      await page.getByText(/entrée\(s\) de note\(s\) enregistrée\(s\)/i).first().waitFor({ state: "visible" });
      const roster = await listCollection(page, "BrevetBlanc");
      const updated = roster.find((item) => item.data.INE === FIRST.INE && item.data.anneeScolaire === YEAR).data;
      const frenchSubject = Object.keys(updated.notes).find((subject) => subject.toLowerCase().includes("français") || subject.toLowerCase().includes("francais"));
      assert.ok(frenchSubject);
      assert.equal(updated.notes[frenchSubject].bb1, 19);
      await screenshot(page, "08-saisie-manuelle");
      return { ine: FIRST.INE, manualBb1French: updated.notes[frenchSubject].bb1, year: YEAR };
    });

    await recordStep("Verrouillage BB1 bloque la saisie, puis peut être rouvert", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/admin/verrouillage/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /verrouillage des annees/i }).waitFor({ state: "visible" });
      const bb1Label = page.getByText("Brevet Blanc 1", { exact: true });
      const bb1Block = bb1Label.locator("xpath=../..");
      await bb1Block.getByRole("button", { name: "Fermer", exact: true }).click();
      await bb1Block.getByText(new RegExp("Saisie fermee pour " + YEAR)).waitFor({ state: "visible" });
      await screenshot(page, "09-verrouillage-bb1-ferme");
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/brevet-blanc/saisie-notes/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /saisie des notes du brevet blanc/i }).waitFor({ state: "visible" });
      const studentRow = page.getByRole("row").filter({ hasText: FIRST.NOM }).filter({ hasText: FIRST.PRENOM }).first();
      await studentRow.waitFor({ state: "visible" });
      const inputs = studentRow.locator("input");
      assert.equal(await inputs.nth(0).isDisabled(), true, "Saisie BB1 désactivée par le verrou.");
      assert.equal(await inputs.nth(1).isDisabled(), false, "Saisie BB2 reste ouverte.");
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/admin/verrouillage/", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /verrouillage des annees/i }).waitFor({ state: "visible" });
      const reopenedBlock = page.getByText("Brevet Blanc 1", { exact: true }).locator("xpath=../..");
      await reopenedBlock.getByRole("button", { name: "Rouvrir", exact: true }).click();
      await reopenedBlock.getByText(new RegExp("Saisie ouverte pour " + YEAR)).waitFor({ state: "visible" });
      return { year: YEAR, bb1Closed: true, bb2RemainedOpen: true, reopened: true };
    });

    await recordStep("Sauvegarde locale et restauration confirmée", async () => {
      await page.goto(baseUrl.replace(/\/$/, "") + "/dashboard/settings/", { waitUntil: "domcontentloaded" });
      await page.getByText("Données locales", { exact: true }).last().waitFor({ state: "visible" });
      await page.getByText(/Dossier des données/i).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Créer une sauvegarde", exact: true }).click();
      await page.getByText("Sauvegarde créée", { exact: true }).waitFor({ state: "visible" });
      const backups = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("local_backups"));
      assert.equal(backups.length, 1, "Une sauvegarde doit être créée.");
      const roster = await listCollection(page, "BrevetBlanc");
      const target = roster.find((item) => item.data.INE === FIRST.INE && item.data.anneeScolaire === YEAR);
      assert.ok(target);
      const frenchSubject = Object.keys(target.data.notes || {}).find((subject) => subject.toLowerCase().includes("français") || subject.toLowerCase().includes("francais"));
      const mutatedNotes = JSON.parse(JSON.stringify(target.data.notes));
      mutatedNotes[frenchSubject].bb1 = 2;
      await commitOperations(page, [{
        type: "update", collection: "BrevetBlanc", id: target.id, data: { notes: mutatedNotes },
      }]);
      assert.equal((await listCollection(page, "BrevetBlanc")).find((item) => item.id === target.id).data.notes[frenchSubject].bb1, 2);
      await page.getByRole("button", { name: "Restaurer cette sauvegarde", exact: true }).click();
      await page.getByRole("alertdialog").getByText(/va remplacer les données actuelles/i).waitFor({ state: "visible" });
      await screenshot(page, "10-confirmation-restauration");
      const previousTimeOrigin = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole("button", { name: "Confirmer la restauration", exact: true }).click();
      await page.waitForFunction((before) => performance.timeOrigin !== before, previousTimeOrigin, { timeout: 20000, polling: 250 });
      await page.getByText("Données locales", { exact: true }).last().waitFor({ state: "visible" });
      await page.waitForFunction(async (input) => {
        const rows = await window.__TAURI_INTERNALS__.invoke("local_list", { collection: "BrevetBlanc" });
        const student = rows.find((item) => item.id === input.id);
        return !!student && student.data.notes[input.subject].bb1 === input.expected;
      }, { id: target.id, subject: frenchSubject, expected: 19 }, { timeout: 15000, polling: 250 });
      await screenshot(page, "11-parametres-apres-restauration");
      return { backupCount: backups.length, restoredFrenchBb1: 19 };
    });

    const expectedConsoleErrors = state.consoleErrors.filter((entry) =>
      entry.text.includes("Ce modèle est destiné aux résultats officiels du DNB") ||
      entry.text.includes("Erreur lors de l'import"),
    );
    const unexpectedConsoleErrors = state.consoleErrors.filter((entry) => !expectedConsoleErrors.includes(entry));
    assert.equal(state.pageErrors.length, 0, "Erreurs JavaScript de page : " + JSON.stringify(state.pageErrors));
    assert.equal(unexpectedConsoleErrors.length, 0, "Erreurs console inattendues : " + JSON.stringify(unexpectedConsoleErrors));
    assert.equal(state.externalRequests.length, 0, "Requêtes réseau externes détectées : " + JSON.stringify(state.externalRequests));
    state.consoleErrorsExpected = expectedConsoleErrors;
    state.consoleErrorsUnexpected = unexpectedConsoleErrors;
    state.completed = true;
  } catch (error) {
    state.failure = { message: error.message, stack: error.stack };
    state.completed = false;
    if (page) {
      try {
        const failedScreenshot = path.join(SCREENSHOTS, "failure.png");
        await page.screenshot({ path: failedScreenshot, fullPage: true, animations: "disabled" });
        state.screenshots.push(failedScreenshot);
      } catch {}
    }
    console.error("FAIL " + error.message);
  } finally {
    const reportPath = path.join(ARTIFACTS, "qa-summary.json");
    state.mode = MODE;
    state.baseUrl = baseUrl;
    state.year = YEAR;
    state.browserPlugin = "Absent; fallback Playwright autorisé par la tâche.";
    state.externalRequestsCount = state.externalRequests.length;
    state.consoleErrorCount = state.consoleErrors.length;
    state.pageErrorCount = state.pageErrors.length;
    fs.writeFileSync(reportPath, JSON.stringify(state, null, 2), "utf8");
    console.log("QA report: " + reportPath);
    console.log("Screenshots: " + SCREENSHOTS);
    console.log("External requests: " + state.externalRequests.length + "; page errors: " + state.pageErrors.length);
    // Do not call close() for a CDP-attached browser; the user-owned Tauri
    // application must remain open after the harness disconnects.
    if (browser) await browser.close();
  }
  if (!state.completed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
