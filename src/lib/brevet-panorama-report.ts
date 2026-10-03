import type { ProcessedStudentData } from "@/contexts/FilterContext";
import type { BrevetPanoramaPdfStats } from "@/lib/brevet-panorama-export";

export interface BrevetPanoramaCoverage {
  totalStudents: number;
  studentsWithClass: number;
  officialClassCount: number;
  brevetBlancClassCount: number;
  studentsWithoutClass: number;
  classCoverageRate: number;
  studentsWithBrevetBlancScores: number;
}

export interface BrevetPanoramaClassRow {
  className: string;
  totalStudents: number;
  girls: number;
  boys: number;
  genderKnown: number;
  scholarshipKnown: number;
  scholarshipYes: number;
  admis: number;
  refuse: number;
  successRate?: number;
  averageDnb?: number;
  averageControleContinu?: number;
  averageEpreuvesTerminales?: number;
  averageFrancais?: number;
  averageMaths?: number;
  averageHistoireGeoEmc?: number;
  averageSciences?: number;
  averageGrammaireComprehension?: number;
  averageDictee?: number;
  averageRedaction?: number;
  averageSciencesSvt?: number;
  averageSciencesPhysiqueChimie?: number;
  averageSciencesTechnologie?: number;
  averageBb1?: number;
  averageBb2?: number;
  averageDeltaBb2Dnb?: number;
  matchedBbCount: number;
}

export interface BrevetPanoramaSubjectRow {
  subject: string;
  coefficient?: string;
  count: number;
  average?: number;
  minimum?: number;
  maximum?: number;
}

export type BrevetPanoramaSubscore = number | "Absent" | "Dispensé";

export interface BrevetPanoramaStudentRow {
  id: string;
  ine: string;
  lastName: string;
  firstName: string;
  sex?: "Fille" | "Garçon";
  scholarship?: boolean;
  rank?: number;
  formerClass?: string;
  classSource?: string;
  serie?: string;
  result?: string;
  averageDnb?: number;
  controleContinu?: number;
  epreuvesTerminales?: number;
  francais?: number;
  maths?: number;
  histoireGeo?: number;
  emc?: number;
  histoireGeoEmc?: number;
  sciences?: number;
  grammaireComprehension?: BrevetPanoramaSubscore;
  dictee?: BrevetPanoramaSubscore;
  redaction?: BrevetPanoramaSubscore;
  sciencesSvt?: BrevetPanoramaSubscore;
  sciencesPhysiqueChimie?: BrevetPanoramaSubscore;
  sciencesTechnologie?: BrevetPanoramaSubscore;
  oral?: number;
  averageBb1?: number;
  averageBb2?: number;
  deltaBb2Dnb?: number;
}

export interface BrevetPanoramaGroupStats {
  totalStudents: number;
  averageCount: number;
  decidedCount: number;
  admis: number;
  refuse: number;
  successRate?: number;
  averageDnb?: number;
  averageBb1?: number;
  averageBb2?: number;
  averageDeltaBb2Dnb?: number;
}

export interface BrevetPanoramaComparisonRow {
  subject: string;
  groupACount: number;
  groupAAverage?: number;
  groupBCount: number;
  groupBAverage?: number;
  gap?: number;
}

export interface BrevetPanoramaBreakdown {
  groupA: BrevetPanoramaGroupStats;
  groupB: BrevetPanoramaGroupStats;
  specifiedCount: number;
  unspecifiedCount: number;
  averageGap?: number;
  successRateGap?: number;
  subjectRows: BrevetPanoramaComparisonRow[];
}

export interface BrevetPanoramaClassDetail {
  className: string;
  summary: BrevetPanoramaClassRow;
  alphabeticalRows: BrevetPanoramaStudentRow[];
  rankedRows: BrevetPanoramaStudentRow[];
}

