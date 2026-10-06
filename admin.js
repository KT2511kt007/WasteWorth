import {

    auth,
    db,
    approveBottleSubmission,
    rejectBottleSubmission,
    reviewCouponRedemption,

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
            const date = document.createElement("span");
            date.className = "pending-date";
            date.textContent = `วันที่: ${submission.createdAt?.toDate?.().toLocaleString("th-TH") || "กำลังบันทึก"} · สถานะ: ${submission.status}`;
            details.append(email, count, date);

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


        row.innerHTML = `

            <td>
                ${user.username || "-"}
            </td>

            <td>
                ${user.email || "-"}
            </td>

            <td>
                ${user.bottles || 0}
            </td>

            <td>
                ${user.points || 0}
            </td>

            <td>
                ฿${Number(
                    user.money || 0
                ).toFixed(2)}
            </td>

        `;


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
