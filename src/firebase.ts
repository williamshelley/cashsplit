import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Enable offline persistence in the browser; fall back gracefully elsewhere.
export const db: Firestore = (() => {
  if (typeof window !== "undefined") {
    try {
      return initializeFirestore(app, { localCache: persistentLocalCache() });
    } catch {
      return getFirestore(app);
    }
  }
  return getFirestore(app);
})();
