import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";

// EventPro Firebase Configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  // Firebase initialized successfully
} catch (e) {
  console.error("❌ Firebase Initialization Failed:", e);
}

export const analytics = app ? getAnalytics(app) : null;

// Initialize Firestore with offline persistence (IndexedDB)
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
  // Firestore offline persistence enabled
} catch (e) {
  // Could not enable offline persistence, falling back to default
  db = getFirestore(app);
}

export { db };

// Initialize Services
export const auth = getAuth(app);
export const functions = getFunctions(app);

// Uncomment for local emulator testing:
// connectFunctionsEmulator(functions, "localhost", 5001);

export { httpsCallable, connectFunctionsEmulator };

// Explicitly bind the auth instance for helper functions
export { 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  signInWithEmailLink,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";

export default app;
