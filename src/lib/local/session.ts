/** Session unique de l'edition portable. Aucun compte, jeton ou appel reseau. */
export interface User {
  uid: string;
  email: string;
  displayName: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
}

// Compatibilite temporaire avec les ecrans qui identifiaient l'administrateur
// par son adresse. Cette valeur n'est ni un compte ni une identite authentifiee.
const user: User = {
  uid: "local-user",
  email: "local-user@localhost",
  displayName: "Utilisateur local",
  getIdToken: async () => "local",
  getIdTokenResult: async () => ({ claims: { admin: true, replacementImporter: true } }),
};
const session = { currentUser: user };
export const auth = session;
export function getAuth(_app?: unknown) { return session; }
export function onAuthStateChanged(_auth: unknown, listener: (user: User) => void): () => void {
  let active = true;
  queueMicrotask(() => { if (active) listener(user); });
  return () => { active = false; };
}
