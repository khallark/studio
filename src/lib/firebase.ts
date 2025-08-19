// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD5mhKWYl-SAY_BB-D8y2q5rqa_kha42no",
  authDomain: "orderflow-jnig7.firebaseapp.com",
  projectId: "orderflow-jnig7",
  storageBucket: "orderflow-jnig7.firebasestorage.app",
  messagingSenderId: "1005907384516",
  appId: "1:1005907384516:web:b079b9512e64c4788b5191"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

export { app, auth };
