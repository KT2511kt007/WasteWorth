import {

    auth,
    db,
    approveBottleSubmission,
    rejectBottleSubmission,
    reviewCouponRedemption,
    initializeCouponCatalog,
    updateCouponAdmin,
    resetAllUserData,

    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,
    getDoc,

    collection,
    getDocs,
    onSnapshot,
    query,
    where

} from "./firebase.js";


const dashboard =
    document.getElementById(
        "dashboard"
    );


const message =
    document.getElementById(
        "adminMessage"
    );


const usersTable =
    document.getElementById(
        "usersTable"
    );
const dataMessage = document.getElementById("adminDataMessage");


let users = [];
let currentAdmin = null;
let adminDataErrors = [];
let adminCouponsUnsubscribe = null;


/* ================= AUTH ================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            currentAdmin = null;
            if (adminCouponsUnsubscribe) adminCouponsUnsubscribe();
            adminCouponsUnsubscribe = null;

            dashboard.classList.add("hidden");

            showError(
                "กรุณา Login ก่อน"
            );

            return;

        }

        console.info("Admin Firebase Auth UID:", user.uid, "project:", auth.app.options.projectId);


        let adminSnapshot;
        try {
            console.info("[Admin Auth] Before Firestore read:", `admins/${user.uid}`, "project:", auth.app.options.projectId);
            adminSnapshot = await getDoc(doc(db, "admins", user.uid));
            console.info("[Admin Auth] After Firestore read:", `admins/${user.uid}`, {
                exists: adminSnapshot.exists(),
                role: adminSnapshot.exists() ? adminSnapshot.data().role : null,
                authUid: user.uid,
                project: auth.app.options.projectId
            });
        } catch (error) {
            console.error("Admin document lookup failed:", error.code, error.message, error);
            dashboard.classList.add("hidden");
            showError("ตรวจสอบสิทธิ์ Admin ไม่สำเร็จ กรุณาตรวจ Firestore Rules");
            return;
        }


        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {

            console.error("Admin access denied:", user.uid, adminSnapshot.exists() ? adminSnapshot.data().role : "no admins document");

            dashboard.classList.add("hidden");

            showError(
            "บัญชีนี้ไม่มีสิทธิ์ Admin (ต้องมี role: admin)"
            );

            return;

        }

        console.info("Admin authorization confirmed:", `admins/${user.uid}`, adminSnapshot.data().role);
        message.classList.add("hidden");


        dashboard.classList.remove(
            "hidden"
        );

        currentAdmin = user;
        adminDataErrors = [];
        dataMessage.classList.add("hidden");
        ["totalUsers", "totalBottles", "totalPoints"].forEach(id => {
            document.getElementById(id).textContent = "…";
        });

        const catalogSetup = initializeCouponCatalog(user.uid)
            .catch(error => reportAdminDataError("เตรียมรายการคูปอง", error));

        await Promise.all([
            catalogSetup,
            loadUsers(),
            loadPendingSubmissions(),
            loadPendingCouponRedemptions(),
            loadAdminCoupons()
        ]);
        await loadUsedCouponRedemptions();

    }
);


/* ================= LOAD USERS ================= */

async function loadUsers() {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        users = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderUsers(users);
        updateStats(users);
    } catch (error) {
        ["totalUsers", "totalBottles", "totalPoints"].forEach(id => {
            document.getElementById(id).textContent = "—";
        });
        usersTable.replaceChildren();
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "โหลด Users ไม่สำเร็จ ตรวจสอบข้อความผิดพลาดด้านบน";
        row.appendChild(cell);
        usersTable.appendChild(row);
        reportAdminDataError("อ่าน collection users", error);
    }

}

