import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

import { isThirdYearClass } from "./student-roster-types";
import type { OfficialStudentClass, OfficialStudentExport, StudentIdentity } from "./student-roster-types";

const MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_XML_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5_000;
const NO_CLASS_CODE = "Sans classe";

type XmlRecord = Record<string, unknown>;
type SourceStudent = {
  INE: string;
  NOM: string;
  PRENOM: string;
  dateNaissance?: string;
  sexCode: string;
  dateSortie: string;
  eleveId: string;
  elenoetKeys: string[];
};

type XmlEncoding = "utf-8" | "iso-8859-15" | "utf-16le" | "utf-16be";

const asRecord = (value: unknown): XmlRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;

const asArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const readText = (value: unknown): string => {
  if (Array.isArray(value)) {
    if (value.length > 1) throw new Error("Un champ du XML est présent plusieurs fois.");
    return value.length === 1 ? readText(value[0]) : "";
  }
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  const record = asRecord(value);
  if (record && Object.prototype.hasOwnProperty.call(record, "#text")) {
    return readText(record["#text"]);
  }
  return "";
};

const childText = (record: XmlRecord, name: string): string => readText(record[name]);

const attributeText = (record: XmlRecord, name: string): string =>
  readText(record[`@_${name}`]);

const structureCode = (row: XmlRecord): string => {
  const structure = asRecord(row.STRUCTURE);
  if (!structure) return childText(row, "STRUCTURE");

  const code = childText(structure, "CODE_STRUCTURE");
  const type = childText(structure, "TYPE_STRUCTURE");
  if (!code) return readText(structure);
  return type && !code.toUpperCase().endsWith(type.toUpperCase()) ? `${code}${type}` : code;
};

const encodingLabel = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
};

