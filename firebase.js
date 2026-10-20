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
    onSnapshot,
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
        dormType: dormType || null
    };

    await setDoc(
        doc(db, "users", uid),
        educationData,
        { merge: true }
    );
}

/** Read the signed-in user's profile, creating a zero-balance profile only when absent. */
async function getOrCreateUserProfile(user) {
    if (!user?.uid) throw new Error("A signed-in user is required to load a profile.");
    const userRef = doc(db, "users", user.uid);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(userRef);
        if (snapshot.exists()) return snapshot.data();

        const profile = {
            uid: user.uid,
            username: user.displayName || user.email?.split("@")[0] || "User",
            email: user.email || "",
            bottles: 0,
            points: 0,
            money: 0,
            createdAt: serverTimestamp()
        };
        transaction.set(userRef, profile);
        return profile;
    });
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

    let approvalUserId = "unknown";
    try {
        return await runTransaction(db, async transaction => {
        const adminRef = doc(db, "admins", adminUid);
        const submissionRef = doc(db, "submissions", submissionId);
        const adminSnapshot = await transaction.get(adminRef);
        const submissionSnapshot = await transaction.get(submissionRef);

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!submissionSnapshot.exists()) throw new Error("Submission not found.");

        const submission = submissionSnapshot.data();
        approvalUserId = submission.userId || "unknown";
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
    } catch (error) {
        if (error?.code === "permission-denied") {
            console.error("[Approval] Firestore denied the atomic transaction. The SDK returns one permission error for the transaction, not the specific denied write:", {
                code: error.code,
                message: error.message,
                submissionId,
                userId: approvalUserId,
                operations: {
                    "submission update": `submissions/${submissionId}`,
                    "user update": `users/${approvalUserId}`,
                    "history create": `users/${approvalUserId}/history/${submissionId}`
                },
                error
            });
        }
        throw error;
    }
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
    if (!user?.uid || !coupon?.id || !Number.isInteger(cost) || cost < 1) {
        throw new Error("ข้อมูลผู้ใช้หรือคูปองไม่ถูกต้อง");
    }
    const userRef = doc(db, "users", user.uid);
    const couponRef = doc(db, "coupons", coupon.id);
    const redemptionRef = doc(db, "couponRedemptions", `${user.uid}_${coupon.id}`);

    return runTransaction(db, async transaction => {
        const [userSnapshot, couponSnapshot, existingRedemption] = await Promise.all([
            transaction.get(userRef), transaction.get(couponRef), transaction.get(redemptionRef)
        ]);
        if (existingRedemption.exists()) throw new Error("DUPLICATE_REDEMPTION");
        if (!userSnapshot.exists()) throw new Error("USER_NOT_FOUND");
        if (!couponSnapshot.exists()) throw new Error("COUPON_UNAVAILABLE");
        const userData = userSnapshot.data();
        const couponData = couponSnapshot.data();
        if (couponData.status !== "active") throw new Error("COUPON_UNAVAILABLE");
        if (couponData.remainingQuantity <= 0) throw new Error("COUPON_SOLD_OUT");
        if (userData.points < couponData.pointsCost) throw new Error("INSUFFICIENT_POINTS");

        const redemption = {
            userId: user.uid,
            userEmail: user.email || "",
            couponId: coupon.id,
            coupon: couponData.name,
            couponDescription: couponData.description,
            cost: couponData.pointsCost,
            status: "redeemed",
            createdAt: serverTimestamp(),
            approvedAt: null,
            rejectedAt: null
        };
        transaction.update(userRef, {
            points: userData.points - couponData.pointsCost,
            lastCouponRedemptionId: redemptionRef.id
        });
        transaction.update(couponRef, {
            remainingQuantity: couponData.remainingQuantity - 1,
            quantity: couponData.remainingQuantity - 1,
            lastRedemptionId: redemptionRef.id
        });
        transaction.set(redemptionRef, redemption);
        return redemptionRef.id;
    });
}

