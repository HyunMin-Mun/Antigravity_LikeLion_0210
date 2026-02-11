import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBslBpJ_yrETxyJGs64K5kf9CnMBGhM0qY",
    authDomain: "antigravity-0211.firebaseapp.com",
    projectId: "antigravity-0211",
    storageBucket: "antigravity-0211.firebasestorage.app",
    messagingSenderId: "105351627034",
    appId: "1:105351627034:web:51b789c0ed36cd12802ca3",
    measurementId: "G-GPPPQ3EXYQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
