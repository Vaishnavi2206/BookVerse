import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBHg75gkAn8vPcQKHbIVZhX5UMZB0Of2pk",
  authDomain: "bookverse-c1dc1.firebaseapp.com",
  projectId: "bookverse-c1dc1",
  storageBucket: "bookverse-c1dc1.firebasestorage.app",
  messagingSenderId: "71270209933",
  appId: "1:71270209933:web:78334b6921709ef5f005c4",
  measurementId: "G-8BJGGRLPCK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth and the Google Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Optional: Forces the account picker to show every time
googleProvider.setCustomParameters({ prompt: 'select_account' }); 

export { signInWithPopup, signOut };