const COUPON_CATALOG = [
    { id: "mr-wof", name: "มิสเตอร์วอฟ (โรงอาหาร SC)", description: "ส่วนลด 5 บาท", pointsCost: 50, totalQuantity: 50, remainingQuantity: 50, quantity: 50, status: "active", icon: "🍽️" },
    { id: "mee-katak", name: "หมี่กระต้าก", description: "ส่วนลด 15 บาท", pointsCost: 100, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍜" },
    { id: "tokyo-discount", name: "โตเกียวแม่บัว — ส่วนลด", description: "ซื้อครบ 40 บาท ลด 5 บาท", pointsCost: 80, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🥞" },
    { id: "tokyo-free", name: "โตเกียวแม่บัว — บัตรฟรี", description: "บัตรฟรีมูลค่า 20 บาท", pointsCost: 100, totalQuantity: 20, remainingQuantity: 20, quantity: 20, status: "active", icon: "🎟️" },
    { id: "longkai", name: "ร้านลองไก่กรอบ เชียง 1", description: "ส่วนลด 10%", pointsCost: 100, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍗" },
    { id: "fruit-lab", name: "Fruit Lab", description: "ส่วนลด 10%", pointsCost: 100, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍓" },
    { id: "yum-yupa", name: "ยำยูป้า", description: "ส่วนลด 10 บาท", pointsCost: 80, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "pending", icon: "🥗" }
];

async function initializeCouponCatalog(adminUid) {
    if (!adminUid) return;
    const adminSnapshot = await getDoc(doc(db, "admins", adminUid));
    if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") return;
    for (const coupon of COUPON_CATALOG) {
        const couponRef = doc(db, "coupons", coupon.id);
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(couponRef);
            if (!snapshot.exists()) {
                transaction.set(couponRef, coupon);
                return;
            }
            const existing = snapshot.data();
            const remainingQuantity = Number.isInteger(existing.remainingQuantity)
                ? existing.remainingQuantity
                : Number.isInteger(existing.quantity) ? existing.quantity : coupon.remainingQuantity;
            const totalQuantity = Number.isInteger(existing.totalQuantity) && existing.totalQuantity >= remainingQuantity
                ? existing.totalQuantity
                : Math.max(coupon.totalQuantity, remainingQuantity);
            const migration = {};
            if (!Number.isInteger(existing.pointsCost)) migration.pointsCost = coupon.pointsCost;
            if (existing.totalQuantity !== totalQuantity) migration.totalQuantity = totalQuantity;
            if (!Number.isInteger(existing.remainingQuantity)) migration.remainingQuantity = remainingQuantity;
            if (existing.quantity !== remainingQuantity) migration.quantity = remainingQuantity;
            if (!existing.status) migration.status = coupon.status;
            if (Object.keys(migration).length) transaction.update(couponRef, migration);
        });
    }
}

async function updateCouponAdmin(adminUid, couponId, updates) {
    const { pointsCost, totalQuantity, remainingQuantity, status } = updates || {};
    if (!adminUid || !couponId || !Number.isInteger(pointsCost) || pointsCost < 1
        || !Number.isInteger(totalQuantity) || totalQuantity < 0
        || !Number.isInteger(remainingQuantity) || remainingQuantity < 0
        || remainingQuantity > totalQuantity || !["active", "pending"].includes(status)) {
        throw new Error("Invalid coupon settings.");
    }
    const adminRef = doc(db, "admins", adminUid);
    const couponRef = doc(db, "coupons", couponId);
    return runTransaction(db, async transaction => {
        const [adminSnapshot, couponSnapshot] = await Promise.all([
            transaction.get(adminRef), transaction.get(couponRef)
        ]);
        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!couponSnapshot.exists()) throw new Error("Coupon not found.");
        transaction.update(couponRef, {
            pointsCost,
            totalQuantity,
            remainingQuantity,
            quantity: remainingQuantity,
            status
        });
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
    getOrCreateUserProfile,
    createBottleSubmission,
    approveBottleSubmission,
    rejectBottleSubmission,
    createCouponRedemption,
    initializeCouponCatalog,
    updateCouponAdmin,
    COUPON_CATALOG,
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
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    runTransaction,
    writeBatch,
    deleteField
};