function loadAdminCoupons() {
    const list = document.getElementById("adminCoupons");
    if (adminCouponsUnsubscribe) adminCouponsUnsubscribe();
    list.textContent = "กำลังโหลดคูปอง…";
    adminCouponsUnsubscribe = onSnapshot(collection(db, "coupons"), snapshot => {
        list.replaceChildren();
        if (snapshot.empty) {
            list.textContent = "ยังไม่มีคูปองใน Firestore";
            return;
        }
        snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "th"))
            .forEach(coupon => {
                const card = document.createElement("article");
                card.className = "admin-coupon-card";
                const heading = document.createElement("div");
                heading.className = "admin-coupon-heading";
                const name = document.createElement("h3");
                name.textContent = coupon.name || coupon.id;
                const state = document.createElement("span");
                state.className = `admin-coupon-status ${coupon.status === "active" ? "is-active" : "is-pending"}`;
                state.textContent = coupon.status === "active" ? "เปิดให้แลก" : "รอคอนเฟิร์ม";
                heading.append(name, state);

                const description = document.createElement("p");
                description.textContent = coupon.description || "";
                const fields = document.createElement("div");
                fields.className = "admin-coupon-fields";
                const pointsInput = makeCouponNumberField("คะแนนที่ใช้แลก", coupon.pointsCost, 1);
                const totalInput = makeCouponNumberField("สิทธิ์ทั้งหมด", coupon.totalQuantity ?? coupon.quantity ?? 0, 0);
                const remainingInput = makeCouponNumberField("สิทธิ์คงเหลือ", coupon.remainingQuantity ?? coupon.quantity ?? 0, 0);
                fields.append(pointsInput.wrapper, totalInput.wrapper, remainingInput.wrapper);

                const actions = document.createElement("div");
                actions.className = "admin-coupon-actions";
                const saveButton = document.createElement("button");
                saveButton.type = "button";
                saveButton.textContent = "บันทึกค่า";
                saveButton.addEventListener("click", () => saveCouponSettings(coupon, {
                    pointsCost: Number(pointsInput.input.value),
                    totalQuantity: Number(totalInput.input.value),
                    remainingQuantity: Number(remainingInput.input.value),
                    status: coupon.status === "pending" ? "pending" : "active"
                }, saveButton, card));
                actions.appendChild(saveButton);

                if (coupon.status === "pending") {
                    const confirmButton = document.createElement("button");
                    confirmButton.type = "button";
                    confirmButton.className = "confirm-coupon-button";
                    confirmButton.textContent = "ยืนยันและเปิดให้แลก";
                    confirmButton.addEventListener("click", () => saveCouponSettings(coupon, {
                        pointsCost: Number(pointsInput.input.value),
                        totalQuantity: Number(totalInput.input.value),
                        remainingQuantity: Number(remainingInput.input.value),
                        status: "active"
                    }, confirmButton, card));
                    actions.appendChild(confirmButton);
                } else {
                    const pauseButton = document.createElement("button");
                    pauseButton.type = "button";
                    pauseButton.className = "pause-coupon-button";
                    pauseButton.textContent = "พักคูปอง";
                    pauseButton.addEventListener("click", () => saveCouponSettings(coupon, {
                        pointsCost: Number(pointsInput.input.value),
                        totalQuantity: Number(totalInput.input.value),
                        remainingQuantity: Number(remainingInput.input.value),
                        status: "pending"
                    }, pauseButton, card));
                    actions.appendChild(pauseButton);
                }
                const result = document.createElement("p");
                result.className = "admin-coupon-result";
                result.setAttribute("role", "status");
                card.append(heading, description, fields, actions, result);
                list.appendChild(card);
            });
    }, error => {
        reportAdminDataError("อ่าน collection coupons", error);
        list.textContent = "โหลดรายการคูปองไม่สำเร็จ ตรวจสอบ Firestore Rules";
    });
}

function makeCouponNumberField(labelText, value, min) {
    const wrapper = document.createElement("label");
    wrapper.className = "admin-coupon-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.step = "1";
    input.value = String(Number.isInteger(value) ? value : 0);
    wrapper.append(label, input);
    return { wrapper, input };
}

async function saveCouponSettings(coupon, updates, button, card) {
    if (!currentAdmin) return;
    const result = card.querySelector(".admin-coupon-result");
    button.disabled = true;
    result.textContent = "กำลังบันทึก…";
    try {
        await updateCouponAdmin(currentAdmin.uid, coupon.id, updates);
        result.textContent = "บันทึกแล้ว";
    } catch (error) {
        console.error(error.code, error.message, error);
        result.textContent = error.message || "บันทึกไม่สำเร็จ";
    } finally {
        button.disabled = false;
    }
}


