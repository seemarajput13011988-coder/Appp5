
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCM8iR9ImDzNSDcshdfdLM3DFoF_0LoZYQ',
  authDomain: 'attendence-app-16fe2.firebaseapp.com',
  databaseURL: 'https://attendence-app-16fe2-default-rtdb.firebaseio.com',
  projectId: 'attendence-app-16fe2',
  storageBucket: 'attendence-app-16fe2.firebasestorage.app',
  messagingSenderId: '134704010091',
  appId: '1:134704010091:web:7d780f96de0dbf9cd8322e'
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
