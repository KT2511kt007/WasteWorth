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
    where,
    orderBy,
    serverTimestamp,
    runTransaction
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

/** Save a user's education details without replacing their existing profile. */
async function saveEducationData(uid, university, dormType = null) {
    if (!uid) {
        throw new Error("A user ID is required to save education data.");
    }

    const educationData = {
        university: university.trim(),
        dormType: university.trim() === "มหาวิทยาลัยธรรมศาสตร์" ? dormType : null
    };

    await setDoc(
        doc(db, "users", uid),
        educationData,
        { merge: true }
    );
}

async function createBottleSubmission(user, bottles) {
    if (!user?.uid || !user.email || !Number.isInteger(bottles) || bottles < 1) {
        throw new Error("Valid user and bottle count are required.");
    }

    return addDoc(collection(db, "submissions"), {
        userId: user.uid,
        userEmail: user.email,
        bottles,
        approvedBottles: 0,
        points: 0,
        status: "pending",
        createdAt: serverTimestamp(),
        approvedAt: null,
        rejectedAt: null
    });
}

async function approveBottleSubmission(adminUid, submissionId, approvedBottles) {
    if (!Number.isInteger(approvedBottles) || approvedBottles < 1) {
        throw new Error("Approved bottle count must be a positive whole number.");
    }

    return runTransaction(db, async transaction => {
        const adminRef = doc(db, "admins", adminUid);
        const submissionRef = doc(db, "submissions", submissionId);
        const adminSnapshot = await transaction.get(adminRef);
        const submissionSnapshot = await transaction.get(submissionRef);

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!submissionSnapshot.exists()) throw new Error("Submission not found.");

        const submission = submissionSnapshot.data();
        if (submission.status !== "pending") throw new Error("This submission has already been reviewed.");
        if (approvedBottles > submission.bottles) throw new Error("Approved count cannot exceed the submitted count.");

        const userRef = doc(db, "users", submission.userId);
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists()) throw new Error("User profile not found.");

        const user = userSnapshot.data();
        const earnedPoints = approvedBottles * 5;
        const earnedMoney = approvedBottles * 0.5;
        const historyRef = doc(db, "users", submission.userId, "history", submissionId);

        transaction.update(submissionRef, {
            status: "approved",
            approvedBottles,
            points: earnedPoints,
            approvedAt: serverTimestamp(),
            rejectedAt: null
        });
        transaction.update(userRef, {
            bottles: Number(user.bottles || 0) + approvedBottles,
            points: Number(user.points || 0) + earnedPoints,
            money: Number(user.money || 0) + earnedMoney
        });
        transaction.set(historyRef, {
            bottles: approvedBottles,
            points: earnedPoints,
            money: earnedMoney,
            submissionId,
            createdAt: serverTimestamp()
        });
    });
}

async function rejectBottleSubmission(adminUid, submissionId) {
    return runTransaction(db, async transaction => {
        const adminRef = doc(db, "admins", adminUid);
        const submissionRef = doc(db, "submissions", submissionId);
        const adminSnapshot = await transaction.get(adminRef);
        const submissionSnapshot = await transaction.get(submissionRef);

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!submissionSnapshot.exists()) throw new Error("Submission not found.");
        if (submissionSnapshot.data().status !== "pending") throw new Error("This submission has already been reviewed.");

        transaction.update(submissionRef, {
            status: "rejected",
            approvedBottles: 0,
            points: 0,
            approvedAt: null,
            rejectedAt: serverTimestamp()
        });
    });
}

async function createCouponRedemption(user, coupon, cost) {
    if (!user?.uid || !user.email || !coupon || !Number.isInteger(cost) || cost < 1) {
        throw new Error("Valid user and coupon information are required.");
    }

    return addDoc(collection(db, "couponRedemptions"), {
        userId: user.uid,
        userEmail: user.email,
        coupon,
        cost,
        status: "pending",
        createdAt: serverTimestamp(),
        approvedAt: null,
        rejectedAt: null
    });
}

async function reviewCouponRedemption(adminUid, redemptionId, approve) {
    return runTransaction(db, async transaction => {
        const adminRef = doc(db, "admins", adminUid);
        const redemptionRef = doc(db, "couponRedemptions", redemptionId);
        const adminSnapshot = await transaction.get(adminRef);
        const redemptionSnapshot = await transaction.get(redemptionRef);

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!redemptionSnapshot.exists()) throw new Error("Coupon request not found.");

        const redemption = redemptionSnapshot.data();
        if (redemption.status !== "pending") throw new Error("This coupon request has already been reviewed.");

        let userSnapshot;
        let userRef;
        let user;
        if (approve) {
            userRef = doc(db, "users", redemption.userId);
            userSnapshot = await transaction.get(userRef);
            if (!userSnapshot.exists()) throw new Error("User profile not found.");
            user = userSnapshot.data();
            if (Number(user.points || 0) < redemption.cost) throw new Error("ผู้ใช้มีคะแนนไม่เพียงพอแล้ว");
        }

        transaction.update(redemptionRef, {
            status: approve ? "approved" : "rejected",
            approvedAt: approve ? serverTimestamp() : null,
            rejectedAt: approve ? null : serverTimestamp()
        });
        if (approve) {
            transaction.update(userRef, {
                points: Number(user.points || 0) - redemption.cost
            });
        }
    });
}


export {
    auth,
    db,
    saveEducationData,
    createBottleSubmission,
    approveBottleSubmission,
    rejectBottleSubmission,
    createCouponRedemption,
    reviewCouponRedemption,

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
    where,
    orderBy,
    serverTimestamp,
    runTransaction
};
