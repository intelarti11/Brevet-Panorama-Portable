import {
  calculateBrevetBlancAverage,
  getBrevetConfigForYear,
  type BrevetConfig,
} from "@/lib/brevet-config";
import { normalizeClassName } from "@/lib/student-class";

export interface StudentNote {
  bb1?: number;
  bb2?: number;
}

export interface StudentNotesBySubject {
  [subject: string]: StudentNote;
}

export interface BrevetBlancPanoramaStudent {
  id: string;
  NOM?: string;
  PRENOM?: string;
  CLASSE?: string;
  SEXE?: string;
  isBoursier?: boolean;
  notes?: StudentNotesBySubject;
}

export interface ScoreDistribution {
  gte15: number;
  gte10lt15: number;
  gte8lt10: number;
  lt8: number;
  count: number;
}

export interface SubjectAverages {
  subject: string;
  averageBb1?: number;
  averageBb2?: number;
}

export interface PanoramaGenderStats {
  totalStudents: number;
  participationBb1: number;
  participationBb2: number;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  successRateBb1?: number;
  successRateBb2?: number;
}

export interface PanoramaGenderGapStats {
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  successRateBb1?: number;
  successRateBb2?: number;
}

export interface PanoramaGenderSubjectComparisonRow {
  subject: string;
  fillesParticipationBb1: number;
  fillesAverageBb1?: number;
  garconsParticipationBb1: number;
  garconsAverageBb1?: number;
  gapBb1?: number;
  fillesParticipationBb2: number;
  fillesAverageBb2?: number;
  garconsParticipationBb2: number;
  garconsAverageBb2?: number;
  gapBb2?: number;
}

export interface PanoramaScholarshipStats {
  totalStudents: number;
  participationBb1: number;
  participationBb2: number;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  successRateBb1?: number;
  successRateBb2?: number;
}

export interface PanoramaScholarshipGapStats {
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  successRateBb1?: number;
  successRateBb2?: number;
}

export interface PanoramaScholarshipSubjectComparisonRow {
  subject: string;
  boursiersParticipationBb1: number;
  boursiersAverageBb1?: number;
  nonBoursiersParticipationBb1: number;
  nonBoursiersAverageBb1?: number;
  gapBb1?: number;
  boursiersParticipationBb2: number;
  boursiersAverageBb2?: number;
  nonBoursiersParticipationBb2: number;
  nonBoursiersAverageBb2?: number;
  gapBb2?: number;
}

export interface PanoramaGenderBreakdown {
  filles: PanoramaGenderStats;
  garcons: PanoramaGenderStats;
  specifiedCount: number;
  unspecifiedCount: number;
  overallGaps: PanoramaGenderGapStats;
  subjectRows: PanoramaGenderSubjectComparisonRow[];
}

export interface PanoramaScholarshipBreakdown {
  boursiers: PanoramaScholarshipStats;
  nonBoursiers: PanoramaScholarshipStats;
  specifiedCount: number;
  overallGaps: PanoramaScholarshipGapStats;
  subjectRows: PanoramaScholarshipSubjectComparisonRow[];
}

export interface PanoramaStats {
  totalStudents: number;
  averageBb1?: number;
  averageBb2?: number;
  participationBb1: number;
  participationBb2: number;
  genderBreakdown: PanoramaGenderBreakdown;
  scholarshipBreakdown: PanoramaScholarshipBreakdown;
  subjectAverages: SubjectAverages[];
  overallDistributionBb1: ScoreDistribution;
  overallDistributionBb2: ScoreDistribution;
  distributionBySubjectBb1: {[subject: string]: ScoreDistribution};
  distributionBySubjectBb2: {[subject: string]: ScoreDistribution};
}

export interface PanoramaClassReportRow {
  className: string;
  totalStudents: number;
  participationBb1: number;
  participationBb2: number;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
}

export interface PanoramaSubjectReportRow {
  subject: string;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  participationBb1: number;
  participationBb2: number;
}

export interface PanoramaRankingRow {
  rank: number;
  id: string;
  lastName: string;
  firstName: string;
  className: string;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
}

export interface PanoramaClassDetailStudentRow {
  id: string;
  lastName: string;
  firstName: string;
  className: string;
  averageBb1?: number;
  averageBb2?: number;
  progression?: number;
  subjectScores: {
    [subject: string]: {
      bb1?: number;
      bb2?: number;
    };
  };
}