const declaredEncodingFromText = (xml: string): string | undefined => {
  const declaration = /^\s*<\?xml\s+[^?]*\?>/i.exec(xml)?.[0];
  if (!declaration) return undefined;
  return /\bencoding\s*=\s*(['"])([^'"]+)\1/i.exec(declaration)?.[2];
};

const declaredEncodingFromAsciiBytes = (bytes: Uint8Array): string | undefined => {
  const prefix = bytes.subarray(0, Math.min(bytes.byteLength, 512));
  let ascii = "";
  for (const byte of prefix) ascii += byte < 0x80 ? String.fromCharCode(byte) : "\uFFFD";
  return declaredEncodingFromText(ascii);
};

const isUtf8Label = (label: string | undefined): boolean =>
  label === "utf8" || label === "unicode11utf8";

const isLatin9Label = (label: string | undefined): boolean =>
  label === "iso885915" || label === "latin9" || label === "l9";

const decode = (bytes: Uint8Array, encoding: XmlEncoding): string => {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Le XML ne respecte pas son encodage déclaré.");
  }
};

const assertCompatibleDeclaration = (
  declared: string | undefined,
  encoding: XmlEncoding,
): void => {
  if (!declared) return;
  const label = encodingLabel(declared);
  const compatible =
    (encoding === "utf-8" && isUtf8Label(label)) ||
    (encoding === "iso-8859-15" && isLatin9Label(label)) ||
    (encoding === "utf-16le" && (label === "utf16" || label === "utf16le")) ||
    (encoding === "utf-16be" && (label === "utf16" || label === "utf16be"));
  if (!compatible) {
    throw new Error("L’encodage annoncé dans le XML ne correspond pas à ses octets.");
  }
};

const decodeXml = (bytes: Uint8Array): string => {
  if (bytes.byteLength === 0) throw new Error("Le fichier XML est vide.");
  if (bytes.byteLength > MAX_XML_BYTES) {
    throw new Error("Le fichier XML dépasse la taille maximale de 20 Mo.");
  }

  const hasUtf8Bom =
    bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const hasUtf16LeBom = bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const hasUtf16BeBom = bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;

  if (hasUtf8Bom) {
    const xml = decode(bytes.subarray(3), "utf-8");
    assertCompatibleDeclaration(declaredEncodingFromText(xml), "utf-8");
    return xml;
  }

  if (hasUtf16LeBom || hasUtf16BeBom) {
    const encoding = hasUtf16LeBom ? "utf-16le" : "utf-16be";
    const xml = decode(bytes.subarray(2), encoding);
    assertCompatibleDeclaration(declaredEncodingFromText(xml), encoding);
    return xml;
  }

  const declared = declaredEncodingFromAsciiBytes(bytes);
  const label = encodingLabel(declared);
  let encoding: XmlEncoding;
  if (declared === undefined || isUtf8Label(label)) {
    encoding = "utf-8";
  } else if (isLatin9Label(label)) {
    encoding = "iso-8859-15";
  } else if (label === "utf16" || label === "utf16le" || label === "utf16be") {
    throw new Error("Un XML UTF-16 doit comporter son marqueur BOM.");
  } else {
    throw new Error("L’encodage XML attendu est UTF-8 ou ISO-8859-15.");
  }

  const xml = decode(bytes, encoding);
  assertCompatibleDeclaration(declaredEncodingFromText(xml), encoding);
  return xml;
};

const validateXml = (xml: string): void => {
  const withoutCommentsAndCdata = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (/<!DOCTYPE\b/i.test(withoutCommentsAndCdata)) {
    throw new Error("Les déclarations DOCTYPE ne sont pas acceptées dans cet import.");
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(
      `Le XML est mal formé (ligne ${validation.err.line}, colonne ${validation.err.col}).`,
    );
  }
};

const addUniqueIndex = (
  index: Map<string, number>,
  key: string,
  studentIndex: number,
  label: string,
): void => {
  if (!key) return;
  const existing = index.get(key);
  if (existing !== undefined && existing !== studentIndex) {
    throw new Error(`Le fichier contient des identifiants ${label} ambigus.`);
  }
  index.set(key, studentIndex);
};

const parseOfficialStudentXmlText = (xml: string): OfficialStudentExport => {
  validateXml(xml);

  let parsed: unknown;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      processEntities: true,
      maxNestedTags: 64,
    }).parse(xml);
  } catch {
    throw new Error("Le XML n’a pas pu être lu.");
  }

  const document = asRecord(parsed);
  const root = document ? asRecord(document.BEE_ELEVES) : undefined;
  if (!root) throw new Error("Le fichier ne correspond pas à un export officiel BEE_ELEVES.");

  const parameters = asRecord(root.PARAMETRES);
  const data = asRecord(root.DONNEES);
  const studentsSection = data ? asRecord(data.ELEVES) : undefined;
  if (!studentsSection || studentsSection.ELEVE === undefined) {
    throw new Error("L’export officiel ne contient pas de liste d’élèves.");
  }

  const studentNodes = asArray(studentsSection.ELEVE).map(asRecord);
  if (studentNodes.some((student) => !student)) {
    throw new Error("Une ligne élève de l’export officiel est invalide.");
  }

  const sourceStudents = (studentNodes as XmlRecord[]).map((node): SourceStudent => {
    const INE = childText(node, "ID_NATIONAL").toUpperCase();
    const name = childText(node, "NOM_DE_FAMILLE");
    const givenName = childText(node, "PRENOM");
    const birthDate = childText(node, "DATE_NAISS");
    const dateSortie = childText(node, "DATE_SORTIE");
    const technicalAttribute = attributeText(node, "ELENOET");
    const technicalField = childText(node, "ELENOET");

    if (technicalAttribute && technicalField && technicalAttribute !== technicalField) {
      throw new Error("Les identifiants techniques d’un élève sont incohérents.");
    }

    return {
      INE,
      NOM: name,
      PRENOM: givenName,
      ...(birthDate ? { dateNaissance: birthDate } : {}),
      sexCode: childText(node, "CODE_SEXE"),
      dateSortie,
      eleveId: attributeText(node, "ELEVE_ID"),
      elenoetKeys: [...new Set([technicalAttribute, technicalField].filter(Boolean))],
    };
  });

  const seenIne = new Set<string>();
  const byEleveId = new Map<string, number>();
  const byElenoet = new Map<string, number>();
  for (let index = 0; index < sourceStudents.length; index++) {
    const student = sourceStudents[index];
    if (student.INE) {
      if (seenIne.has(student.INE)) {
        throw new Error("Plusieurs élèves partagent le même INE dans cet export.");
      }
      seenIne.add(student.INE);
    }
    addUniqueIndex(byEleveId, student.eleveId, index, "ELEVE_ID");
    for (const key of student.elenoetKeys) addUniqueIndex(byElenoet, key, index, "ELENOET");
  }

  const structureAssignments = new Map<number, string>();
  const structuresSection = data ? asRecord(data.STRUCTURES) : undefined;
  const structureRows = asArray(structuresSection?.STRUCTURES_ELEVE).map(asRecord);
  if (structureRows.some((row) => !row)) {
    throw new Error("Une affectation de classe de l’export officiel est invalide.");
  }

  for (const row of structureRows as XmlRecord[]) {
    const eleveId = attributeText(row, "ELEVE_ID");
    const elenoet = attributeText(row, "ELENOET");
    if (!eleveId && !elenoet) {
      throw new Error("Une affectation de classe ne peut pas être reliée à un élève.");
    }

    const indexByEleveId = eleveId ? byEleveId.get(eleveId) : undefined;
    const indexByElenoet = elenoet ? byElenoet.get(elenoet) : undefined;
    if ((eleveId && indexByEleveId === undefined) || (elenoet && indexByElenoet === undefined)) {
      throw new Error("Une affectation de classe référence un élève absent de la liste.");
    }
    if (
      indexByEleveId !== undefined &&
      indexByElenoet !== undefined &&
      indexByEleveId !== indexByElenoet
    ) {
      throw new Error("Les identifiants d’une affectation de classe ne concordent pas.");
    }

    const studentIndex = indexByEleveId ?? indexByElenoet;
    if (studentIndex === undefined) continue;
    const classCode = structureCode(row);
    if (!classCode) continue;

    const previousClass = structureAssignments.get(studentIndex);
    if (previousClass !== undefined && previousClass !== classCode) {
      throw new Error("Un élève est affecté à plusieurs classes dans cet export.");
    }
    structureAssignments.set(studentIndex, classCode);
  }

  let excludedStudentCount = 0;
  let missingIneCount = 0;
  const students: StudentIdentity[] = [];
  const classCounts = new Map<string, number>();

  for (let index = 0; index < sourceStudents.length; index++) {
    const sourceStudent = sourceStudents[index];
    if (sourceStudent.dateSortie) {
      excludedStudentCount++;
      continue;
    }
    if (!sourceStudent.INE) {
      missingIneCount++;
      continue;
    }

    const classCode = structureAssignments.get(index) ?? NO_CLASS_CODE;
    const student: StudentIdentity = {
      INE: sourceStudent.INE,
      NOM: sourceStudent.NOM,
      PRENOM: sourceStudent.PRENOM,
      CLASSE: classCode,
      ...(sourceStudent.sexCode === "1"
        ? { SEXE: "g" as const }
        : sourceStudent.sexCode === "2"
          ? { SEXE: "f" as const }
          : {}),
      ...(sourceStudent.dateNaissance ? { dateNaissance: sourceStudent.dateNaissance } : {}),
    };
    students.push(student);
    classCounts.set(classCode, (classCounts.get(classCode) ?? 0) + 1);
  }

  const classes: OfficialStudentClass[] = [...classCounts]
    .map(([code, studentCount]) => ({
      code,
      studentCount,
      recommendedForBrevet: isThirdYearClass(code),
    }))
    .sort((left, right) => left.code.localeCompare(right.code, "fr", { numeric: true }));

  const schoolYear = parameters ? childText(parameters, "ANNEE_SCOLAIRE") : "";
  const schoolCode = parameters ? childText(parameters, "UAJ") : "";

  return {
    students,
    classes,
    ...(schoolYear ? { schoolYear } : {}),
    ...(schoolCode ? { schoolCode } : {}),
    excludedStudentCount,
    missingIneCount,
    sourceStudentCount: sourceStudents.length,
  };
};

