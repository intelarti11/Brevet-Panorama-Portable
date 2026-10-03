import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import { parseOfficialStudentFile, parseOfficialStudentXml } from "./official-student-import";
import { isThirdYearClass } from "./student-roster-types";

const studentXml = (
  id: string,
  elenoet: string,
  ine: string,
  options: {
    name?: string;
    firstName?: string;
    sex?: string;
    birthDate?: string;
    exitDate?: string;
  } = {},
): string => `<ELEVE ELEVE_ID="${id}" ELENOET="${elenoet}">
  <ID_NATIONAL>${ine}</ID_NATIONAL>
  <ELENOET>${elenoet}</ELENOET>
  <NOM_DE_FAMILLE>${options.name ?? "NOM_TEST"}</NOM_DE_FAMILLE>
  <PRENOM>${options.firstName ?? "Prenom Exemple"}</PRENOM>
  <DATE_NAISS>${options.birthDate ?? "01/02/2012"}</DATE_NAISS>
  <CODE_SEXE>${options.sex ?? "1"}</CODE_SEXE>
  <DATE_ENTREE>01/09/2024</DATE_ENTREE>
  <DATE_SORTIE>${options.exitDate ?? ""}</DATE_SORTIE>
</ELEVE>`;

const structureXml = (id: string, elenoet: string, displayCode: string): string => {
  const type = displayCode.endsWith("D") ? "D" : "";
  const code = type ? displayCode.slice(0, -type.length) : displayCode;
  return `<STRUCTURES_ELEVE ELEVE_ID="${id}" ELENOET="${elenoet}"><STRUCTURE><CODE_STRUCTURE>${code}</CODE_STRUCTURE><TYPE_STRUCTURE>${type}</TYPE_STRUCTURE></STRUCTURE></STRUCTURES_ELEVE>`;
};

const xmlDocument = (students: string[], structures: string[], encoding = "UTF-8"): string =>
  `<?xml version="1.0" encoding="${encoding}"?>
<BEE_ELEVES>
  <PARAMETRES><UAJ>ETAB-EXEMPLE</UAJ><ANNEE_SCOLAIRE>2026</ANNEE_SCOLAIRE></PARAMETRES>
  <DONNEES>
    <ELEVES>${students.join("\n")}</ELEVES>
    <STRUCTURES>${structures.join("\n")}</STRUCTURES>
  </DONNEES>
</BEE_ELEVES>`;

const sampleXml = (): string =>
  xmlDocument(
    [
      studentXml("S-01", "10001", "ine-alpha", { firstName: "Prenom Échantillon" }),
      studentXml("S-02", "10002", "INE-BETA", { sex: "2" }),
      studentXml("S-03", "10003", "", { name: "NOM_SANS_INE" }),
      studentXml("S-04", "10004", "INE-SORTI", { exitDate: "01/07/2026" }),
      studentXml("S-05", "10005", "INE-SANS-CLASSE"),
      studentXml("S-06", "10006", "INE-INACTIF"),
      studentXml("S-07", "10007", "", { exitDate: "01/07/2026" }),
    ],
    [
      structureXml("S-01", "10001", "3EME 1D"),
      structureXml("S-02", "10002", "4EME 1D"),
      structureXml("S-03", "10003", "3EME 1D"),
      structureXml("S-04", "10004", "3EME 1D"),
      structureXml("S-06", "10006", "InactifsD"),
    ],
  );

const asFile = (
  name: string,
  bytes: Uint8Array,
): Pick<File, "name" | "size" | "arrayBuffer"> => ({
  name,
  size: bytes.byteLength,
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

const latin9Encode = (value: string): Uint8Array => {
  const replacedLatin9Slots = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > 0xff || replacedLatin9Slots.has(codePoint)) {
      throw new Error("Test fixture contains a character not supported by this Latin-9 helper.");
    }
    bytes.push(codePoint);
  }
  return Uint8Array.from(bytes);
};