export interface PanoramaClassDetail {
  className: string;
  summary: PanoramaClassReportRow;
  students: PanoramaClassDetailStudentRow[];
}

export interface PanoramaHighlight {
  label: string;
  value: string;
}

export interface BrevetBlancPanoramaReportData {
  year: string;
  config: BrevetConfig;
  stats: PanoramaStats;
  highlights: PanoramaHighlight[];
  classRows: PanoramaClassReportRow[];
  subjectRows: PanoramaSubjectReportRow[];
  top10Bb1: PanoramaRankingRow[];
  top10Bb2: PanoramaRankingRow[];
  top10Progression: PanoramaRankingRow[];
  classDetails: PanoramaClassDetail[];
}

interface SubjectAccumulator {
  bb1Total: number;
  bb1Count: number;
  bb2Total: number;
  bb2Count: number;
}

interface ClassAccumulator {
  className: string;
  totalStudents: number;
  bb1Total: number;
  bb1Count: number;
  bb2Total: number;
  bb2Count: number;
  students: PanoramaClassDetailStudentRow[];
}

interface GenderAccumulator {
  totalStudents: number;
  bb1Total: number;
  bb1Count: number;
  bb1SuccessCount: number;
  bb2Total: number;
  bb2Count: number;
  bb2SuccessCount: number;
}

interface GenderSubjectAccumulator {
  bb1Total: number;
  bb1Count: number;
  bb2Total: number;
  bb2Count: number;
}

interface ScholarshipAccumulator {
  totalStudents: number;
  bb1Total: number;
  bb1Count: number;
  bb1SuccessCount: number;
  bb2Total: number;
  bb2Count: number;
  bb2SuccessCount: number;
}

interface ScholarshipSubjectAccumulator {
  bb1Total: number;
  bb1Count: number;
  bb2Total: number;
  bb2Count: number;
}

function createEmptyScoreDistribution(): ScoreDistribution {
  return {
    gte15: 0,
    gte10lt15: 0,
    gte8lt10: 0,
    lt8: 0,
    count: 0,
  };
}

function createEmptyPanoramaGenderStats(): PanoramaGenderStats {
  return {
    totalStudents: 0,
    participationBb1: 0,
    participationBb2: 0,
    averageBb1: undefined,
    averageBb2: undefined,
    progression: undefined,
    successRateBb1: undefined,
    successRateBb2: undefined,
  };
}

function createEmptyPanoramaGenderGapStats(): PanoramaGenderGapStats {
  return {
    averageBb1: undefined,
    averageBb2: undefined,
    progression: undefined,
    successRateBb1: undefined,
    successRateBb2: undefined,
  };
}

function createEmptyPanoramaScholarshipStats(): PanoramaScholarshipStats {
  return {
    totalStudents: 0,
    participationBb1: 0,
    participationBb2: 0,
    averageBb1: undefined,
    averageBb2: undefined,
    progression: undefined,
    successRateBb1: undefined,
    successRateBb2: undefined,
  };
}

function createEmptyPanoramaScholarshipGapStats(): PanoramaScholarshipGapStats {
  return {
    averageBb1: undefined,
    averageBb2: undefined,
    progression: undefined,
    successRateBb1: undefined,
    successRateBb2: undefined,
  };
}

export function createEmptyPanoramaStats(): PanoramaStats {
  return {
    totalStudents: 0,
    averageBb1: undefined,
    averageBb2: undefined,
    participationBb1: 0,
    participationBb2: 0,
    genderBreakdown: {
      filles: createEmptyPanoramaGenderStats(),
      garcons: createEmptyPanoramaGenderStats(),
      specifiedCount: 0,
      unspecifiedCount: 0,
      overallGaps: createEmptyPanoramaGenderGapStats(),
      subjectRows: [],
    },
    scholarshipBreakdown: {
      boursiers: createEmptyPanoramaScholarshipStats(),
      nonBoursiers: createEmptyPanoramaScholarshipStats(),
      specifiedCount: 0,
      overallGaps: createEmptyPanoramaScholarshipGapStats(),
      subjectRows: [],
    },
    subjectAverages: [],
    overallDistributionBb1: createEmptyScoreDistribution(),
    overallDistributionBb2: createEmptyScoreDistribution(),
    distributionBySubjectBb1: {},
    distributionBySubjectBb2: {},
  };
}