/* ================= PENDING SUBMISSIONS ================= */

async function loadPendingSubmissions() {
    const list = document.getElementById("pendingSubmissions");
    list.replaceChildren();

    try {
        const pendingQuery = query(
            collection(db, "submissions"),
            where("status", "==", "pending")
        );
        const snapshot = await getDocs(pendingQuery);
        const submissions = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        if (!submissions.length) {
            list.textContent = "ไม่มีรายการรออนุมัติ";
            list.className = "pending-list pending-message";
            return;
        }

        list.className = "pending-list";
        submissions.forEach(submission => {
            const card = document.createElement("article");
            card.className = "pending-item";

            const details = document.createElement("div");
            details.className = "pending-details";
            const email = document.createElement("strong");
            email.textContent = submission.userEmail || submission.userId;
            const count = document.createElement("span");
            count.textContent = `แจ้งจำนวน: ${submission.bottles} ขวด`;
            const photo = document.createElement("img");
            photo.className = "pending-photo";
            photo.alt = "รูปขวดที่ผู้ใช้ส่งมา";
            const safePhoto = typeof submission.photoURL === "string"
                && /^data:image\/(jpeg|png|webp);base64,/.test(submission.photoURL);
            photo.hidden = !safePhoto;
            if (safePhoto) {
                photo.src = submission.photoURL;
                photo.addEventListener("error", () => showPhotoFallback(photo), { once: true });
                photo.addEventListener("click", () => openPhotoDialog(submission.photoURL));
                photo.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPhotoDialog(submission.photoURL);
                    }
                });
                photo.tabIndex = 0;
                photo.setAttribute("role", "button");
                photo.setAttribute("aria-label", "เปิดรูปหลักฐานขนาดใหญ่");
            } else {
                const fallback = document.createElement("span");
                fallback.className = "photo-fallback";
                fallback.textContent = "ไม่สามารถแสดงรูปหลักฐานได้";
                details.appendChild(fallback);
            }
            const date = document.createElement("span");
            date.className = "pending-date";
            date.textContent = `วันที่: ${submission.createdAt?.toDate?.().toLocaleString("th-TH") || "กำลังบันทึก"} · สถานะ: ${submission.status}`;
            details.append(email, count, date, photo);

            const approvedCount = document.createElement("input");
            approvedCount.className = "pending-count";
            approvedCount.type = "number";
            approvedCount.min = "1";
            approvedCount.max = String(submission.bottles);
            approvedCount.step = "1";
            approvedCount.value = String(submission.bottles);
            approvedCount.setAttribute("aria-label", "จำนวนขวดที่อนุมัติ");

            const actions = document.createElement("div");
            actions.className = "pending-actions";
            const approve = document.createElement("button");
            approve.type = "button";
            approve.className = "approve-button";
            approve.textContent = "✅ อนุมัติ";
            approve.addEventListener("click", () => reviewSubmission(submission.id, submission.userId, "approve", approvedCount, approve, reject));

            const reject = document.createElement("button");
            reject.type = "button";
            reject.className = "reject-button";
            reject.textContent = "❌ ปฏิเสธ";
            reject.addEventListener("click", () => reviewSubmission(submission.id, submission.userId, "reject", approvedCount, approve, reject));
            actions.append(approve, reject);
            card.append(details, approvedCount, actions);
            list.appendChild(card);
        });
    } catch (error) {
        reportAdminDataError("อ่าน collection submissions", error);
        list.textContent = "โหลดรายการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและ Firestore Rules";
        list.className = "pending-list pending-message";
    }
}

function showPhotoFallback(photo) {
    const fallback = document.createElement("span");
    fallback.className = "photo-fallback";
    fallback.textContent = "ไม่สามารถแสดงรูปหลักฐานได้";
    photo.replaceWith(fallback);
}

