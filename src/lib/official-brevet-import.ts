export type OfficialBrevetField =
  | "serie"
  | "codeEtablissement"
  | "libelleEtablissement"
  | "communeEtablissement"
  | "division"
  | "categorieCandidat"
  | "numeroCandidat"
  | "ine"
  | "nom"
  | "prenom"
  | "dateNaissance"
  | "resultat"
  | "totalGeneral"
  | "moyenneFinale"
  | "moyenneControleContinu"
  | "moyenneEpreuvesTerminales"
  | "scoreFrancais"
  | "scoreMaths"
  | "scoreHistoireGeo"
  | "scoreEMC"
  | "scoreSciences"
  | "scoreFrancaisGrammaireComprehension"
  | "scoreFrancaisDictee"
  | "scoreFrancaisRedaction"
  | "scoreSciencesSvt"
  | "scoreSciencesPhysiqueChimie"
  | "scoreSciencesTechnologie"
  | "scoreOralDNB"
  | "scoreLVE"
  | "scoreArtsPlastiques"
  | "scoreEducationMusicale"
  | "scoreEPS"
  | "scorePhysiqueChimie"
  | "scoreSciencesVie";

const FIELD_ALIASES: Record<OfficialBrevetField, readonly string[]> = {
  serie: ["Série", "Serie"],
  codeEtablissement: ["Code Etablissement", "Code établissement"],
  libelleEtablissement: ["Libellé Etablissement", "Établissement", "Etablissement"],
  communeEtablissement: ["Commune Etablissement", "Commune établissement"],
  division: ["Division de classe", "Division", "Classe"],
  categorieCandidat: ["Catégorie candidat", "Categorie candidat"],
  numeroCandidat: ["Numéro Candidat", "N° candidat", "Numero candidat"],
  ine: ["INE"],
  nom: ["Nom candidat", "Nom", "Nom de famille"],
  prenom: ["Prénom candidat", "Prénom", "Prenom", "Prénom(s)", "Prenom(s)"],
  dateNaissance: ["Date de naissance"],
  resultat: ["Résultat", "Resultat", "Décision", "Decision"],
  totalGeneral: ["TOTAL GENERAL", "Total général", "Total general"],
  moyenneFinale: ["Moyenne sur 20", "Note finale /20", "Note finale"],
  moyenneControleContinu: [
    "Contrôle continu /20",
    "Controle continu /20",
    "Moyenne contrôle continu /20",
    "Contrôle continu",
    "Controle continu",
  ],
  moyenneEpreuvesTerminales: [
    "Épreuves terminales /20",
    "Epreuves terminales /20",
    "Moyenne épreuves terminales /20",
    "Épreuves terminales",
    "Epreuves terminales",
  ],
  scoreFrancais: ["001 - 1 - Français - Ponctuel", "Français /20", "Francais /20", "Français"],
  scoreMaths: ["002 - 1 - Mathématiques - Ponctuel", "Mathématiques /20", "Mathematiques /20", "Mathématiques"],
  scoreHistoireGeo: [
    "003 - 1 - Histoire, géographie, enseignement moral et civique - Ponctuel",
    "Histoire-géographie /20",
    "Histoire, géographie /20",
    "Histoire-Géographie /20",
    "Histoire-géographie",
    "Histoire, géographie",
  ],
  scoreEMC: ["EMC /20", "Enseignement moral et civique /20", "EMC", "Enseignement moral et civique"],
  scoreSciences: ["004 - 1 - Sciences - Ponctuel", "Sciences /20", "Sciences"],
  scoreFrancaisGrammaireComprehension: [
    "Grammaire et compréhension /50",
    "Grammaire et comprehension /50",
    "Grammaire et compréhension",
    "Grammaire et comprehension",
  ],
  scoreFrancaisDictee: ["Dictée /10", "Dictee /10", "Dictée", "Dictee"],
  scoreFrancaisRedaction: ["Rédaction /40", "Redaction /40", "Rédaction", "Redaction"],
  scoreSciencesSvt: [
    "SVT (sciences) /10",
    "SVT (sciences)",
    "Sciences de la vie de la Terre /10",
    "Sciences de la vie de la Terre",
  ],
  scoreSciencesPhysiqueChimie: [
    "Physique-chimie (sciences) /10",
    "Physique chimie (sciences) /10",
    "Physique-chimie (sciences)",
    "Physique chimie (sciences)",
  ],
  scoreSciencesTechnologie: [
    "Technologie (sciences) /10",
    "Technologie (sciences)",
  ],
  scoreOralDNB: [
    "005 - 1 - Soutenance orale de projet - Evaluation en cours d'année",
    "005 - 1 - Soutenance orale de projet - Évaluation en cours d'année",
    "Oral /20",
    "Soutenance orale /20",
    "Soutenance orale de projet /20",
    "Oral",
    "Soutenance orale",
    "Soutenance orale de projet",
  ],
  scoreLVE: ["007AB - 1 - Langues étrangères ou régionales - Contrôle continu"],
  scoreArtsPlastiques: ["007AD - 1 - Langages des arts et du corps - Contrôle continu"],
  scoreEducationMusicale: ["Edu Mus01A /50"],
  scoreEPS: ["EPS CCF01A /100"],
  scorePhysiqueChimie: ["Phy Chi01A /50"],
  scoreSciencesVie: ["Sci Vie01A /50"],
};

