import { invoke, isTauri } from "@tauri-apps/api/core";

type Transport = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
let testTransport: Transport | undefined;

/** Injection explicite pour les tests, jamais un stockage alternatif au runtime. */
export function setLocalTransportForTests(transport?: Transport): void {
  if (process.env.NODE_ENV === "production") throw new Error("Transport de test interdit en production.");
  testTransport = transport;
}

export async function localInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (testTransport) return await testTransport(command, args) as T;
  if (typeof window === "undefined" || !isTauri()) {
    throw new Error("Ouvrez Brevet Panorama Portable depuis son executable pour acceder a la base locale.");
  }
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "Operation locale impossible.");
  }
}