function openPhotoDialog(photoURL) {
    if (typeof photoURL !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photoURL)) return;
    const dialog = document.getElementById("photoDialog");
    document.getElementById("largeSubmissionPhoto").src = photoURL;
    dialog.showModal();
}

document.getElementById("closePhotoDialog").addEventListener("click", () => {
    document.getElementById("photoDialog").close();
});
document.getElementById("photoDialog").addEventListener("click", event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
});

const resetDialog = document.getElementById("resetDialog");
const resetConfirmationInput = document.getElementById("resetConfirmationInput");
const confirmResetButton = document.getElementById("confirmResetButton");

document.getElementById("openResetDialogButton").addEventListener("click", () => {
    resetConfirmationInput.value = "";
    document.getElementById("resetDialogMessage").textContent = "";
    resetDialog.showModal();
    resetConfirmationInput.focus();
});

document.getElementById("cancelResetButton").addEventListener("click", () => resetDialog.close());

confirmResetButton.addEventListener("click", async () => {
    const dialogMessage = document.getElementById("resetDialogMessage");
    if (resetConfirmationInput.value !== "RESET") {
        dialogMessage.textContent = "คำยืนยันไม่ถูกต้อง กรุณาพิมพ์ RESET ให้ตรงทุกตัวอักษร";
        return;
    }
    if (!currentAdmin || auth.currentUser?.uid !== currentAdmin.uid) {
        dialogMessage.textContent = "เซสชัน Admin ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่";
        return;
    }

    confirmResetButton.disabled = true;
    document.getElementById("cancelResetButton").disabled = true;
    dialogMessage.textContent = "กำลังรีเซ็ตข้อมูล...";
    try {
        const counts = await resetAllUserData();
        await Promise.all([loadUsers(), loadPendingSubmissions(), loadPendingCouponRedemptions(), loadUsedCouponRedemptions()]);
        document.getElementById("resetResult").textContent =
            `รีเซ็ตข้อมูลสำเร็จ · รีเซ็ตผู้ใช้ ${counts.usersReset} ราย · ลบประวัติ ${counts.historiesDeleted} รายการ · ลบคำขอขวด ${counts.submissionsDeleted} รายการ · ลบคำขอคูปอง ${counts.couponsDeleted} รายการ`;
        resetDialog.close();
    } catch (error) {
        console.error("Could not reset user data:", error.code, error.message, {
            failedStage: error.resetStage,
            writes: error.resetWrites,
            error
        });
        dialogMessage.textContent = getResetErrorMessage(error);
    } finally {
        confirmResetButton.disabled = false;
        document.getElementById("cancelResetButton").disabled = false;
    }
});

function getResetErrorMessage(error) {
    switch (error?.code) {
        case "permission-denied":
            return `ตรวจสอบบัญชี Admin ผ่านแล้ว แต่ Firestore ปฏิเสธขั้นตอน${error.resetStage || "รีเซ็ต"} กรุณา Deploy Firestore Rules ล่าสุดของโปรเจกต์นี้`;
        case "admin-required":
            return "ไม่มีสิทธิ์รีเซ็ตข้อมูล: ไม่พบ admins/{uid} ที่มี role เป็น admin";
        case "unauthenticated":
            return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบ Admin ใหม่";
        case "unavailable":
        case "deadline-exceeded":
            return "เชื่อมต่อ Firestore ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";
        case "resource-exhausted":
            return "มีข้อมูลจำนวนมากเกินกว่าจะรีเซ็ตได้ในขณะนี้ กรุณาลองอีกครั้ง";
        default:
            return "รีเซ็ตข้อมูลไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Admin และ Firestore Rules ที่ Deploy แล้ว จากนั้นลองใหม่";
    }
}

