import {

    auth,
    db,
    approveBottleSubmission,
    rejectBottleSubmission,
    reviewCouponRedemption,
    resetAllUserData,

    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,
    getDoc,

    collection,
    getDocs,
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


let users = [];
let currentAdmin = null;


/* ================= AUTH ================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            dashboard.classList.add("hidden");

            showError(
                "กรุณา Login ก่อน"
            );

            return;

        }


        let adminSnapshot;
        try {
            adminSnapshot = await getDoc(doc(db, "admins", user.uid));
        } catch (error) {
            console.error("Admin document lookup failed:", error.code, error.message, error);
            dashboard.classList.add("hidden");
            showError("ตรวจสอบสิทธิ์ Admin ไม่สำเร็จ กรุณาตรวจ Firestore Rules");
            return;
        }


        if (!adminSnapshot.exists() || adminSnapshot.data().role !== "admin") {

            dashboard.classList.add("hidden");

            showError(
            "บัญชีนี้ไม่มีสิทธิ์ Admin (ต้องมี role: admin)"
            );

            return;

        }


        dashboard.classList.remove(
            "hidden"
        );

        currentAdmin = user;

        await loadUsers();
        await loadPendingSubmissions();
        await loadPendingCouponRedemptions();

    }
);


/* ================= LOAD USERS ================= */

async function loadUsers() {

    const snapshot =
        await getDocs(
            collection(
                db,
                "users"
            )
        );


    users = [];


    snapshot.forEach(
        item => {

            users.push({

                id: item.id,

                ...item.data()

            });

        }
    );


    renderUsers(users);

    updateStats(users);

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
            approve.addEventListener("click", () => reviewSubmission(submission.id, "approve", approvedCount, approve, reject));

            const reject = document.createElement("button");
            reject.type = "button";
            reject.className = "reject-button";
            reject.textContent = "❌ ปฏิเสธ";
            reject.addEventListener("click", () => reviewSubmission(submission.id, "reject", approvedCount, approve, reject));
            actions.append(approve, reject);
            card.append(details, approvedCount, actions);
            list.appendChild(card);
        });
    } catch (error) {
        console.error("Could not load pending submissions:", error);
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
        await Promise.all([loadUsers(), loadPendingSubmissions(), loadPendingCouponRedemptions()]);
        document.getElementById("resetResult").textContent =
            `รีเซ็ตข้อมูลสำเร็จ · รีเซ็ตผู้ใช้ ${counts.usersReset} ราย · ลบประวัติ ${counts.historiesDeleted} รายการ · ลบคำขอขวด ${counts.submissionsDeleted} รายการ · ลบคำขอคูปอง ${counts.couponsDeleted} รายการ`;
        resetDialog.close();
    } catch (error) {
        console.error("Could not reset user data:", error);
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

async function reviewSubmission(submissionId, action, approvedCount, approveButton, rejectButton) {
    if (!currentAdmin) return;
    approveButton.disabled = true;
    rejectButton.disabled = true;

    try {
        if (action === "approve") {
            const count = Number(approvedCount.value);
            if (!Number.isInteger(count) || count < 1 || count > Number(approvedCount.max)) {
                throw new Error("จำนวนที่อนุมัติต้องเป็นจำนวนเต็มและไม่เกินจำนวนที่แจ้ง");
            }
            await approveBottleSubmission(currentAdmin.uid, submissionId, count);
        } else {
            await rejectBottleSubmission(currentAdmin.uid, submissionId);
        }

        await Promise.all([loadPendingSubmissions(), loadUsers()]);
    } catch (error) {
        console.error("Could not review submission:", error);
        alert(error.message || "ดำเนินการไม่สำเร็จ");
        approveButton.disabled = false;
        rejectButton.disabled = false;
    }
}

async function loadPendingCouponRedemptions() {
    const list = document.getElementById("pendingCouponRedemptions");
    list.replaceChildren();

    try {
        const pendingQuery = query(
            collection(db, "couponRedemptions"),
            where("status", "==", "pending")
        );
        const snapshot = await getDocs(pendingQuery);
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
            coupon.textContent = `${request.coupon} · ${request.cost} คะแนน`;
            const date = document.createElement("span");
            date.className = "pending-date";
            date.textContent = `วันที่: ${request.createdAt?.toDate?.().toLocaleString("th-TH") || "กำลังบันทึก"} · สถานะ: ${request.status}`;
            details.append(email, coupon, date);

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
                    console.error("Could not review coupon request:", error);
                    alert(error.message || "ดำเนินการไม่สำเร็จ");
                    approve.disabled = false;
                    reject.disabled = false;
                }
            };
            approve.addEventListener("click", () => review(true));
            reject.addEventListener("click", () => review(false));
            actions.append(approve, reject);
            card.append(details, actions);
            list.appendChild(card);
        });
    } catch (error) {
        console.error("Could not load coupon requests:", error);
        list.textContent = "โหลดคำขอคูปองไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules";
        list.className = "pending-list pending-message";
    }
}


/* ================= RENDER ================= */

function renderUsers(data) {

    usersTable.innerHTML = "";


    data.forEach(user => {

        const row =
            document.createElement("tr");

        const university = typeof user.university === "string" && user.university.trim()
            ? user.university.trim()
            : "-";
        const dormType = university === "มหาวิทยาลัยธรรมศาสตร์"
            ? (user.dormType || "-")
            : "-";
        const values = [
            user.username || "-",
            user.email || "-",
            university,
            dormType,
            Number(user.bottles || 0),
            Number(user.points || 0),
            `฿${Number(user.money || 0).toFixed(2)}`
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
