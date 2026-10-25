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


export const BOTTLE_VALUE_SATANG = 30;

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
    let approvalStage = `read admins/${adminUid}`;
    let approvalAttempt = 0;
    try {
        const result = await runTransaction(db, async transaction => {
        approvalAttempt += 1;
        console.info("[Approval] Transaction attempt started:", approvalAttempt, { adminUid, submissionId, approvedBottles });
        const adminRef = doc(db, "admins", adminUid);
        const submissionRef = doc(db, "submissions", submissionId);
        console.info("[Approval] Before read:", `admins/${adminUid}`);
        const adminSnapshot = await transaction.get(adminRef);
        console.info("[Approval] After read:", `admins/${adminUid}`, {
            exists: adminSnapshot.exists(),
            role: adminSnapshot.exists() ? adminSnapshot.data().role : null
        });
        approvalStage = `read submissions/${submissionId}`;
        console.info("[Approval] Before read:", `submissions/${submissionId}`);
        const submissionSnapshot = await transaction.get(submissionRef);
        console.info("[Approval] After read:", `submissions/${submissionId}`, {
            exists: submissionSnapshot.exists(),
            status: submissionSnapshot.exists() ? submissionSnapshot.data().status : null
        });

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!submissionSnapshot.exists()) throw new Error("Submission not found.");

        const submission = submissionSnapshot.data();
        approvalUserId = submission.userId || "unknown";
        if (submission.status !== "pending") throw new Error("This submission has already been reviewed.");
        if (approvedBottles > submission.bottles) throw new Error("Approved count cannot exceed the submitted count.");

        const userRef = doc(db, "users", submission.userId);
        approvalStage = `read users/${submission.userId}`;
        console.info("[Approval] Before read:", `users/${submission.userId}`);
        const userSnapshot = await transaction.get(userRef);
        console.info("[Approval] After read:", `users/${submission.userId}`, {
            exists: userSnapshot.exists(),
            bottles: userSnapshot.exists() ? userSnapshot.data().bottles : null,
            points: userSnapshot.exists() ? userSnapshot.data().points : null
        });
        if (!userSnapshot.exists()) throw new Error("User profile not found.");

        const user = userSnapshot.data();
        const earnedPoints = approvedBottles * 2;
        const earnedMoney = approvedBottles * BOTTLE_VALUE_SATANG / 100;
        const historyRef = doc(db, "users", submission.userId, "history", submissionId);

        approvalStage = "commit atomic approval writes: submission, user balance, history";
        console.info("[Approval] Before write:", `submissions/${submissionId}`, {
            status: "approved", approvedBottles, points: earnedPoints
        });
        transaction.update(submissionRef, {
            status: "approved",
            approvedBottles,
            points: earnedPoints,
            money: earnedMoney,
            approvedAt: serverTimestamp(),
            rejectedAt: null
        });
        console.info("[Approval] Queued write:", `submissions/${submissionId}`);
        console.info("[Approval] Before write:", `users/${submission.userId}`, {
            bottles: Number(user.bottles || 0) + approvedBottles,
            points: Number(user.points || 0) + earnedPoints
        });
        transaction.update(userRef, {
            bottles: Number(user.bottles || 0) + approvedBottles,
            points: Number(user.points || 0) + earnedPoints,
            money: Number(user.money || 0) + earnedMoney,
            lastBottleSubmissionId: submissionId
        });
        console.info("[Approval] Queued write:", `users/${submission.userId}`);
        console.info("[Approval] Before write:", `users/${submission.userId}/history/${submissionId}`);
        transaction.set(historyRef, {
            bottles: approvedBottles,
            points: earnedPoints,
            money: earnedMoney,
            submissionId,
            createdAt: serverTimestamp()
        });
        console.info("[Approval] Queued write:", `users/${submission.userId}/history/${submissionId}`);
        });
        console.info("[Approval] Transaction committed:", {
            adminUid, submissionId, userId: approvalUserId, approvedBottles,
            pointsAwarded: approvedBottles * 2, writes: [
                `submissions/${submissionId}`,
                `users/${approvalUserId}`,
                `users/${approvalUserId}/history/${submissionId}`
            ]
        });
        return result;
    } catch (error) {
        if (error?.code === "permission-denied") {
            console.error("[Approval] Firestore permission failure:", error.code, error.message, {
                failedStage: approvalStage,
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
    let rejectionStage = `read admins/${adminUid}`;
    try {
    return await runTransaction(db, async transaction => {
        const adminRef = doc(db, "admins", adminUid);
        const submissionRef = doc(db, "submissions", submissionId);
        const adminSnapshot = await transaction.get(adminRef);
        rejectionStage = `read submissions/${submissionId}`;
        const submissionSnapshot = await transaction.get(submissionRef);

        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {
            throw new Error("Admin access required.");
        }
        if (!submissionSnapshot.exists()) throw new Error("Submission not found.");
        if (submissionSnapshot.data().status !== "pending") throw new Error("This submission has already been reviewed.");

        rejectionStage = `update submissions/${submissionId} to rejected`;
        transaction.update(submissionRef, {
            status: "rejected",
            approvedBottles: 0,
            points: 0,
            approvedAt: null,
            rejectedAt: serverTimestamp()
        });
    });
    } catch (error) {
        if (error?.code === "permission-denied") {
            console.error("[Rejection] Firestore permission failure:", error.code, error.message, {
                failedStage: rejectionStage,
                submissionId
            });
        }
        throw error;
    }
}

async function createCouponRedemption(user, coupon, cost) {
    if (!user?.uid || !coupon?.id || !Number.isInteger(cost) || cost < 1) {
        throw new Error("ข้อมูลผู้ใช้หรือคูปองไม่ถูกต้อง");
    }
    const userRef = doc(db, "users", user.uid);
    const couponRef = doc(db, "coupons", coupon.id);
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
        console.error("[Coupon Redemption] Auth context mismatch", {
            projectId: auth.app.options.projectId,
            requestedUid: user.uid,
            authenticatedUid: auth.currentUser?.uid || null
        });
        throw new Error("USER_NOT_AUTHENTICATED");
    }
    // Each successful redemption gets an independent, unguessable document ID.
    const redemptionRef = doc(collection(db, "couponRedemptions"));
    let stage = "starting transaction";
    const context = {
        projectId: auth.app.options.projectId,
        uid: user.uid,
        couponId: coupon.id,
        userPath: userRef.path,
        couponPath: couponRef.path,
        redemptionPath: redemptionRef.path
    };
    let attempt = 0;
    console.info("[Coupon Redemption] Start", context);

    try {
        const redemptionId = await runTransaction(db, async transaction => {
        attempt += 1;
        console.info("[Coupon Redemption] Transaction attempt", attempt, context);
        stage = `read ${userRef.path}`;
        console.info("[Coupon Redemption] Before read", stage);
        const userSnapshot = await transaction.get(userRef);
        console.info("[Coupon Redemption] After read", stage, {
            exists: userSnapshot.exists(),
            points: userSnapshot.exists() ? userSnapshot.data().points : null
        });

        stage = `read ${couponRef.path}`;
        console.info("[Coupon Redemption] Before read", stage);
        const couponSnapshot = await transaction.get(couponRef);
        console.info("[Coupon Redemption] After read", stage, {
            exists: couponSnapshot.exists(),
            status: couponSnapshot.exists() ? couponSnapshot.data().status : null,
            remainingQuantity: couponSnapshot.exists() ? couponSnapshot.data().remainingQuantity : null,
            pointsCost: couponSnapshot.exists() ? couponSnapshot.data().pointsCost : null
        });
        stage = "validate user profile, coupon status, points and remaining quantity";
        if (!userSnapshot.exists()) throw new Error("USER_NOT_FOUND");
        if (!couponSnapshot.exists()) throw new Error("COUPON_UNAVAILABLE");
        const userData = userSnapshot.data();
        const couponData = couponSnapshot.data();
        if (couponData.status !== "active") throw new Error("COUPON_UNAVAILABLE");
        if (!Number.isInteger(couponData.remainingQuantity) || !Number.isInteger(couponData.pointsCost)
            || couponData.pointsCost < 1 || !Number.isInteger(userData.points)) {
            throw new Error("COUPON_DATA_INVALID");
        }
        if (couponData.remainingQuantity <= 0) throw new Error("COUPON_SOLD_OUT");
        if (userData.points < couponData.pointsCost) throw new Error("INSUFFICIENT_POINTS");

        const redemption = {
            userId: user.uid,
            userEmail: user.email || "",
            couponId: coupon.id,
            coupon: couponData.name,
            couponDescription: couponData.description,
            cost: couponData.pointsCost,
            status: "available",
            createdAt: serverTimestamp(),
            usedAt: null,
            approvedAt: null,
            rejectedAt: null
        };
        stage = `queue update ${userRef.path}`;
        console.info("[Coupon Redemption] Before write", stage);
        transaction.update(userRef, {
            points: userData.points - couponData.pointsCost,
            lastCouponRedemptionId: redemptionRef.id
        });
        console.info("[Coupon Redemption] Write queued", stage, {
            pointsBefore: userData.points,
            pointsAfter: userData.points - couponData.pointsCost,
            redemptionId: redemptionRef.id
        });

        stage = `queue update ${couponRef.path}`;
        console.info("[Coupon Redemption] Before write", stage);
        transaction.update(couponRef, {
            remainingQuantity: couponData.remainingQuantity - 1,
            quantity: couponData.remainingQuantity - 1,
            lastRedemptionId: redemptionRef.id
        });
        console.info("[Coupon Redemption] Write queued", stage, {
            remainingBefore: couponData.remainingQuantity,
            remainingAfter: couponData.remainingQuantity - 1,
            redemptionId: redemptionRef.id
        });

        stage = `queue create ${redemptionRef.path}`;
        console.info("[Coupon Redemption] Before write", stage, {
            status: redemption.status,
            couponId: redemption.couponId,
            cost: redemption.cost
        });
        transaction.set(redemptionRef, redemption);
        console.info("[Coupon Redemption] Write queued", stage);
        stage = "commit transaction (all three writes are atomic)";
        return redemptionRef.id;
        });
        console.info("[Coupon Redemption] Transaction committed", {
            ...context,
            redemptionId,
            writes: [userRef.path, couponRef.path, redemptionRef.path]
        });
        return redemptionId;
    } catch (error) {
        console.error("[Coupon Redemption] Transaction failed", {
            ...context,
            attempt,
            stage,
            errorCode: error?.code,
            errorMessage: error?.message,
            error
        });
        throw error;
    }
}

async function useCouponRedemption(user, redemptionId) {
    if (!user?.uid || !redemptionId) throw new Error("USER_REQUIRED");
    const redemptionRef = doc(db, "couponRedemptions", redemptionId);
    let legacyStatusMigrated = false;

    await runTransaction(db, async transaction => {
        legacyStatusMigrated = false;
        const snapshot = await transaction.get(redemptionRef);
        if (!snapshot.exists()) throw new Error("COUPON_NOT_FOUND");
        const redemption = snapshot.data();
        if (redemption.userId !== user.uid) throw new Error("COUPON_NOT_OWNED");
        if (redemption.status === "used") throw new Error("COUPON_ALREADY_USED");
        if (redemption.status === "redeemed") {
            transaction.update(redemptionRef, { status: "available" });
            legacyStatusMigrated = true;
            return;
        }
        if (redemption.status !== "available") throw new Error("COUPON_NOT_AVAILABLE");

        transaction.update(redemptionRef, {
            status: "used",
            usedAt: serverTimestamp()
        });
    });

    // Existing records used `redeemed` to mean the user had received the coupon.
    // Normalize that legacy value first, then consume it with the guarded transition.
    if (legacyStatusMigrated) return useCouponRedemption(user, redemptionId);
}

const COUPON_CATALOG = [
    { id: "mr-wof", name: "มิสเตอร์วอฟ (โรงอาหาร SC)", description: "ส่วนลด 5 บาท", pointsCost: 10, totalQuantity: 50, remainingQuantity: 50, quantity: 50, status: "active", icon: "🍽️" },
    { id: "mee-katak", name: "หมี่กระต้าก", description: "ส่วนลด 15 บาท", pointsCost: 20, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍜" },
    { id: "tokyo-discount", name: "โตเกียวแม่บัว — ส่วนลด", description: "ซื้อครบ 40 บาท ลด 5 บาท", pointsCost: 10, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🥞" },
    { id: "tokyo-free", name: "โตเกียวแม่บัว — บัตรฟรี", description: "บัตรฟรีมูลค่า 20 บาท", pointsCost: 30, totalQuantity: 20, remainingQuantity: 20, quantity: 20, status: "active", icon: "🎟️" },
    { id: "longkai", name: "ร้านลองไก่กรอบ เชียง 1", description: "ส่วนลด 10%", pointsCost: 20, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍗" },
    { id: "fruit-lab", name: "Fruit Lab", description: "ส่วนลด 10%", pointsCost: 20, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🍓" },
    { id: "yum-yupa", name: "ยำยูป้า", description: "ส่วนลด 10 บาท", pointsCost: 15, totalQuantity: 30, remainingQuantity: 30, quantity: 30, status: "active", icon: "🥗" }
];

async function initializeCouponCatalog(adminUid) {
    if (!adminUid) return;
    const adminSnapshot = await getDoc(doc(db, "admins", adminUid));
    if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") return;
    for (const coupon of COUPON_CATALOG) {
        const couponRef = doc(db, "coupons", coupon.id);
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(couponRef);
            // Update existing coupon documents only: never create duplicates or reset inventory.
            if (!snapshot.exists()) return;
            const existing = snapshot.data();
            const migration = {};
            if (existing.pointsCost !== coupon.pointsCost) migration.pointsCost = coupon.pointsCost;
            if (coupon.id === "yum-yupa" && existing.status !== "active") migration.status = "active";
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
        console.error("[Reset Admin Check] Could not read admin document:", error.code, error.message, error);
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

    let resetStage = "read reset data";
    try {
        resetStage = "read collection users";
        const usersSnapshot = await getDocs(collection(db, "users"));
        resetStage = "read collection submissions";
        const submissionsSnapshot = await getDocs(collection(db, "submissions"));
        resetStage = "read collection couponRedemptions";
        const couponsSnapshot = await getDocs(collection(db, "couponRedemptions"));

        const operations = [];
        let historiesDeleted = 0;
        for (const userSnapshot of usersSnapshot.docs) {
            const userRef = doc(db, "users", userSnapshot.id);
            operations.push({ description: `reset users/${userSnapshot.id}`, apply: batch => batch.update(userRef, {
                bottles: 0,
                points: 0,
                money: 0,
                university: deleteField(),
                dormType: deleteField()
            }) });

            resetStage = `read users/${userSnapshot.id}/history`;
            const historySnapshot = await getDocs(collection(db, "users", userSnapshot.id, "history"));
            historiesDeleted += historySnapshot.size;
            historySnapshot.docs.forEach(history => {
                operations.push({ description: `delete ${history.ref.path}`, apply: batch => batch.delete(history.ref) });
            });
        }
        submissionsSnapshot.docs.forEach(submission => {
            operations.push({ description: `delete ${submission.ref.path}`, apply: batch => batch.delete(submission.ref) });
        });
        couponsSnapshot.docs.filter(coupon => coupon.data().status !== "used").forEach(coupon => {
            operations.push({ description: `delete ${coupon.ref.path}`, apply: batch => batch.delete(coupon.ref) });
        });

        for (let start = 0; start < operations.length; start += 400) {
            const batchOperations = operations.slice(start, start + 400);
            resetStage = `commit reset batch ${Math.floor(start / 400) + 1} (${batchOperations.length} writes)`;
            const batch = writeBatch(db);
            batchOperations.forEach(operation => operation.apply(batch));
            try {
                await batch.commit();
            } catch (error) {
                error.resetWrites = batchOperations.map(operation => operation.description);
                throw error;
            }
        }

        return {
            usersReset: usersSnapshot.size,
            historiesDeleted,
            submissionsDeleted: submissionsSnapshot.size,
            couponsDeleted: couponsSnapshot.docs.filter(coupon => coupon.data().status !== "used").length
        };
    } catch (error) {
        error.resetStage = resetStage;
        console.error("[Reset] Firestore operation failed:", error.code, error.message, {
            failedStage: resetStage,
            writes: error.resetWrites
        });
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
    useCouponRedemption,
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