const utf16WithBom = (value: string, littleEndian: boolean): Uint8Array => {
  const littleEndianBody = Buffer.from(value, "utf16le");
  const bytes = new Uint8Array(littleEndianBody.byteLength + 2);
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < littleEndianBody.byteLength; index += 2) {
    bytes[index + 2] = littleEndian ? littleEndianBody[index] : littleEndianBody[index + 1];
    bytes[index + 3] = littleEndian ? littleEndianBody[index + 1] : littleEndianBody[index];
  }
  return bytes;
};

test("reconnaît les libellés de troisième et exclut les autres classes", () => {
  for (const code of ["3EME1D", "3eA", "3A", "301", "3SEGPA", "3PM", "Troisième générale"]) {
    assert.equal(isThirdYearClass(code), true, `${code} doit être reconnue comme une troisième`);
  }

  for (const code of ["6EME 1D", "5EME 1D", "4EME 1D", "Sans classe", "InactifsD"]) {
    assert.equal(isThirdYearClass(code), false, `${code} ne doit pas être recommandée`);
  }
});

test("lit l’export BEE, filtre les sortants et compte les classes restantes", () => {
  const result = parseOfficialStudentXml(new TextEncoder().encode(sampleXml()));

  assert.equal(result.schoolYear, "2026");
  assert.equal(result.schoolCode, "ETAB-EXEMPLE");
  assert.equal(result.sourceStudentCount, 7);
  assert.equal(result.excludedStudentCount, 2);
  assert.equal(result.missingIneCount, 1);
  assert.equal(result.students.length, 4);

  const alpha = result.students.find((student) => student.INE === "INE-ALPHA");
  assert.deepEqual(alpha, {
    INE: "INE-ALPHA",
    NOM: "NOM_TEST",
    PRENOM: "Prenom Échantillon",
    CLASSE: "3EME 1D",
    SEXE: "g",
    dateNaissance: "01/02/2012",
  });
  assert.equal(result.students.find((student) => student.INE === "INE-BETA")?.SEXE, "f");
  assert.equal(result.students.find((student) => student.INE === "INE-SANS-CLASSE")?.CLASSE, "Sans classe");
  assert.equal(result.students.find((student) => student.INE === "INE-INACTIF")?.CLASSE, "InactifsD");
  assert.equal(result.students.some((student) => student.INE === "INE-SORTI"), false);

  assert.deepEqual(
    result.classes.map(({ code, studentCount, recommendedForBrevet }) => ({
      code,
      studentCount,
      recommendedForBrevet,
    })),
    [
      { code: "3EME 1D", studentCount: 1, recommendedForBrevet: true },
      { code: "4EME 1D", studentCount: 1, recommendedForBrevet: false },
      { code: "InactifsD", studentCount: 1, recommendedForBrevet: false },
      { code: "Sans classe", studentCount: 1, recommendedForBrevet: false },
    ],
  );
});

test("accepte les homonymes lorsqu’ils ont des INE distincts", () => {
  const result = parseOfficialStudentXml(new TextEncoder().encode(sampleXml()));
  const homonyms = result.students.filter((student) => student.NOM === "NOM_TEST" && student.PRENOM === "Prenom Exemple");
  assert.equal(homonyms.length, 3);
  assert.equal(new Set(homonyms.map((student) => student.INE)).size, 3);
});

test("décode un XML ISO-8859-15 selon sa déclaration", () => {
  const xml = xmlDocument(
    [studentXml("S-LATIN", "10101", "INE-LATIN", { firstName: "Prénom École" })],
    [structureXml("S-LATIN", "10101", "3EME 2D")],
    "ISO-8859-15",
  );
  const result = parseOfficialStudentXml(latin9Encode(xml));
  assert.equal(result.students[0].PRENOM, "Prénom École");
});