const COMMON_REQUIRED_FIELDS: readonly OfficialBrevetField[] = [
  "ine",
  "nom",
  "prenom",
  "resultat",
  "moyenneFinale",
];

const LEGACY_REQUIRED_SCORE_FIELDS: readonly OfficialBrevetField[] = [
  "scoreFrancais",
  "scoreMaths",
  "scoreHistoireGeo",
  "scoreSciences",
  "scoreOralDNB",
];

const POST_2026_REQUIRED_FIELDS: readonly OfficialBrevetField[] = [
  "moyenneControleContinu",
  "moyenneEpreuvesTerminales",
  "scoreFrancais",
  "scoreMaths",
  "scoreHistoireGeo",
  "scoreEMC",
  "scoreSciences",
  "scoreOralDNB",
];

const FIELD_LABELS: Record<OfficialBrevetField, string> = {
  serie: "Série",
  codeEtablissement: "Code établissement",
  libelleEtablissement: "Établissement",
  communeEtablissement: "Commune établissement",
  division: "Division",
  categorieCandidat: "Catégorie candidat",
  numeroCandidat: "N° candidat",
  ine: "INE",
  nom: "Nom",
  prenom: "Prénom(s)",
  dateNaissance: "Date de naissance",
  resultat: "Décision",
  totalGeneral: "Total général",
  moyenneFinale: "Note finale /20",
  moyenneControleContinu: "Contrôle continu /20",
  moyenneEpreuvesTerminales: "Épreuves terminales /20",
  scoreFrancais: "Français /20",
  scoreMaths: "Mathématiques /20",
  scoreHistoireGeo: "Histoire-géographie /20",
  scoreEMC: "EMC /20",
  scoreSciences: "Sciences /20",
  scoreFrancaisGrammaireComprehension: "Grammaire et compréhension /50",
  scoreFrancaisDictee: "Dictée /10",
  scoreFrancaisRedaction: "Rédaction /40",
  scoreSciencesSvt: "SVT (sciences) /10",
  scoreSciencesPhysiqueChimie: "Physique-chimie (sciences) /10",
  scoreSciencesTechnologie: "Technologie (sciences) /10",
  scoreOralDNB: "Oral /20",
  scoreLVE: "Langues vivantes",
  scoreArtsPlastiques: "Arts plastiques",
  scoreEducationMusicale: "Éducation musicale",
  scoreEPS: "EPS",
  scorePhysiqueChimie: "Physique-chimie",
  scoreSciencesVie: "SVT",
};

export const normalizeOfficialBrevetHeader = (header: unknown): string =>
  String(header ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normalizedAliases = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [
    field,
    aliases.map(normalizeOfficialBrevetHeader),
  ]),
) as Record<OfficialBrevetField, string[]>;

const indexRow = (row: Record<string, unknown>): Map<string, unknown> =>
  new Map(Object.entries(row).map(([header, value]) => [normalizeOfficialBrevetHeader(header), value]));

export const readOfficialBrevetField = (
  row: Record<string, unknown>,
  field: OfficialBrevetField,
): unknown => {
  const indexed = indexRow(row);
  for (const alias of normalizedAliases[field]) {
    if (indexed.has(alias)) return indexed.get(alias);
  }
  return undefined;
};

export const hasOfficialBrevetField = (
  headers: readonly string[],
  field: OfficialBrevetField,
): boolean => {
  const normalizedHeaders = new Set(headers.map(normalizeOfficialBrevetHeader));
  return normalizedAliases[field].some((alias) => normalizedHeaders.has(alias));
};

export const getMissingOfficialBrevetHeaders = (
  headers: readonly string[],
  importYear: string,
): string[] => {
  const numericYear = Number.parseInt(importYear, 10);
  const scoreFields = numericYear >= 2026 ? POST_2026_REQUIRED_FIELDS : LEGACY_REQUIRED_SCORE_FIELDS;
  return [...COMMON_REQUIRED_FIELDS, ...scoreFields]
    .filter((field, index, fields) => fields.indexOf(field) === index)
    .filter((field) => !hasOfficialBrevetField(headers, field))
    .map((field) => FIELD_LABELS[field]);
};

const hasImportValue = (value: unknown): boolean =>
  value !== undefined && value !== null && String(value).trim() !== "";

export const getMissingOfficialBrevetRowValues = (
  row: Record<string, unknown>,
  importYear: string,
): string[] => {
  const numericYear = Number.parseInt(importYear, 10);
  const scoreFields = numericYear >= 2026 ? POST_2026_REQUIRED_FIELDS : LEGACY_REQUIRED_SCORE_FIELDS;
  return [...COMMON_REQUIRED_FIELDS, ...scoreFields]
    .filter((field, index, fields) => fields.indexOf(field) === index)
    .filter((field) => !hasImportValue(readOfficialBrevetField(row, field)))
    .map((field) => FIELD_LABELS[field]);
};

export const isPost2026OfficialBrevet = (importYear: string | number): boolean => {
  const numericYear = typeof importYear === "number" ? importYear : Number.parseInt(importYear, 10);
  return Number.isFinite(numericYear) && numericYear >= 2026;
};
