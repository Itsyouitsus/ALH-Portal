import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAhIlt30p-huvswMLh3OOvsNrHwWR8LeEI",
  authDomain: "alh-portal.firebaseapp.com",
  projectId: "alh-portal",
  storageBucket: "alh-portal.firebasestorage.app",
  messagingSenderId: "510202031383",
  appId: "1:510202031383:web:b32ae36fa67ad6a6691b52",
  measurementId: "G-WDX33Z1N76"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
