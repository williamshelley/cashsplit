/**
 * Firebase Web app configuration.
 *
 * These values are PUBLIC by design (they identify your Firebase project to
 * the client SDK; they are not secrets). It is safe to commit them. Access is
 * controlled by Firestore security rules + Firebase Auth, not by hiding config.
 *
 * Fill these in from: Firebase Console → Project settings → Your apps → Web app.
 * You can also override any value via a Vite env var (e.g. VITE_FIREBASE_API_KEY)
 * in a local `.env` file.
 */

const env = (import.meta as ImportMeta).env ?? {};

/** Use an env override only when it is a non-empty string, else the fallback. */
function pick(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: pick(env.VITE_FIREBASE_API_KEY, "AIzaSyCn0HOvlwOn66nDPw_1E8eO9eNDPa29UYo"),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, "cashsplit-81b97.firebaseapp.com"),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, "cashsplit-81b97"),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, "cashsplit-81b97.firebasestorage.app"),
  messagingSenderId: pick(env.VITE_FIREBASE_MESSAGING_SENDER_ID, "885754297904"),
  appId: pick(env.VITE_FIREBASE_APP_ID, "1:885754297904:web:3281da45efd93d999a77f5"),
};

/** True until the user has filled in real Firebase config values. */
export function isConfigPlaceholder(cfg: FirebaseConfig = firebaseConfig): boolean {
  return cfg.apiKey === "YOUR_API_KEY" || cfg.projectId === "YOUR_PROJECT_ID";
}
