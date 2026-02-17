import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, deleteDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ✅ CREDENCIALES REALES DE otm-120h-oruro
const firebaseConfig = {
    apiKey: "AIzaSyCzUxfhj2wGFXDXHrmqi7sYkCUOPMFanzQ",
    authDomain: "otm-120h-oruro.firebaseapp.com",
    projectId: "otm-120h-oruro",
    storageBucket: "otm-120h-oruro.firebasestorage.app",
    messagingSenderId: "442199177770",
    appId: "1:442199177770:web:21770802ebef01a34c2153"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const HORNADA_DOC = doc(db, 'otm120h', 'hornada_actual');
const LOGS_COLLECTION = collection(db, 'otm120h', 'hornada_actual', 'logs');
const INCHING_DOC = doc(db, 'otm120h', 'inching_status');

const CONFIG = {
    PIN_ADMIN: 'ORURO2026',
    INCHING_LIMIT: 15 * 60,
    RAMPS: { phase1: { limit: 40, rate: 5 }, phase2: { limit: 80, rate: 8 }, phase3: { limit: 120, rate: 12 } },
    FACTOR: 3.5
};

let state = {
    running: false,
    startTime: null,
    pausedTime: 0,
    lastInching: null,
    logs: [],
    turnoActual: null,
    inchingWarning: false,
    isOnline: false
};

let unsubscribeLogs = null;
let unsubscribeHornada = null;

window.db = db;
window.auth = auth;
window.HORNADA_DOC = HORNADA_DOC;
window.LOGS_COLLECTION = LOGS_COLLECTION;
window.INCHING_DOC = INCHING_DOC;
window.CONFIG = CONFIG;
window.state = state;
window.unsubscribeLogs = unsubscribeLogs;
window.unsubscribeHornada = unsubscribeHornada;

import('./app.js');
