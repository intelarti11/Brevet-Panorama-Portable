
export interface BrevetConfig {
  subjects: readonly string[];
  maxScores: { readonly [subject: string]: number };
  abbreviations: { readonly [key:string]: string };
  coefficients?: { readonly [subject: string]: number };
}

const configPre2026: BrevetConfig = {
  subjects: [
    "Français", "Mathématiques", "Histoire-Géographie", "Enseignement moral et civique",
    "Physique-Chimie", "Sciences de la Vie et de la Terre", "Technologie", "Oral de soutenance",
  ],
  maxScores: {
    "Français": 100,
    "Mathématiques": 100,
    "Histoire-Géographie": 40,
    "Enseignement moral et civique": 10,
    "Physique-Chimie": 25,
    "Sciences de la Vie et de la Terre": 25,
    "Technologie": 25,
    "Oral de soutenance": 100,
  },
  abbreviations: {
    "Français": "Français",
    "Mathématiques": "Maths",
    "Histoire-Géographie": "HG",
    "Enseignement moral et civique": "EMC",
    "Physique-Chimie": "PC",
    "Sciences de la Vie et de la Terre": "SVT",
    "Technologie": "Techno",
    "Oral de soutenance": "Oral",
  }
};

// Configuration pour 2026 et après
const configPost2026: BrevetConfig = {
  subjects: [
    "Français", "Mathématiques", "Histoire-Géographie", "Enseignement moral et civique",
    "Physique-Chimie", "Sciences de la Vie et de la Terre", "Technologie", "Oral de soutenance"
  ],
  maxScores: { // Tous les barèmes sont sur 20
    "Français": 20,
    "Mathématiques": 20,
    "Histoire-Géographie": 20,
    "Enseignement moral et civique": 20,
    "Physique-Chimie": 20,
    "Sciences de la Vie et de la Terre": 20,
    "Technologie": 20,
    "Oral de soutenance": 20,
  },
  abbreviations: {
    "Français": "Français",
    "Mathématiques": "Maths",
    "Histoire-Géographie": "HG",
    "Enseignement moral et civique": "EMC",
    "Physique-Chimie": "PC",
    "Sciences de la Vie et de la Terre": "SVT",
    "Technologie": "Techno",
    "Oral de soutenance": "Oral",
  },
  coefficients: {
    "Français": 2,
    "Mathématiques": 2,
    "Histoire-Géographie": 1.5, // Coeff 1,5 pour HG
    "Enseignement moral et civique": 0.5, // Coeff 0,5 pour EMC
    "Sciences": 2, // Clef spéciale pour le bloc des 3 matières scientifiques
    "Oral de soutenance": 2,
  }
};


export function getBrevetConfigForYear(year: number | string): BrevetConfig {
    const numericYear = typeof year === 'string' ? parseInt(year, 10) : year;
    if (isNaN(numericYear)) {
        // Default to pre-2026 if year is invalid
        return configPre2026;
    }
    // La réforme s'applique à la session du brevet de l'année scolaire.
    // L'année scolaire 2025-2026 concerne le brevet de 2026.
    return numericYear >= 2026 ? configPost2026 : configPre2026;
};

// Pour la validation backend, une liste de toutes les matières possibles est nécessaire.
export const ALL_BREVET_SUBJECTS = Array.from(new Set([...configPre2026.subjects, ...configPost2026.subjects]));

export function calculateBrevetBlancAverage(
  student: { notes?: { [subject: string]: { bb1?: number; bb2?: number; } } },
  config: BrevetConfig,
  brevetKey: 'bb1' | 'bb2'
): number | undefined {
  const isPostReform = config.coefficients !== undefined;

  if (isPostReform && config.coefficients) {
      let totalPoints = 0;
      let totalCoefficients = 0;
      const coefficients = config.coefficients;

      // Weighted average logic for post-2026
      const scienceNotes = [
        student.notes?.['Physique-Chimie']?.[brevetKey],
        student.notes?.['Sciences de la Vie et de la Terre']?.[brevetKey],
        student.notes?.['Technologie']?.[brevetKey]
      ].filter((n): n is number => n !== undefined && n !== null && !isNaN(n));

      if (scienceNotes.length > 0) {
          const scienceAvg = scienceNotes.reduce((a, b) => a + b, 0) / scienceNotes.length;
          totalPoints += scienceAvg * (coefficients['Sciences'] || 1);
          totalCoefficients += (coefficients['Sciences'] || 1);
      }

      const subjectsToWeight = config.subjects.filter(s => !["Physique-Chimie", "Sciences de la Vie et de la Terre", "Technologie"].includes(s) && coefficients[s as keyof typeof coefficients]);

      subjectsToWeight.forEach(subject => {
          const note = student.notes?.[subject]?.[brevetKey];
          if (note !== undefined && note !== null && !isNaN(note)) {
              totalPoints += note * (coefficients[subject as keyof typeof coefficients] || 1);
              totalCoefficients += (coefficients[subject as keyof typeof coefficients] || 1);
          }
      });

      const average = totalCoefficients > 0 ? totalPoints / totalCoefficients : undefined;
      return average;

  } else { // Pre-2026 logic
      let totalScore = 0;
      let totalMaxScore = 0;
      for (const matiere of config.subjects) {
          const note = student.notes?.[matiere]?.[brevetKey];
          if (note !== undefined && note !== null && !isNaN(note)) {
              totalScore += note;
              totalMaxScore += config.maxScores[matiere];
          }
      }
      return totalMaxScore > 0 ? (totalScore / totalMaxScore) * 20 : undefined;
  }
}
