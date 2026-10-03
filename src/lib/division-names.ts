export type DivisionAliases = Record<string, string>;

export function normalizeDivisionName(name: string): string {
  return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
}

/** Résout les anciens libellés sans modifier leur casse ni les autres divisions. */
export function resolveDivisionName(name: string, aliases: DivisionAliases): string {
  let current = name.trim();
  const seen = new Set<string>();
  while (Object.hasOwn(aliases, normalizeDivisionName(current))) {
    const key = normalizeDivisionName(current);
    if (seen.has(key)) throw new Error("Les correspondances de divisions contiennent une boucle.");
    seen.add(key);
    const next = aliases[key];
    if (typeof next !== "string" || !next.trim()) throw new Error("Une correspondance de division est invalide.");
    if (normalizeDivisionName(next) === key) return next.trim();
    current = next.trim();
  }
  return current;
}

export async function loadDivisionAliases(year: string): Promise<DivisionAliases> {
  if (!/^\d{4}$/.test(year)) throw new Error("Choisissez une année du brevet valide.");
  const [{doc, getDoc}, {db}] = await Promise.all([
    import("@/lib/local/store"), import("./firebase"),
  ]);
  const snapshot = await getDoc(doc(db, "appSettings", `divisions-${year}`));
  if (!snapshot.exists()) return {};
  const data = snapshot.data();
  if (data.year !== year || !Object.hasOwn(data, "aliases")) {
    throw new Error("Les correspondances de divisions sont invalides pour cette année.");
  }
  const raw: unknown = data.aliases;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Les correspondances de divisions sont invalides.");
  }
  const aliases: DivisionAliases = {};
  for (const [source, target] of Object.entries(raw)) {
    const key = normalizeDivisionName(source);
    const reserved = ["__proto__", "constructor", "prototype"];
    if (!key || source.trim().length > 60 || typeof target !== "string" ||
      !target.trim() || target.trim().length > 60 ||
      reserved.includes(key) || reserved.includes(normalizeDivisionName(target))) {
      throw new Error("Une correspondance de division est invalide.");
    }
    if (Object.hasOwn(aliases, key) && aliases[key] !== target.trim()) {
      throw new Error("Plusieurs correspondances de divisions sont incompatibles.");
    }
    aliases[key] = target.trim();
  }
  for (const key of Object.keys(aliases)) resolveDivisionName(key, aliases);
  return aliases;
}
