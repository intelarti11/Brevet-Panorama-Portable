/** Identité issue de la base officielle, commune aux deux parcours de notes. */
export interface StudentIdentity {
  INE: string;
  NOM: string;
  PRENOM: string;
  CLASSE?: string;
  SEXE?: "f" | "g";
  dateNaissance?: string;
}

export interface OfficialStudentClass {
  code: string;
  studentCount: number;
  recommendedForBrevet: boolean;
}

export interface OfficialStudentExport {
  students: StudentIdentity[];
  classes: OfficialStudentClass[];
  schoolYear?: string;
  schoolCode?: string;
  excludedStudentCount: number;
  missingIneCount: number;
  sourceStudentCount: number;
}

/** Indique si un libellé BEE désigne une classe de troisième. */
export const isThirdYearClass = (code: string): boolean => {
  const normalized = code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized.startsWith("3") || normalized.startsWith("TROISIEME");
};
