const browserEnv = import.meta.env || {};
const serverEnv = typeof process !== "undefined" ? process.env : {};

const env = (name: string) => browserEnv[`VITE_${name}`] || serverEnv[`NEXT_PUBLIC_${name}`] || "";

export const firebaseConfig = {
  apiKey: env("FIREBASE_API_KEY"),
  authDomain: env("FIREBASE_AUTH_DOMAIN"),
  databaseURL: env("FIREBASE_DATABASE_URL"),
  projectId: env("FIREBASE_PROJECT_ID"),
  storageBucket: env("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("FIREBASE_APP_ID"),
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.databaseURL &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);
