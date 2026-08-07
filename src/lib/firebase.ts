import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
export { firebaseConfig };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

// Use memoryLocalCache to prevent unhandled asynchronous IndexedDB/tabManager errors in sandboxed iframes
const localCacheSetting = memoryLocalCache();

// Use initializeFirestore with experimentalForceLongPolling: true.
// This forces long-polling instead of WebSockets, preventing connection drops
// inside proxies and sandboxed environments that restrict persistent WebSocket connections.
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: localCacheSetting,
  }, (firebaseConfig as any).firestoreDatabaseId);
} catch (e) {
  console.warn("Failed to initialize Firestore with specified settings, retrying with memory cache:", e);
  try {
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: memoryLocalCache(),
    }, (firebaseConfig as any).firestoreDatabaseId);
  } catch (err2) {
    console.error("Critical Firestore initialization failure, falling back to standard getFirestore:", err2);
    dbInstance = getFirestore(app);
  }
}

export const db = dbInstance;


// Error logging helper as per system rules
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || "";

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };

  const isPermissionError = 
    errMsg.toLowerCase().includes("permission") || 
    errCode.toLowerCase().includes("permission") ||
    String(error).toLowerCase().includes("permission");

  if (isPermissionError) {
    console.error('Firestore Permission Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  } else {
    // For non-permission errors (like temporary unavailable or connection issues), 
    // log them clearly as warnings but do not throw unhandled fatal errors to the main thread.
    // This allows Firestore's automatic retry and offline cache mechanisms to work perfectly.
    console.warn(`[Firestore Warning] Non-fatal Firestore issue (${operationType} on ${path}): ${errMsg}`);
  }
}

export default app;
