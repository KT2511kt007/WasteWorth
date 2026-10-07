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
    runTransaction,
    writeBatch,
    deleteField
}
from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDCcPM0tFhuiKf5CLl_I44wBxQyT1Vwar8",
    authDomain: "woste-4dbbe.firebaseapp.com",
    projectId: "woste-4dbbe",
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

async function createBottleSubmission(user, bottles, photoURL) {
    if (!user?.uid || !user.email || !Number.isInteger(bottles) || bottles < 1) {
        throw new Error("Valid user and bottle count are required.");
    }
    if (typeof photoURL !== "string" || !photoURL.startsWith("data:image/jpeg;base64,") || photoURL.length > 700 * 1024) {
        throw new Error("รูปใหญ่เกินไป กรุณาถ่ายรูปใหม่");
    }

    return addDoc(collection(db, "submissions"), {
        userId: user.uid,
        userEmail: user.email,
        bottles,
        approvedBottles: 0,
        points: 0,
        money: 0,
        photoURL,
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
            money: earnedMoney,
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

/** Reset test data while preserving Auth accounts, admin documents, and user profiles. */
async function resetAllUserData() {
    const currentUser = auth.currentUser;
    console.log("[Reset Admin Check] currentUser.uid:", currentUser?.uid ?? null);
    if (!currentUser) {
        throw new Error("ต้องเข้าสู่ระบบด้วยบัญชี Admin ก่อน");
    }

    let adminSnapshot;
    try {
        adminSnapshot = await getDoc(doc(db, "admins", currentUser.uid));
    } catch (error) {
        console.error("[Reset Admin Check] Could not read admin document:", error);
        error.resetStage = "ตรวจสอบเอกสาร Admin";
        throw error;
    }

    const adminExists = adminSnapshot.exists();
    const adminRole = adminExists ? adminSnapshot.data().role : null;
    console.log("[Reset Admin Check] admin document exists:", adminExists);
    console.log("[Reset Admin Check] admin role:", adminRole);
    if (!adminExists || adminRole !== "admin") {
        const error = new Error("บัญชีนี้ไม่มีสิทธิ์ Admin");
        error.code = "admin-required";
        throw error;
    }

    let resetStage = "อ่านข้อมูลจาก Firestore";
    try {
        const [usersSnapshot, submissionsSnapshot, couponsSnapshot] = await Promise.all([
            getDocs(collection(db, "users")),
            getDocs(collection(db, "submissions")),
            getDocs(collection(db, "couponRedemptions"))
        ]);

        const operations = [];
        let historiesDeleted = 0;
        for (const userSnapshot of usersSnapshot.docs) {
            const userRef = doc(db, "users", userSnapshot.id);
            operations.push(batch => batch.update(userRef, {
                bottles: 0,
                points: 0,
                money: 0,
                university: deleteField(),
                dormType: deleteField()
            }));

            resetStage = `อ่านประวัติของผู้ใช้ ${userSnapshot.id}`;
            const historySnapshot = await getDocs(collection(db, "users", userSnapshot.id, "history"));
            historiesDeleted += historySnapshot.size;
            historySnapshot.docs.forEach(history => {
                operations.push(batch => batch.delete(history.ref));
            });
        }
        submissionsSnapshot.docs.forEach(submission => {
            operations.push(batch => batch.delete(submission.ref));
        });
        couponsSnapshot.docs.forEach(coupon => {
            operations.push(batch => batch.delete(coupon.ref));
        });

        for (let start = 0; start < operations.length; start += 400) {
            resetStage = `บันทึกชุดข้อมูล ${Math.floor(start / 400) + 1}`;
            const batch = writeBatch(db);
            operations.slice(start, start + 400).forEach(addOperation => addOperation(batch));
            await batch.commit();
        }

        return {
            usersReset: usersSnapshot.size,
            historiesDeleted,
            submissionsDeleted: submissionsSnapshot.size,
            couponsDeleted: couponsSnapshot.size
        };
    } catch (error) {
        error.resetStage = resetStage;
        throw error;
    }
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
    resetAllUserData,

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
    runTransaction,
    writeBatch,
    deleteField
};
