/** Compatibility handles for the reused screens; no Firebase SDK is loaded. */
export { db } from './local/store';
export { auth } from './local/session';
export const app = Object.freeze({ edition: 'portable' });
export const functions = Object.freeze({ edition: 'portable' });
