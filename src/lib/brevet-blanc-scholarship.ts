/** La liste du brevet blanc ne marque que les élèves boursiers. */
export function scholarshipFromMatchedBrevetBlanc(value: unknown): boolean {
  return value === true;
}
