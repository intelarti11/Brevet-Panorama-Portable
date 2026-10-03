/** Normalise les valeurs de sexe utilisées dans les imports et les fiches élèves. */
export function normalizeBrevetSex(value: unknown): 'f' | 'g' | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['f', 'fille', 'feminin', 'feminine'].includes(normalized)) return 'f';
  if (['g', 'garcon', 'm', 'masculin', 'masculine'].includes(normalized)) return 'g';
  return undefined;
}

/** La fiche brevet blanc appariée reste prioritaire, sinon le résultat officiel. */
export function resolveBrevetSex(officialSex: unknown, matchedBrevetBlancSex: unknown): 'f' | 'g' | undefined {
  return normalizeBrevetSex(matchedBrevetBlancSex) ?? normalizeBrevetSex(officialSex);
}