function toScoreOutOf20(
  score: number | undefined,
  maxScore: number
): number | undefined {
  if (score === undefined || score === null || Number.isNaN(score) || maxScore <= 0) {
    return undefined;
  }

  return (score / maxScore) * 20;
}

function categorizeScore(scoreOutOf20: number, distribution: ScoreDistribution) {
  if (scoreOutOf20 >= 15) {
    distribution.gte15++;
  } else if (scoreOutOf20 >= 10) {
    distribution.gte10lt15++;
  } else if (scoreOutOf20 >= 8) {
    distribution.gte8lt10++;
  } else {
    distribution.lt8++;
  }
  distribution.count++;
}

function compareClassNames(left: string, right: string): number {
  return left.localeCompare(right, "fr", {numeric: true, sensitivity: "base"});
}

function normalizeSexeValue(value: string | undefined): "f" | "g" | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!normalized) {
    return undefined;
  }

  if (["f", "fille", "feminin", "feminine"].includes(normalized)) {
    return "f";
  }

  if (["g", "garcon", "m", "masculin", "masculine"].includes(normalized)) {
    return "g";
  }

  return undefined;
}

function finalizeGenderStats(accumulator: GenderAccumulator): PanoramaGenderStats {
  const averageBb1 = accumulator.bb1Count > 0 ?
    accumulator.bb1Total / accumulator.bb1Count :
    undefined;
  const averageBb2 = accumulator.bb2Count > 0 ?
    accumulator.bb2Total / accumulator.bb2Count :
    undefined;

  return {
    totalStudents: accumulator.totalStudents,
    participationBb1: accumulator.bb1Count,
    participationBb2: accumulator.bb2Count,
    averageBb1,
    averageBb2,
    progression: averageBb1 !== undefined && averageBb2 !== undefined ?
      averageBb2 - averageBb1 :
      undefined,
    successRateBb1: accumulator.bb1Count > 0 ?
      (accumulator.bb1SuccessCount / accumulator.bb1Count) * 100 :
      undefined,
    successRateBb2: accumulator.bb2Count > 0 ?
      (accumulator.bb2SuccessCount / accumulator.bb2Count) * 100 :
      undefined,
  };
}

function finalizeScholarshipStats(
  accumulator: ScholarshipAccumulator
): PanoramaScholarshipStats {
  const averageBb1 = accumulator.bb1Count > 0 ?
    accumulator.bb1Total / accumulator.bb1Count :
    undefined;
  const averageBb2 = accumulator.bb2Count > 0 ?
    accumulator.bb2Total / accumulator.bb2Count :
    undefined;

  return {
    totalStudents: accumulator.totalStudents,
    participationBb1: accumulator.bb1Count,
    participationBb2: accumulator.bb2Count,
    averageBb1,
    averageBb2,
    progression: averageBb1 !== undefined && averageBb2 !== undefined ?
      averageBb2 - averageBb1 :
      undefined,
    successRateBb1: accumulator.bb1Count > 0 ?
      (accumulator.bb1SuccessCount / accumulator.bb1Count) * 100 :
      undefined,
    successRateBb2: accumulator.bb2Count > 0 ?
      (accumulator.bb2SuccessCount / accumulator.bb2Count) * 100 :
      undefined,
  };
}

function computeGap(
  firstValue: number | undefined,
  secondValue: number | undefined
): number | undefined {
  if (firstValue === undefined || secondValue === undefined) {
    return undefined;
  }

  return firstValue - secondValue;
}

function compareRankingRows(
  left: PanoramaRankingRow,
  right: PanoramaRankingRow,
  key: "averageBb1" | "averageBb2" | "progression"
): number {
  const leftValue = left[key];
  const rightValue = right[key];

  if (leftValue === undefined && rightValue === undefined) {
    return 0;
  }
  if (leftValue === undefined) {
    return 1;
  }
  if (rightValue === undefined) {
    return -1;
  }
  if (leftValue !== rightValue) {
    return rightValue - leftValue;
  }

  const lastNameComparison = left.lastName.localeCompare(right.lastName, "fr", {sensitivity: "base"});
  if (lastNameComparison !== 0) {
    return lastNameComparison;
  }

  return left.firstName.localeCompare(right.firstName, "fr", {sensitivity: "base"});
}

function compareOptionalNumbersDesc(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return right - left;
}

