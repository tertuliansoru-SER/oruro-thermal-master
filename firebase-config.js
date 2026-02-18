// firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyCzUxfhj2wGFXDXHrmqi7sYkCUOPMFanzQ",
  authDomain: "otm-120h-oruro.firebaseapp.com",
  projectId: "otm-120h-oruro",
  storageBucket: "otm-120h-oruro.firebasestorage.app",
  messagingSenderId: "442199177770",
  appId: "1:442199177770:web:21770802ebef01a34c2153"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Variables globales para usar en app.js
const db = firebase.firestore();
const auth = firebase.auth();