export interface BrevetPanoramaSubsubject {
  studentKey: "grammaireComprehension" | "dictee" | "redaction" | "sciencesSvt" | "sciencesPhysiqueChimie" | "sciencesTechnologie";
  classKey: "averageGrammaireComprehension" | "averageDictee" | "averageRedaction" | "averageSciencesSvt" | "averageSciencesPhysiqueChimie" | "averageSciencesTechnologie";
  label: string;
  shortLabel: string;
  maxScore: 10 | 40 | 50;
  group: "francais" | "sciences";
}

const SUBSUBJECTS: readonly BrevetPanoramaSubsubject[] = [
  { studentKey: "grammaireComprehension", classKey: "averageGrammaireComprehension", label: "Grammaire et compréhension", shortLabel: "Grammaire", maxScore: 50, group: "francais" },
  { studentKey: "dictee", classKey: "averageDictee", label: "Dictée", shortLabel: "Dictée", maxScore: 10, group: "francais" },
  { studentKey: "redaction", classKey: "averageRedaction", label: "Rédaction", shortLabel: "Rédaction", maxScore: 40, group: "francais" },
  { studentKey: "sciencesSvt", classKey: "averageSciencesSvt", label: "SVT", shortLabel: "SVT", maxScore: 10, group: "sciences" },
  { studentKey: "sciencesPhysiqueChimie", classKey: "averageSciencesPhysiqueChimie", label: "Physique-chimie", shortLabel: "Phys.-chimie", maxScore: 10, group: "sciences" },
  { studentKey: "sciencesTechnologie", classKey: "averageSciencesTechnologie", label: "Technologie", shortLabel: "Technologie", maxScore: 10, group: "sciences" },
];

export interface BrevetPanoramaReportData {
  yearLabel: string;
  stats: BrevetPanoramaPdfStats;
  coverage: BrevetPanoramaCoverage;
  classRows: BrevetPanoramaClassRow[];
  subjectRows: BrevetPanoramaSubjectRow[];
  genderBreakdown: BrevetPanoramaBreakdown;
  scholarshipBreakdown: BrevetPanoramaBreakdown;
  top10: BrevetPanoramaStudentRow[];
  studentRows: BrevetPanoramaStudentRow[];
  alphabeticalRows: BrevetPanoramaStudentRow[];
  rankedRows: BrevetPanoramaStudentRow[];
  classDetails: BrevetPanoramaClassDetail[];
  subsubjects: BrevetPanoramaSubsubject[];
}