function compareClassDetailStudents(
  left: PanoramaClassDetailStudentRow,
  right: PanoramaClassDetailStudentRow
): number {
  const bb2Comparison = compareOptionalNumbersDesc(left.averageBb2, right.averageBb2);
  if (bb2Comparison !== 0) {
    return bb2Comparison;
  }

  const bb1Comparison = compareOptionalNumbersDesc(left.averageBb1, right.averageBb1);
  if (bb1Comparison !== 0) {
    return bb1Comparison;
  }

  const lastNameComparison = left.lastName.localeCompare(right.lastName, "fr", {sensitivity: "base"});
  if (lastNameComparison !== 0) {
    return lastNameComparison;
  }

  return left.firstName.localeCompare(right.firstName, "fr", {sensitivity: "base"});
}

function buildRankingRows(
  rows: PanoramaRankingRow[],
  key: "averageBb1" | "averageBb2" | "progression"
): PanoramaRankingRow[] {
  return rows
    .filter((row) => row[key] !== undefined)
    .sort((left, right) => compareRankingRows(left, right, key))
    .slice(0, 10)
    .map((row, index) => ({...row, rank: index + 1}));
}

function buildHighlights(
  stats: PanoramaStats,
  classRows: PanoramaClassReportRow[],
  subjectRows: PanoramaSubjectReportRow[],
  top10Bb1: PanoramaRankingRow[],
  top10Bb2: PanoramaRankingRow[],
  top10Progression: PanoramaRankingRow[]
): PanoramaHighlight[] {
  const hasBb2Data = stats.participationBb2 > 0;
  const activeTop10Rows = top10Bb2.length > 0 ? top10Bb2 : top10Bb1;
  const bestClass = [...classRows]
    .filter((row) => (hasBb2Data ? row.averageBb2 : row.averageBb1) !== undefined)
    .sort((left, right) => ((hasBb2Data ? right.averageBb2 : right.averageBb1) ?? 0) - ((hasBb2Data ? left.averageBb2 : left.averageBb1) ?? 0))[0];
  const bestClassProgression = [...classRows]
    .filter((row) => row.progression !== undefined)
    .sort((left, right) => (right.progression ?? 0) - (left.progression ?? 0))[0];
  const bestSubjectProgression = [...subjectRows]
    .filter((row) => row.progression !== undefined)
    .sort((left, right) => (right.progression ?? 0) - (left.progression ?? 0))[0];

  const formatNumber = (value: number | undefined) =>
    value === undefined ? "N/A" : value.toFixed(2).replace(".", ",");

  return [
    {label: "Élèves inscrits", value: String(stats.totalStudents)},
    {label: "Moyenne générale BB1", value: formatNumber(stats.averageBb1)},
    {label: "Moyenne générale BB2", value: formatNumber(stats.averageBb2)},
    {
      label: "Progression générale",
      value: formatNumber(
        stats.averageBb1 !== undefined && stats.averageBb2 !== undefined ?
          stats.averageBb2 - stats.averageBb1 :
          undefined
      ),
    },
    {
      label: `Meilleure classe ${hasBb2Data ? "BB2" : "BB1"}`,
      value: bestClass ? `${bestClass.className} (${formatNumber(hasBb2Data ? bestClass.averageBb2 : bestClass.averageBb1)})` : "N/A",
    },
    {
      label: "Classe en plus forte progression",
      value: bestClassProgression ?
        `${bestClassProgression.className} (${formatNumber(bestClassProgression.progression)})` :
        "N/A",
    },
    {
      label: "Matière en plus forte progression",
      value: bestSubjectProgression ?
        `${bestSubjectProgression.subject} (${formatNumber(bestSubjectProgression.progression)})` :
        "N/A",
    },
    {
      label: `Meilleur élève ${hasBb2Data ? "BB2" : "BB1"}`,
      value: activeTop10Rows[0] ?
        `${activeTop10Rows[0].firstName} ${activeTop10Rows[0].lastName} (${formatNumber(hasBb2Data ? activeTop10Rows[0].averageBb2 : activeTop10Rows[0].averageBb1)})` :
        "N/A",
    },
    {
      label: "Meilleure progression élève",
      value: top10Progression[0] ?
        `${top10Progression[0].firstName} ${top10Progression[0].lastName} (${formatNumber(top10Progression[0].progression)})` :
        "N/A",
    },
  ];
}