async function reviewSubmission(submissionId, userId, action, approvedCount, approveButton, rejectButton) {
    if (!currentAdmin) return;
    approveButton.disabled = true;
    rejectButton.disabled = true;

    try {
        if (action === "approve") {
            const count = Number(approvedCount.value);
            if (!Number.isInteger(count) || count < 1 || count > Number(approvedCount.max)) {
                throw new Error("จำนวนที่อนุมัติต้องเป็นจำนวนเต็มและไม่เกินจำนวนที่แจ้ง");
            }
            console.info("[Admin Approval] Starting:", {
                adminUid: currentAdmin.uid,
                submissionId,
                userId,
                approvedBottles: count,
                project: auth.app.options.projectId
            });
            await approveBottleSubmission(currentAdmin.uid, submissionId, count);
            console.info("[Admin Approval] Completed:", { submissionId, userId, approvedBottles: count });
        } else {
            await rejectBottleSubmission(currentAdmin.uid, submissionId);
        }

        await Promise.all([loadPendingSubmissions(), loadUsers()]);
    } catch (error) {
        console.error(`Could not ${action} submission ${submissionId}:`, error?.code, error?.message, {
            submissionId,
            userId,
            failedStage: action === "approve"
                ? "atomic approval transaction; check the submission, user balance, and history paths in the Firestore log"
                : "submission review transaction",
            error
        });
        alert(error.message || "ดำเนินการไม่สำเร็จ");
        approveButton.disabled = false;
        rejectButton.disabled = false;
    }
}

async function loadPendingCouponRedemptions() {
    const list = document.getElementById("pendingCouponRedemptions");
    list.replaceChildren();

    try {
        const snapshot = await getDocs(collection(db, "couponRedemptions"));
        const requests = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        if (!requests.length) {
            list.textContent = "ไม่มีคำขอแลกคูปอง";
            list.className = "pending-list pending-message";
            return;
        }

        list.className = "pending-list";
        requests.forEach(request => {
            const card = document.createElement("article");
            card.className = "pending-item";
            const details = document.createElement("div");
            details.className = "pending-details";
            const email = document.createElement("strong");
            email.textContent = request.userEmail || request.userId;
            const coupon = document.createElement("span");
            coupon.textContent = `${request.coupon || request.couponDescription || request.couponId || "คูปอง"} · ${request.cost || 0} คะแนน`;
            const date = document.createElement("span");
            date.className = "pending-date";
            date.textContent = `วันที่: ${request.createdAt?.toDate?.().toLocaleString("th-TH") || "กำลังบันทึก"} · สถานะ: ${request.status}`;
            details.append(email, coupon, date);

            if (request.status === "pending") {
            const actions = document.createElement("div");
            actions.className = "pending-actions";
            const approve = document.createElement("button");
            approve.type = "button";
            approve.className = "approve-button";
            approve.textContent = "✅ อนุมัติ";
            const reject = document.createElement("button");
            reject.type = "button";
            reject.className = "reject-button";
            reject.textContent = "❌ ปฏิเสธ";
            const review = async approved => {
                approve.disabled = true;
                reject.disabled = true;
                try {
                    await reviewCouponRedemption(currentAdmin.uid, request.id, approved);
                    await Promise.all([loadPendingCouponRedemptions(), loadUsers()]);
                } catch (error) {
                    console.error(error.code, error.message, error);
                    alert(error.message || "ดำเนินการไม่สำเร็จ");
                    approve.disabled = false;
                    reject.disabled = false;
                }
            };
            approve.addEventListener("click", () => review(true));
            reject.addEventListener("click", () => review(false));
            actions.append(approve, reject);
            card.append(details, actions);
            } else {
                const status = document.createElement("span");
                status.textContent = `สถานะ: ${request.status || "unknown"}`;
                card.append(details, status);
            }
            list.appendChild(card);
        });
    } catch (error) {
        reportAdminDataError("อ่าน collection couponRedemptions", error);
        list.textContent = "โหลดคำขอคูปองไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules";
        list.className = "pending-list pending-message";
    }
}

