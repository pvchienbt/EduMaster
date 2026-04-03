import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Kiểm tra xem cấu hình có hợp lệ không
const isValidConfig = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId;

if (!isValidConfig) {
  console.error("Firebase configuration is missing or invalid. Check firebase-applet-config.json");
}

const app = isValidConfig ? initializeApp(firebaseConfig) : null;
export const db = app ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null as any;
export const auth = app ? getAuth(app) : null as any;
export const googleProvider = new GoogleAuthProvider();
export { firebaseConfig };