export const parseOfficialStudentXml = (bytes: Uint8Array): OfficialStudentExport =>
  parseOfficialStudentXmlText(decodeXml(bytes));

const concatChunks = (chunks: Uint8Array[], byteLength: number): Uint8Array => {
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const extractXmlFromZip = (bytes: Uint8Array): Uint8Array => {
  let archiveEntryCount = 0;
  let xmlEntryCount = 0;
  let xmlBytes: Uint8Array | undefined;
  let extractionError: Error | undefined;
  let extractedLength = 0;
  let chunks: Uint8Array[] = [];

  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  unzipper.register(UnzipPassThrough);
  unzipper.onfile = (file) => {
    archiveEntryCount++;
    if (archiveEntryCount > MAX_ARCHIVE_ENTRIES) {
      throw new Error("L’archive contient trop d’éléments.");
    }

    const leafName = file.name.split(/[\\/]/).pop() ?? "";
    if (!leafName.toLowerCase().endsWith(".xml")) return;

    xmlEntryCount++;
    if (xmlEntryCount > 1) {
      extractionError = new Error("L’archive doit contenir exactement un fichier XML.");
      return;
    }
    if (file.size !== undefined && file.size > MAX_COMPRESSED_BYTES) {
      extractionError = new Error("Le fichier XML compressé dépasse la taille maximale de 20 Mo.");
      return;
    }
    if (file.originalSize !== undefined && file.originalSize > MAX_XML_BYTES) {
      extractionError = new Error("Le fichier XML dépasse la taille maximale de 20 Mo.");
      return;
    }

    file.ondata = (error, chunk, final) => {
      if (error) {
        extractionError = new Error("Le contenu de l’archive ZIP est invalide.");
        file.terminate();
        return;
      }
      if (extractedLength + chunk.byteLength > MAX_XML_BYTES) {
        extractionError = new Error("Le fichier XML dépasse la taille maximale de 20 Mo.");
        file.terminate();
        return;
      }
      chunks.push(chunk);
      extractedLength += chunk.byteLength;
      if (final) xmlBytes = concatChunks(chunks, extractedLength);
    };

    try {
      file.start();
    } catch {
      extractionError = new Error("Le contenu de l’archive ZIP est invalide ou non pris en charge.");
      file.terminate();
    }
  };

  try {
    unzipper.push(bytes, true);
  } catch {
    throw new Error("L’archive ZIP est invalide.");
  }

  if (extractionError) throw extractionError;
  if (xmlEntryCount !== 1 || !xmlBytes) {
    throw new Error("L’archive doit contenir exactement un fichier XML.");
  }
  return xmlBytes;
};

export const parseOfficialStudentFile = async (
  file: Pick<File, "name" | "arrayBuffer" | "size">,
): Promise<OfficialStudentExport> => {
  if (file.size > MAX_COMPRESSED_BYTES) {
    throw new Error("Le fichier dépasse la taille maximale de 20 Mo.");
  }

  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "xml" && extension !== "zip") {
    throw new Error("Choisissez un export officiel XML ou une archive ZIP qui le contient.");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error("Le fichier n’a pas pu être lu.");
  }
  if (bytes.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error("Le fichier dépasse la taille maximale de 20 Mo.");
  }

  return parseOfficialStudentXml(extension === "zip" ? extractXmlFromZip(bytes) : bytes);
};
