/** Preserve an explicit selection, or choose a valid fallback after a data reload. */
export function resolveFilterSelection(
  current: string,
  available: readonly string[],
  allValue: string,
  defaultValue = available[0],
): string {
  if (current === allValue || available.includes(current)) return current;
  if (available.length === 0) return allValue;
  if (defaultValue === allValue || available.includes(defaultValue)) return defaultValue;
  return available[0];
}