test("accepte les BOM UTF-8 et UTF-16 dans les deux ordres d’octets", () => {
  const utf8 = new TextEncoder().encode(sampleXml());
  const utf8WithBom = new Uint8Array(utf8.byteLength + 3);
  utf8WithBom.set([0xef, 0xbb, 0xbf]);
  utf8WithBom.set(utf8, 3);
  assert.equal(parseOfficialStudentXml(utf8WithBom).students.length, 4);

  const utf16Xml = sampleXml().replace('encoding="UTF-8"', 'encoding="UTF-16"');
  assert.equal(parseOfficialStudentXml(utf16WithBom(utf16Xml, true)).students.length, 4);
  assert.equal(parseOfficialStudentXml(utf16WithBom(utf16Xml, false)).students.length, 4);
});

test("filtre les entrées non XML d’une archive ZIP et lit son XML", async () => {
  const archive = zipSync({
    "README.txt": strToU8("Ce texte fictif doit être ignoré."),
    "dossier/eleves.XML": strToU8(sampleXml()),
  });
  const result = await parseOfficialStudentFile(asFile("export.zip", archive));
  assert.equal(result.students.length, 4);
  assert.equal(result.schoolCode, "ETAB-EXEMPLE");
});

test("lit aussi un fichier XML direct via l’API fichier", async () => {
  const result = await parseOfficialStudentFile(asFile("export.xml", new TextEncoder().encode(sampleXml())));
  assert.equal(result.students.length, 4);
  assert.equal(result.sourceStudentCount, 7);
});

test("accepte les éléments XML avec préfixes d’espace de noms", () => {
  const namespaced = `<?xml version="1.0" encoding="UTF-8"?>
  <b:BEE_ELEVES xmlns:b="urn:exemple">
    <b:PARAMETRES><b:UAJ>ETAB-NS</b:UAJ><b:ANNEE_SCOLAIRE>2026</b:ANNEE_SCOLAIRE></b:PARAMETRES>
    <b:DONNEES>
      <b:ELEVES>${studentXml("NS-1", "11001", "INE-NS")}</b:ELEVES>
      <b:STRUCTURES>${structureXml("NS-1", "11001", "5EME 1D")}</b:STRUCTURES>
    </b:DONNEES>
  </b:BEE_ELEVES>`;
  const result = parseOfficialStudentXml(new TextEncoder().encode(namespaced));
  assert.equal(result.students[0].CLASSE, "5EME 1D");
  assert.equal(result.schoolCode, "ETAB-NS");
});

test("rejette un INE dupliqué sans afficher sa valeur", () => {
  const duplicated = xmlDocument(
    [
      studentXml("S-DUP-1", "12001", "INE-DUP"),
      studentXml("S-DUP-2", "12002", "ine-dup"),
    ],
    [],
  );
  assert.throws(
    () => parseOfficialStudentXml(new TextEncoder().encode(duplicated)),
    /partagent le même INE/,
  );
});

test("rejette un XML mal formé et les déclarations DOCTYPE", () => {
  assert.throws(
    () => parseOfficialStudentXml(new TextEncoder().encode("<BEE_ELEVES><DONNEES></BEE_ELEVES>")),
    /XML est mal formé/,
  );

  const withDoctype = `<?xml version="1.0"?>
    <!DOCTYPE BEE_ELEVES [<!ENTITY fake "valeur">]>
    <BEE_ELEVES><PARAMETRES/><DONNEES><ELEVES>&fake;</ELEVES></DONNEES></BEE_ELEVES>`;
  assert.throws(
    () => parseOfficialStudentXml(new TextEncoder().encode(withDoctype)),
    /DOCTYPE ne sont pas acceptées/,
  );
});

test("rejette une archive ZIP sans XML unique", async () => {
  const archive = zipSync({ "un.txt": strToU8("aucun xml") });
  await assert.rejects(parseOfficialStudentFile(asFile("export.zip", archive)), /exactement un fichier XML/);
});