const normalizeText = (value: string | undefined): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const numericSubscore = (value: BrevetPanoramaSubscore | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const frenchCollator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const normalizeSex = (value: string | undefined): "Fille" | "Garçon" | undefined => {
  const normalized = normalizeText(value).trim();
  if (["f", "fille", "feminin", "feminine"].includes(normalized)) return "Fille";
  if (["g", "garcon", "m", "masculin", "masculine"].includes(normalized)) return "Garçon";
  return undefined;
};

const average = (values: Array<number | undefined>): number | undefined => {
  const definedValues = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  if (definedValues.length === 0) return undefined;
  return definedValues.reduce((sum, value) => sum + value, 0) / definedValues.length;
};

const round = (value: number | undefined, digits = 2): number | undefined => {
  if (value === undefined) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const isAdmitted = (result: string | undefined): boolean =>
  normalizeText(result).includes("admis");

const isRefused = (result: string | undefined): boolean =>
  normalizeText(result).includes("refuse");

const compareAlphabetically = (
  left: BrevetPanoramaStudentRow,
  right: BrevetPanoramaStudentRow,
): number =>
  frenchCollator.compare(left.lastName, right.lastName) ||
  frenchCollator.compare(left.firstName, right.firstName) ||
  frenchCollator.compare(left.formerClass ?? "", right.formerClass ?? "") ||
  frenchCollator.compare(left.ine, right.ine);

const rankByAverage = (rows: BrevetPanoramaStudentRow[]): BrevetPanoramaStudentRow[] => {
  const sorted = [...rows].sort((left, right) => {
    const leftAverage = left.averageDnb !== undefined && Number.isFinite(left.averageDnb) ? left.averageDnb : undefined;
    const rightAverage = right.averageDnb !== undefined && Number.isFinite(right.averageDnb) ? right.averageDnb : undefined;
    if (leftAverage === undefined) return rightAverage === undefined ? compareAlphabetically(left, right) : 1;
    if (rightAverage === undefined) return -1;
    return rightAverage - leftAverage || compareAlphabetically(left, right);
  });

  let previousAverage: number | undefined;
  let previousRank = 0;
  return sorted.map((row, index) => {
    if (row.averageDnb === undefined || !Number.isFinite(row.averageDnb)) return { ...row, rank: undefined };
    if (row.averageDnb !== previousAverage) {
      previousAverage = row.averageDnb;
      previousRank = index + 1;
    }
    return { ...row, rank: previousRank };
  });
};

const buildStudentRow = (student: ProcessedStudentData): BrevetPanoramaStudentRow => ({
  id: student.id,
  ine: student.ine,
  lastName: student.nom,
  firstName: student.prenom,
  sex: normalizeSex(student.sexe),
  scholarship: student.isBoursier,
  formerClass: student.formerClass,
  classSource:
    student.formerClassSource === "official"
      ? "Résultats officiels"
      : student.formerClassSource === "brevetBlanc"
        ? "Liste brevet blanc (INE)"
        : undefined,
  serie: student.serieType,
  result: student.resultat,
  averageDnb: student.moyenne !== undefined && Number.isFinite(student.moyenne) ? student.moyenne : undefined,
  controleContinu: student.noteControleContinu,
  epreuvesTerminales: student.noteEpreuvesTerminales,
  francais: student.scoreFrancais,
  maths: student.scoreMaths,
  histoireGeo: student.scoreHistoireGeoSeul ?? student.scoreHistoireGeo,
  emc: student.scoreEMC,
  histoireGeoEmc: student.scoreHistoireGeo,
  sciences: student.scoreSciences,
  grammaireComprehension: student.scoreFrancaisGrammaireComprehension,
  dictee: student.scoreFrancaisDictee,
  redaction: student.scoreFrancaisRedaction,
  sciencesSvt: student.scoreSciencesSvt,
  sciencesPhysiqueChimie: student.scoreSciencesPhysiqueChimie,
  sciencesTechnologie: student.scoreSciencesTechnologie,
  oral: student.scoreOralDNB,
  averageBb1: student.brevetBlancBb1Average,
  averageBb2: student.brevetBlancBb2Average,
  deltaBb2Dnb:
    student.moyenne !== undefined && student.brevetBlancBb2Average !== undefined
      ? student.moyenne - student.brevetBlancBb2Average
      : undefined,
});

const buildClassRow = (
  className: string,
  rows: BrevetPanoramaStudentRow[],
): BrevetPanoramaClassRow => {
  const admitted = rows.filter((row) => isAdmitted(row.result)).length;
  const refused = rows.filter((row) => isRefused(row.result)).length;
  const considered = admitted + refused;
  const matchedBbRows = rows.filter(
    (row) => row.averageBb1 !== undefined || row.averageBb2 !== undefined,
  );

  return {
    className,
    totalStudents: rows.length,
    girls: rows.filter((row) => row.sex === "Fille").length,
    boys: rows.filter((row) => row.sex === "Garçon").length,
    genderKnown: rows.filter((row) => row.sex !== undefined).length,
    scholarshipKnown: rows.filter((row) => row.scholarship !== undefined).length,
    scholarshipYes: rows.filter((row) => row.scholarship === true).length,
    admis: admitted,
    refuse: refused,
    successRate: considered > 0 ? round((admitted / considered) * 100, 1) : undefined,
    averageDnb: round(average(rows.map((row) => row.averageDnb))),
    averageControleContinu: round(average(rows.map((row) => row.controleContinu))),
    averageEpreuvesTerminales: round(average(rows.map((row) => row.epreuvesTerminales))),
    averageFrancais: round(average(rows.map((row) => row.francais))),
    averageMaths: round(average(rows.map((row) => row.maths))),
    averageHistoireGeoEmc: round(average(rows.map((row) => row.histoireGeoEmc))),
    averageSciences: round(average(rows.map((row) => row.sciences))),
    averageGrammaireComprehension: round(average(rows.map((row) => numericSubscore(row.grammaireComprehension)))),
    averageDictee: round(average(rows.map((row) => numericSubscore(row.dictee)))),
    averageRedaction: round(average(rows.map((row) => numericSubscore(row.redaction)))),
    averageSciencesSvt: round(average(rows.map((row) => numericSubscore(row.sciencesSvt)))),
    averageSciencesPhysiqueChimie: round(average(rows.map((row) => numericSubscore(row.sciencesPhysiqueChimie)))),
    averageSciencesTechnologie: round(average(rows.map((row) => numericSubscore(row.sciencesTechnologie)))),
    averageBb1: round(average(rows.map((row) => row.averageBb1))),
    averageBb2: round(average(rows.map((row) => row.averageBb2))),
    averageDeltaBb2Dnb: round(average(rows.map((row) => row.deltaBb2Dnb))),
    matchedBbCount: matchedBbRows.length,
  };
};

const buildSubjectRow = (
  subject: string,
  coefficient: string | undefined,
  values: Array<number | undefined>,
): BrevetPanoramaSubjectRow | undefined => {
  const definedValues = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  if (definedValues.length === 0) return undefined;

  return {
    subject,
    coefficient,
    count: definedValues.length,
    average: round(average(definedValues)),
    minimum: round(Math.min(...definedValues)),
    maximum: round(Math.max(...definedValues)),
  };
};

const buildGroupStats = (rows: BrevetPanoramaStudentRow[]): BrevetPanoramaGroupStats => {
  const admis = rows.filter((row) => isAdmitted(row.result)).length;
  const refuse = rows.filter((row) => isRefused(row.result)).length;
  const decidedCount = admis + refuse;
  const averageCount = rows.filter(
    (row) => row.averageDnb !== undefined && Number.isFinite(row.averageDnb),
  ).length;

  return {
    totalStudents: rows.length,
    averageCount,
    decidedCount,
    admis,
    refuse,
    successRate: decidedCount > 0 ? round((admis / decidedCount) * 100, 1) : undefined,
    averageDnb: round(average(rows.map((row) => row.averageDnb))),
    averageBb1: round(average(rows.map((row) => row.averageBb1))),
    averageBb2: round(average(rows.map((row) => row.averageBb2))),
    averageDeltaBb2Dnb: round(average(rows.map((row) => row.deltaBb2Dnb))),
  };
};

const comparisonSubjects: Array<{
  label: string;
  value: (row: BrevetPanoramaStudentRow) => number | undefined;
}> = [
  { label: "Moyenne finale DNB", value: (row) => row.averageDnb },
  { label: "Contrôle continu", value: (row) => row.controleContinu },
  { label: "Épreuves terminales", value: (row) => row.epreuvesTerminales },
  { label: "Français", value: (row) => row.francais },
  { label: "Grammaire et compréhension /50", value: (row) => numericSubscore(row.grammaireComprehension) },
  { label: "Dictée /10", value: (row) => numericSubscore(row.dictee) },
  { label: "Rédaction /40", value: (row) => numericSubscore(row.redaction) },
  { label: "Mathématiques", value: (row) => row.maths },
  { label: "Histoire-Géographie", value: (row) => row.histoireGeo },
  { label: "Enseignement moral et civique", value: (row) => row.emc },
  { label: "Sciences", value: (row) => row.sciences },
  { label: "SVT (sciences) /10", value: (row) => numericSubscore(row.sciencesSvt) },
  { label: "Physique-chimie (sciences) /10", value: (row) => numericSubscore(row.sciencesPhysiqueChimie) },
  { label: "Technologie (sciences) /10", value: (row) => numericSubscore(row.sciencesTechnologie) },
  { label: "Oral", value: (row) => row.oral },
  { label: "Moyenne brevet blanc 1", value: (row) => row.averageBb1 },
  { label: "Moyenne brevet blanc 2", value: (row) => row.averageBb2 },
  { label: "Écart BB2 vers DNB", value: (row) => row.deltaBb2Dnb },
];

const buildComparisonBreakdown = (
  rows: BrevetPanoramaStudentRow[],
  classify: (row: BrevetPanoramaStudentRow) => "A" | "B" | undefined,
): BrevetPanoramaBreakdown => {
  const groupA: BrevetPanoramaStudentRow[] = [];
  const groupB: BrevetPanoramaStudentRow[] = [];
  rows.forEach((row) => {
    const group = classify(row);
    if (group === "A") groupA.push(row);
    if (group === "B") groupB.push(row);
  });

  const statsA = buildGroupStats(groupA);
  const statsB = buildGroupStats(groupB);
  const subjectRows = comparisonSubjects.flatMap(({ label, value }) => {
    const valuesA = groupA.map(value).filter((score): score is number => score !== undefined && Number.isFinite(score));
    const valuesB = groupB.map(value).filter((score): score is number => score !== undefined && Number.isFinite(score));
    if (valuesA.length === 0 && valuesB.length === 0) return [];
    const averageA = round(average(valuesA));
    const averageB = round(average(valuesB));
    return [{
      subject: label,
      groupACount: valuesA.length,
      groupAAverage: averageA,
      groupBCount: valuesB.length,
      groupBAverage: averageB,
      gap: averageA !== undefined && averageB !== undefined ? round(averageA - averageB) : undefined,
    }];
  });

  return {
    groupA: statsA,
    groupB: statsB,
    specifiedCount: groupA.length + groupB.length,
    unspecifiedCount: rows.length - groupA.length - groupB.length,
    averageGap: statsA.averageDnb !== undefined && statsB.averageDnb !== undefined
      ? round(statsA.averageDnb - statsB.averageDnb)
      : undefined,
    successRateGap: statsA.successRate !== undefined && statsB.successRate !== undefined
      ? round(statsA.successRate - statsB.successRate, 1)
      : undefined,
    subjectRows,
  };
};

const getSessionYear = (yearLabel: string): number | undefined => {
  const matches = yearLabel.match(/\b(?:19|20)\d{2}\b/g);
  const lastMatch = matches?.[matches.length - 1];
  return lastMatch ? Number(lastMatch) : undefined;
};

export function buildBrevetPanoramaReportData(
  students: ProcessedStudentData[],
  yearLabel: string,
  stats: BrevetPanoramaPdfStats,
): BrevetPanoramaReportData {
  const studentRows = students
    .map(buildStudentRow)
    .sort((a, b) =>
      frenchCollator.compare(a.formerClass ?? "ZZZ", b.formerClass ?? "ZZZ") ||
      compareAlphabetically(a, b),
    );

  const alphabeticalRows = [...studentRows].sort(compareAlphabetically);
  const rankedRows = rankByAverage(studentRows);

  const classGroups = new Map<string, BrevetPanoramaStudentRow[]>();
  studentRows.forEach((student) => {
    if (!student.formerClass) return;
    const currentRows = classGroups.get(student.formerClass) ?? [];
    currentRows.push(student);
    classGroups.set(student.formerClass, currentRows);
  });

  const classRows = Array.from(classGroups.entries())
    .map(([className, rows]) => buildClassRow(className, rows))
    .sort((a, b) => frenchCollator.compare(a.className, b.className));
  const classDetails = classRows.map((summary) => {
    const rows = classGroups.get(summary.className) ?? [];
    return {
      className: summary.className,
      summary,
      alphabeticalRows: [...rows].sort(compareAlphabetically),
      rankedRows: rankByAverage(rows),
    };
  });

  const studentsWithClass = studentRows.filter((student) => student.formerClass).length;
  const officialClassCount = students.filter(
    (student) => student.formerClassSource === "official" && student.formerClass,
  ).length;
  const brevetBlancClassCount = students.filter(
    (student) => student.formerClassSource === "brevetBlanc" && student.formerClass,
  ).length;
  const studentsWithBrevetBlancScores = studentRows.filter(
    (student) => student.averageBb1 !== undefined || student.averageBb2 !== undefined,
  ).length;
  const sessionYear = getSessionYear(yearLabel);
  const isPost2026 = sessionYear !== undefined && sessionYear >= 2026;
  const subsubjects = SUBSUBJECTS.filter((subject) =>
    studentRows.some((row) => row[subject.studentKey] !== undefined),
  );
  const frenchSubsubjects = subsubjects.filter((subject) => subject.group === "francais");
  const scienceSubsubjects = subsubjects.filter((subject) => subject.group === "sciences");

  const subjectRows = [
    buildSubjectRow("Français", isPost2026 ? "2" : undefined, studentRows.map((row) => row.francais)),
    ...frenchSubsubjects.map((subject) =>
      buildSubjectRow(`${subject.label} /${subject.maxScore}`, undefined, studentRows.map((row) => numericSubscore(row[subject.studentKey]))),
    ),
    buildSubjectRow("Mathématiques", isPost2026 ? "2" : undefined, studentRows.map((row) => row.maths)),
    buildSubjectRow("Histoire-Géographie", isPost2026 ? "1,5" : undefined, studentRows.map((row) => row.histoireGeo)),
    buildSubjectRow("Enseignement moral et civique", isPost2026 ? "0,5" : undefined, studentRows.map((row) => row.emc)),
    buildSubjectRow("Histoire-Géo + EMC pondérés", undefined, studentRows.map((row) => row.histoireGeoEmc)),
    buildSubjectRow("Sciences", isPost2026 ? "2" : undefined, studentRows.map((row) => row.sciences)),
    ...scienceSubsubjects.map((subject) =>
      buildSubjectRow(`${subject.label} (sciences) /${subject.maxScore}`, undefined, studentRows.map((row) => numericSubscore(row[subject.studentKey]))),
    ),
    buildSubjectRow("Oral", isPost2026 ? "2" : undefined, studentRows.map((row) => row.oral)),
    buildSubjectRow("Contrôle continu", isPost2026 ? "40 %" : undefined, studentRows.map((row) => row.controleContinu)),
    buildSubjectRow("Épreuves terminales", isPost2026 ? "60 %" : undefined, studentRows.map((row) => row.epreuvesTerminales)),
    buildSubjectRow("Moyenne finale DNB", undefined, studentRows.map((row) => row.averageDnb)),
  ].filter((row): row is BrevetPanoramaSubjectRow => row !== undefined);

  const top10 = rankedRows.filter((student) => student.averageDnb !== undefined).slice(0, 10);
  const genderBreakdown = buildComparisonBreakdown(
    studentRows,
    (row) => row.sex === "Fille" ? "A" : row.sex === "Garçon" ? "B" : undefined,
  );
  const scholarshipBreakdown = buildComparisonBreakdown(
    studentRows,
    (row) => row.scholarship === true ? "A" : row.scholarship === false ? "B" : undefined,
  );

  return {
    yearLabel,
    stats,
    coverage: {
      totalStudents: students.length,
      studentsWithClass,
      officialClassCount,
      brevetBlancClassCount,
      studentsWithoutClass: students.length - studentsWithClass,
      classCoverageRate:
        students.length > 0 ? round((studentsWithClass / students.length) * 100, 1) ?? 0 : 0,
      studentsWithBrevetBlancScores,
    },
    classRows,
    classDetails,
    subjectRows,
    genderBreakdown,
    scholarshipBreakdown,
    top10,
    studentRows,
    alphabeticalRows,
    rankedRows,
    subsubjects,
  };
}
