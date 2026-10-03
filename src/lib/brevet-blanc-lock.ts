export type BrevetExam = "bb1" | "bb2";

export interface BrevetExamLocks {
  bb1: boolean;
  bb2: boolean;
}

export type RawBrevetBlancLockValue =
  | boolean
  | Partial<BrevetExamLocks>
  | null
  | undefined;

export type BrevetBlancLockStatus = Record<string, RawBrevetBlancLockValue>;

/** Année de la session de juin : la rentrée de septembre prépare le brevet suivant. */
export function getCurrentBrevetLockYear(date: Date = new Date()): string {
  return (date.getFullYear() + (date.getMonth() >= 8 ? 1 : 0)).toString();
}

export function normalizeBrevetExamLocks(
  value: RawBrevetBlancLockValue
): BrevetExamLocks {
  if (typeof value === "boolean") {
    return {bb1: value, bb2: value};
  }

  if (!value || typeof value !== "object") {
    return {bb1: false, bb2: false};
  }

  return {
    bb1: value.bb1 === true,
    bb2: value.bb2 === true,
  };
}

export function getBrevetExamLocks(
  lockStatus: BrevetBlancLockStatus,
  year: string
): BrevetExamLocks {
  return normalizeBrevetExamLocks(lockStatus[year]);
}

export function isBrevetExamLocked(
  lockStatus: BrevetBlancLockStatus,
  year: string,
  exam: BrevetExam
): boolean {
  return getBrevetExamLocks(lockStatus, year)[exam];
}

export function formatBrevetExamLabel(exam: BrevetExam): string {
  return exam === "bb1" ? "Brevet Blanc 1" : "Brevet Blanc 2";
}