async function loadUsedCouponRedemptions() {
    const list = document.getElementById("usedCouponRedemptions");
    if (!list) return;
    list.replaceChildren();

    try {
        const [redemptionsSnapshot, usersSnapshot] = await Promise.all([
            getDocs(collection(db, "couponRedemptions")),
            getDocs(collection(db, "users"))
        ]);
        const usernames = new Map(usersSnapshot.docs.map(user => [
            user.id,
            user.data().username || user.data().email || user.id
        ]));
        const usedRedemptions = redemptionsSnapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.status === "used")
            .sort((a, b) => (b.usedAt?.toMillis?.() || 0) - (a.usedAt?.toMillis?.() || 0));

        if (!usedRedemptions.length) {
            list.textContent = "ยังไม่มีคูปองที่ถูกใช้";
            list.className = "pending-list pending-message";
            return;
        }

        list.className = "pending-list";
        usedRedemptions.forEach(redemption => {
            const row = document.createElement("article");
            row.className = "pending-item";
            const details = document.createElement("div");
            details.className = "pending-details";
            const user = document.createElement("strong");
            user.textContent = `ผู้ใช้: ${usernames.get(redemption.userId) || redemption.userId}`;
            const shop = document.createElement("span");
            shop.textContent = `ร้าน: ${redemption.coupon || redemption.couponId || "คูปอง"}`;
            const code = document.createElement("span");
            code.textContent = `รหัสคูปอง: ${redemption.id}`;
            const usedAt = document.createElement("span");
            usedAt.className = "pending-date";
            usedAt.textContent = `ใช้เมื่อ: ${redemption.usedAt?.toDate?.().toLocaleString("th-TH") || "ไม่พบเวลาใช้"}`;
            details.append(user, shop, code, usedAt);
            row.append(details);
            list.append(row);
        });
    } catch (error) {
        reportAdminDataError("อ่านประวัติคูปองที่ใช้แล้ว", error);
        list.textContent = `โหลดประวัติคูปองไม่สำเร็จ (${error.code || "unknown"}): ${error.message || ""}`;
        list.className = "pending-list pending-message";
    }
}


/* ================= RENDER ================= */

function renderUsers(data) {

    usersTable.innerHTML = "";

    if (data.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "ไม่พบข้อมูลผู้ใช้";
        row.appendChild(cell);
        usersTable.appendChild(row);
        return;
    }


    data.forEach(user => {

        const row =
            document.createElement("tr");

        const university = typeof user.university === "string" && user.university.trim()
            ? user.university.trim()
            : "-";
        const dormType = user.dormType || "-";
        const values = [
            user.username || "-",
            user.email || "-",
            university,
            dormType,
            Number(user.bottles || 0),
            Number(user.points || 0),
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = String(value);
            row.appendChild(cell);
        });


        usersTable.appendChild(row);

    });

}


/* ================= STATS ================= */

function updateStats(users) {

    let bottles = 0;

    let points = 0;


    users.forEach(user => {

        bottles +=
            Number(
                user.bottles || 0
            );


        points +=
            Number(
                user.points || 0
            );

    });


    document.getElementById(
        "totalUsers"
    ).textContent =
        users.length;


    document.getElementById(
        "totalBottles"
    ).textContent =
        bottles;


    document.getElementById(
        "totalPoints"
    ).textContent =
        points;

}


/* ================= SEARCH ================= */

document
    .getElementById("searchInput")
    .addEventListener(
        "input",
        function () {

            const keyword =
                this.value
                    .toLowerCase();


            const filtered =
                users.filter(
                    user =>

                        (
                            user.username || ""
                        )
                        .toLowerCase()
                        .includes(keyword)

                        ||

                        (
                            user.email || ""
                        )
                        .toLowerCase()
                        .includes(keyword)
                );


            renderUsers(filtered);

        }
    );


/* ================= LOGOUT ================= */

document
    .getElementById(
        "logoutButton"
    )
    .addEventListener(
        "click",
        async () => {

            await signOut(auth);

            location.reload();

        }
    );


/* ================= ERROR ================= */

function showError(text) {

    message.textContent = text;

    message.classList.remove(
        "hidden"
    );

}

function reportAdminDataError(label, error) {
    console.error(error.code, error.message, error);
    const detail = `${label}: ${error.code || "error"} — ${error.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"}`;
    if (!adminDataErrors.includes(detail)) adminDataErrors.push(detail);
    dataMessage.textContent = adminDataErrors.join(" | ");
    dataMessage.classList.remove("hidden");
}