export function buildBrevetBlancPanoramaReportData(
  students: BrevetBlancPanoramaStudent[],
  year: string
): BrevetBlancPanoramaReportData {
  const resolvedYear = year || new Date().getFullYear().toString();
  const config = getBrevetConfigForYear(resolvedYear);
  const stats = createEmptyPanoramaStats();

  const subjectAccumulators = config.subjects.reduce<Record<string, SubjectAccumulator>>((accumulator, subject) => {
    accumulator[subject] = {
      bb1Total: 0,
      bb1Count: 0,
      bb2Total: 0,
      bb2Count: 0,
    };
    stats.distributionBySubjectBb1[subject] = createEmptyScoreDistribution();
    stats.distributionBySubjectBb2[subject] = createEmptyScoreDistribution();
    return accumulator;
  }, {});

  const classAccumulators = new Map<string, ClassAccumulator>();
  const rankingRows: PanoramaRankingRow[] = [];
  const genderAccumulators: Record<"f" | "g", GenderAccumulator> = {
    f: {
      totalStudents: 0,
      bb1Total: 0,
      bb1Count: 0,
      bb1SuccessCount: 0,
      bb2Total: 0,
      bb2Count: 0,
      bb2SuccessCount: 0,
    },
    g: {
      totalStudents: 0,
      bb1Total: 0,
      bb1Count: 0,
      bb1SuccessCount: 0,
      bb2Total: 0,
      bb2Count: 0,
      bb2SuccessCount: 0,
    },
  };
  const genderSubjectAccumulators = config.subjects.reduce<Record<string, Record<"f" | "g", GenderSubjectAccumulator>>>((accumulator, subject) => {
    accumulator[subject] = {
      f: {
        bb1Total: 0,
        bb1Count: 0,
        bb2Total: 0,
        bb2Count: 0,
      },
      g: {
        bb1Total: 0,
        bb1Count: 0,
        bb2Total: 0,
        bb2Count: 0,
      },
    };
    return accumulator;
  }, {});
  const scholarshipAccumulators: Record<"boursiers" | "nonBoursiers", ScholarshipAccumulator> = {
    boursiers: {
      totalStudents: 0,
      bb1Total: 0,
      bb1Count: 0,
      bb1SuccessCount: 0,
      bb2Total: 0,
      bb2Count: 0,
      bb2SuccessCount: 0,
    },
    nonBoursiers: {
      totalStudents: 0,
      bb1Total: 0,
      bb1Count: 0,
      bb1SuccessCount: 0,
      bb2Total: 0,
      bb2Count: 0,
      bb2SuccessCount: 0,
    },
  };
  const scholarshipSubjectAccumulators = config.subjects.reduce<Record<string, Record<"boursiers" | "nonBoursiers", ScholarshipSubjectAccumulator>>>((accumulator, subject) => {
    accumulator[subject] = {
      boursiers: {
        bb1Total: 0,
        bb1Count: 0,
        bb2Total: 0,
        bb2Count: 0,
      },
      nonBoursiers: {
        bb1Total: 0,
        bb1Count: 0,
        bb2Total: 0,
        bb2Count: 0,
      },
    };
    return accumulator;
  }, {});

  let globalTotalScoreBb1 = 0;
  let globalTotalScoreBb2 = 0;
  let participantCountBb1 = 0;
  let participantCountBb2 = 0;

  students.forEach((student) => {
    const className = normalizeClassName(student.CLASSE);
    const sexe = normalizeSexeValue(student.SEXE);
    const scholarshipKey: "boursiers" | "nonBoursiers" = student.isBoursier ?
      "boursiers" :
      "nonBoursiers";
    const averageBb1 = calculateBrevetBlancAverage(student, config, "bb1");
    const averageBb2 = calculateBrevetBlancAverage(student, config, "bb2");
    const progression = averageBb1 !== undefined && averageBb2 !== undefined ?
      averageBb2 - averageBb1 :
      undefined;

    if (sexe) {
      genderAccumulators[sexe].totalStudents++;
    } else {
      stats.genderBreakdown.unspecifiedCount++;
    }
    scholarshipAccumulators[scholarshipKey].totalStudents++;

    if (averageBb1 !== undefined) {
      globalTotalScoreBb1 += averageBb1;
      participantCountBb1++;
      categorizeScore(averageBb1, stats.overallDistributionBb1);

      if (sexe) {
        genderAccumulators[sexe].bb1Total += averageBb1;
        genderAccumulators[sexe].bb1Count++;
        if (averageBb1 >= 10) {
          genderAccumulators[sexe].bb1SuccessCount++;
        }
      }
      scholarshipAccumulators[scholarshipKey].bb1Total += averageBb1;
      scholarshipAccumulators[scholarshipKey].bb1Count++;
      if (averageBb1 >= 10) {
        scholarshipAccumulators[scholarshipKey].bb1SuccessCount++;
      }
    }

    if (averageBb2 !== undefined) {
      globalTotalScoreBb2 += averageBb2;
      participantCountBb2++;
      categorizeScore(averageBb2, stats.overallDistributionBb2);

      if (sexe) {
        genderAccumulators[sexe].bb2Total += averageBb2;
        genderAccumulators[sexe].bb2Count++;
        if (averageBb2 >= 10) {
          genderAccumulators[sexe].bb2SuccessCount++;
        }
      }
      scholarshipAccumulators[scholarshipKey].bb2Total += averageBb2;
      scholarshipAccumulators[scholarshipKey].bb2Count++;
      if (averageBb2 >= 10) {
        scholarshipAccumulators[scholarshipKey].bb2SuccessCount++;
      }
    }

    let classAccumulator: ClassAccumulator | undefined;
    if (className) {
      classAccumulator = classAccumulators.get(className);
      if (!classAccumulator) {
        classAccumulator = {
          className,
          totalStudents: 0,
          bb1Total: 0,
          bb1Count: 0,
          bb2Total: 0,
          bb2Count: 0,
          students: [],
        };
        classAccumulators.set(className, classAccumulator);
      }

      classAccumulator.totalStudents++;
      if (averageBb1 !== undefined) {
        classAccumulator.bb1Total += averageBb1;
        classAccumulator.bb1Count++;
      }
      if (averageBb2 !== undefined) {
        classAccumulator.bb2Total += averageBb2;
        classAccumulator.bb2Count++;
      }
    }

    const subjectScores = config.subjects.reduce<PanoramaClassDetailStudentRow["subjectScores"]>((accumulator, subject) => {
      const maxScore = config.maxScores[subject];
      const subjectNote = student.notes?.[subject];
      const bb1OutOf20 = toScoreOutOf20(subjectNote?.bb1, maxScore);
      const bb2OutOf20 = toScoreOutOf20(subjectNote?.bb2, maxScore);

      if (bb1OutOf20 !== undefined) {
        subjectAccumulators[subject].bb1Total += bb1OutOf20;
        subjectAccumulators[subject].bb1Count++;
        categorizeScore(bb1OutOf20, stats.distributionBySubjectBb1[subject]);
        if (sexe) {
          genderSubjectAccumulators[subject][sexe].bb1Total += bb1OutOf20;
          genderSubjectAccumulators[subject][sexe].bb1Count++;
        }
        scholarshipSubjectAccumulators[subject][scholarshipKey].bb1Total += bb1OutOf20;
        scholarshipSubjectAccumulators[subject][scholarshipKey].bb1Count++;
      }
      if (bb2OutOf20 !== undefined) {
        subjectAccumulators[subject].bb2Total += bb2OutOf20;
        subjectAccumulators[subject].bb2Count++;
        categorizeScore(bb2OutOf20, stats.distributionBySubjectBb2[subject]);
        if (sexe) {
          genderSubjectAccumulators[subject][sexe].bb2Total += bb2OutOf20;
          genderSubjectAccumulators[subject][sexe].bb2Count++;
        }
        scholarshipSubjectAccumulators[subject][scholarshipKey].bb2Total += bb2OutOf20;
        scholarshipSubjectAccumulators[subject][scholarshipKey].bb2Count++;
      }

      accumulator[subject] = {
        bb1: bb1OutOf20,
        bb2: bb2OutOf20,
      };
      return accumulator;
    }, {});

    const detailRow: PanoramaClassDetailStudentRow = {
      id: student.id,
      lastName: student.NOM?.trim() || "",
      firstName: student.PRENOM?.trim() || "",
      className: className ?? "",
      averageBb1,
      averageBb2,
      progression,
      subjectScores,
    };

    classAccumulator?.students.push(detailRow);
    rankingRows.push({
      rank: 0,
      id: student.id,
      lastName: detailRow.lastName,
      firstName: detailRow.firstName,
      className: detailRow.className,
      averageBb1,
      averageBb2,
      progression,
    });
  });

  stats.totalStudents = students.length;
  stats.averageBb1 = participantCountBb1 > 0 ? globalTotalScoreBb1 / participantCountBb1 : undefined;
  stats.averageBb2 = participantCountBb2 > 0 ? globalTotalScoreBb2 / participantCountBb2 : undefined;
  stats.participationBb1 = participantCountBb1;
  stats.participationBb2 = participantCountBb2;
  stats.genderBreakdown.filles = finalizeGenderStats(genderAccumulators.f);
  stats.genderBreakdown.garcons = finalizeGenderStats(genderAccumulators.g);
  stats.genderBreakdown.specifiedCount =
    genderAccumulators.f.totalStudents + genderAccumulators.g.totalStudents;
  stats.genderBreakdown.overallGaps = {
    averageBb1: computeGap(stats.genderBreakdown.filles.averageBb1, stats.genderBreakdown.garcons.averageBb1),
    averageBb2: computeGap(stats.genderBreakdown.filles.averageBb2, stats.genderBreakdown.garcons.averageBb2),
    progression: computeGap(stats.genderBreakdown.filles.progression, stats.genderBreakdown.garcons.progression),
    successRateBb1: computeGap(stats.genderBreakdown.filles.successRateBb1, stats.genderBreakdown.garcons.successRateBb1),
    successRateBb2: computeGap(stats.genderBreakdown.filles.successRateBb2, stats.genderBreakdown.garcons.successRateBb2),
  };
  stats.genderBreakdown.subjectRows = config.subjects.map((subject) => {
    const fillesAccumulator = genderSubjectAccumulators[subject].f;
    const garconsAccumulator = genderSubjectAccumulators[subject].g;
    const fillesAverageBb1 = fillesAccumulator.bb1Count > 0 ?
      fillesAccumulator.bb1Total / fillesAccumulator.bb1Count :
      undefined;
    const garconsAverageBb1 = garconsAccumulator.bb1Count > 0 ?
      garconsAccumulator.bb1Total / garconsAccumulator.bb1Count :
      undefined;
    const fillesAverageBb2 = fillesAccumulator.bb2Count > 0 ?
      fillesAccumulator.bb2Total / fillesAccumulator.bb2Count :
      undefined;
    const garconsAverageBb2 = garconsAccumulator.bb2Count > 0 ?
      garconsAccumulator.bb2Total / garconsAccumulator.bb2Count :
      undefined;

    return {
      subject,
      fillesParticipationBb1: fillesAccumulator.bb1Count,
      fillesAverageBb1,
      garconsParticipationBb1: garconsAccumulator.bb1Count,
      garconsAverageBb1,
      gapBb1: computeGap(fillesAverageBb1, garconsAverageBb1),
      fillesParticipationBb2: fillesAccumulator.bb2Count,
      fillesAverageBb2,
      garconsParticipationBb2: garconsAccumulator.bb2Count,
      garconsAverageBb2,
      gapBb2: computeGap(fillesAverageBb2, garconsAverageBb2),
    };
  });
  stats.scholarshipBreakdown.boursiers = finalizeScholarshipStats(scholarshipAccumulators.boursiers);
  stats.scholarshipBreakdown.nonBoursiers = finalizeScholarshipStats(scholarshipAccumulators.nonBoursiers);
  stats.scholarshipBreakdown.specifiedCount =
    scholarshipAccumulators.boursiers.totalStudents +
    scholarshipAccumulators.nonBoursiers.totalStudents;
  stats.scholarshipBreakdown.overallGaps = {
    averageBb1: computeGap(
      stats.scholarshipBreakdown.boursiers.averageBb1,
      stats.scholarshipBreakdown.nonBoursiers.averageBb1
    ),
    averageBb2: computeGap(
      stats.scholarshipBreakdown.boursiers.averageBb2,
      stats.scholarshipBreakdown.nonBoursiers.averageBb2
    ),
    progression: computeGap(
      stats.scholarshipBreakdown.boursiers.progression,
      stats.scholarshipBreakdown.nonBoursiers.progression
    ),
    successRateBb1: computeGap(
      stats.scholarshipBreakdown.boursiers.successRateBb1,
      stats.scholarshipBreakdown.nonBoursiers.successRateBb1
    ),
    successRateBb2: computeGap(
      stats.scholarshipBreakdown.boursiers.successRateBb2,
      stats.scholarshipBreakdown.nonBoursiers.successRateBb2
    ),
  };
  stats.scholarshipBreakdown.subjectRows = config.subjects.map((subject) => {
    const boursiersAccumulator = scholarshipSubjectAccumulators[subject].boursiers;
    const nonBoursiersAccumulator = scholarshipSubjectAccumulators[subject].nonBoursiers;
    const boursiersAverageBb1 = boursiersAccumulator.bb1Count > 0 ?
      boursiersAccumulator.bb1Total / boursiersAccumulator.bb1Count :
      undefined;
    const nonBoursiersAverageBb1 = nonBoursiersAccumulator.bb1Count > 0 ?
      nonBoursiersAccumulator.bb1Total / nonBoursiersAccumulator.bb1Count :
      undefined;
    const boursiersAverageBb2 = boursiersAccumulator.bb2Count > 0 ?
      boursiersAccumulator.bb2Total / boursiersAccumulator.bb2Count :
      undefined;
    const nonBoursiersAverageBb2 = nonBoursiersAccumulator.bb2Count > 0 ?
      nonBoursiersAccumulator.bb2Total / nonBoursiersAccumulator.bb2Count :
      undefined;

    return {
      subject,
      boursiersParticipationBb1: boursiersAccumulator.bb1Count,
      boursiersAverageBb1,
      nonBoursiersParticipationBb1: nonBoursiersAccumulator.bb1Count,
      nonBoursiersAverageBb1,
      gapBb1: computeGap(boursiersAverageBb1, nonBoursiersAverageBb1),
      boursiersParticipationBb2: boursiersAccumulator.bb2Count,
      boursiersAverageBb2,
      nonBoursiersParticipationBb2: nonBoursiersAccumulator.bb2Count,
      nonBoursiersAverageBb2,
      gapBb2: computeGap(boursiersAverageBb2, nonBoursiersAverageBb2),
    };
  });
  stats.subjectAverages = config.subjects.map((subject) => ({
    subject,
    averageBb1: subjectAccumulators[subject].bb1Count > 0 ?
      subjectAccumulators[subject].bb1Total / subjectAccumulators[subject].bb1Count :
      undefined,
    averageBb2: subjectAccumulators[subject].bb2Count > 0 ?
      subjectAccumulators[subject].bb2Total / subjectAccumulators[subject].bb2Count :
      undefined,
  }));

  const classRows = Array.from(classAccumulators.values())
    .map<PanoramaClassReportRow>((row) => ({
      className: row.className,
      totalStudents: row.totalStudents,
      participationBb1: row.bb1Count,
      participationBb2: row.bb2Count,
      averageBb1: row.bb1Count > 0 ? row.bb1Total / row.bb1Count : undefined,
      averageBb2: row.bb2Count > 0 ? row.bb2Total / row.bb2Count : undefined,
      progression: row.bb1Count > 0 && row.bb2Count > 0 ?
        (row.bb2Total / row.bb2Count) - (row.bb1Total / row.bb1Count) :
        undefined,
    }))
    .sort((left, right) => compareClassNames(left.className, right.className));

  const subjectRows = stats.subjectAverages
    .map<PanoramaSubjectReportRow>((row) => ({
      subject: row.subject,
      averageBb1: row.averageBb1,
      averageBb2: row.averageBb2,
      progression: row.averageBb1 !== undefined && row.averageBb2 !== undefined ?
        row.averageBb2 - row.averageBb1 :
        undefined,
      participationBb1: subjectAccumulators[row.subject].bb1Count,
      participationBb2: subjectAccumulators[row.subject].bb2Count,
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject, "fr", {sensitivity: "base"}));

  const top10Bb1 = buildRankingRows(rankingRows, "averageBb1");
  const top10Bb2 = buildRankingRows(rankingRows, "averageBb2");
  const top10Progression = buildRankingRows(rankingRows, "progression");

  const classDetails = classRows.map<PanoramaClassDetail>((classRow) => {
    const classAccumulator = classAccumulators.get(classRow.className);
    const studentsInClass = classAccumulator ? [...classAccumulator.students] : [];
    studentsInClass.sort(compareClassDetailStudents);

    return {
      className: classRow.className,
      summary: classRow,
      students: studentsInClass,
    };
  });

  const highlights = buildHighlights(stats, classRows, subjectRows, top10Bb1, top10Bb2, top10Progression);

  return {
    year: resolvedYear,
    config,
    stats,
    highlights,
    classRows,
    subjectRows,
    top10Bb1,
    top10Bb2,
    top10Progression,
    classDetails,
  };
}
