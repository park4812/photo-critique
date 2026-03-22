import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDKylSygZT5wq-xap5K9ydCy9qQZ6LadhQ",
  authDomain: "photo-critique-park4812.firebaseapp.com",
  projectId: "photo-critique-park4812",
  storageBucket: "photo-critique-park4812.firebasestorage.app",
  messagingSenderId: "540950200507",
  appId: "1:540950200507:web:1f38631869b8f1c938699e"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
