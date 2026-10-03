export type LockableYearModule = "brevet" | "pix";
export type YearLockStatus = Record<string, boolean>;

export interface DataLockStatus {
  brevet: YearLockStatus;
  pix: YearLockStatus;
}

export interface LockableYearsByModule {
  brevetBlanc: string[];
  brevet: string[];
  pix: string[];
}

export function normalizeYearLockStatus(value: unknown): YearLockStatus {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<YearLockStatus>(
    (accumulator, [year, locked]) => {
      if (typeof year === "string" && year.trim() !== "" && locked === true) {
        accumulator[year] = true;
      }
      return accumulator;
    },
    {}
  );
}

export function normalizeDataLockStatus(value: unknown): DataLockStatus {
  if (!value || typeof value !== "object") {
    return {brevet: {}, pix: {}};
  }

  const recordValue = value as Record<string, unknown>;
  return {
    brevet: normalizeYearLockStatus(recordValue.brevet),
    pix: normalizeYearLockStatus(recordValue.pix),
  };
}

export function isDataYearLocked(
  lockStatus: DataLockStatus,
  module: LockableYearModule,
  year: string
): boolean {
  return !!year && lockStatus[module][year] === true;
}

export function formatLockableModuleLabel(module: LockableYearModule): string {
  return module === "brevet" ? "Brevet officiel" : "PIX";
}
