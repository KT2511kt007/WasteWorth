import { initializeApp }
from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
}
from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp
}
from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyDCcPM0tFhuiKf5CLl_I44wBxQyT1Vwar8",
    authDomain: "woste-4dbbe.firebaseapp.com",
    projectId: "woste-4dbbe",
    storageBucket: "woste-4dbbe.firebasestorage.app",
    messagingSenderId: "364333511594",
    appId: "1:364333511594:web:07571014cbb6fd441cb1d3",
    measurementId: "G-1Z80ZMC6WT"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


export {
    auth,
    db,

    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,
    setDoc,
    getDoc,
    updateDoc,

    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp
};