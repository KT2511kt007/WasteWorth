import {

    auth,
    db,
    saveEducationData,
    createBottleSubmission,
    createCouponRedemption,

    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,
    setDoc,
    getDoc,

    collection,
    getDocs,
    query,
    where,
    orderBy

} from "./firebase.js";


/* ================= SETTINGS ================= */

const POINTS_PER_BOTTLE = 5;

const MONEY_PER_BOTTLE = 0.50;


/* ================= VARIABLES ================= */

let currentUser = null;

let userData = null;

let bottleCount = 1;

let bottlePhotoUrl = null;


/* ================= DOM ================= */

const loginSection =
    document.getElementById("loginSection");

const educationSection =
    document.getElementById("educationSection");

const appSection =
    document.getElementById("appSection");

const emailInput =
    document.getElementById("emailInput");

const passwordInput =
    document.getElementById("passwordInput");

const authMessage =
    document.getElementById("authMessage");


/* ================= REGISTER ================= */

async function registerUser() {

    const email = emailInput.value.trim();

    const password = passwordInput.value.trim();


    if (!email || !password) {

        showMessage("กรุณากรอก Email และ Password");

        return;
    }


    if (password.length < 6) {

        showMessage("Password ต้องมีอย่างน้อย 6 ตัวอักษร");

        return;
    }


    try {

        await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );


        // The auth state listener creates the zero-balance profile and opens education setup.
        showMessage("สมัครสมาชิกสำเร็จ");

    }

    catch (error) {

        console.error(error);

        showMessage(getFirebaseError(error));

    }

}


/* ================= EDUCATION ================= */

const educationForm =
    document.getElementById("educationForm");

const universityInput =
    document.getElementById("universityInput");

const dormTypeGroup =
    document.getElementById("dormTypeGroup");

const educationMessage =
    document.getElementById("educationMessage");

function updateDormVisibility() {

    const isThammasat =
        universityInput.value.trim() === "มหาวิทยาลัยธรรมศาสตร์";

    dormTypeGroup.classList.toggle("hidden", !isThammasat);

    document
        .querySelectorAll('input[name="dormType"]')
        .forEach(input => {
            input.required = isThammasat;
            if (!isThammasat) input.checked = false;
        });

}

async function saveEducation(event) {

    event.preventDefault();

    const university = universityInput.value.trim();
    const dormType = document.querySelector('input[name="dormType"]:checked')?.value;

    educationMessage.textContent = "";

    if (!currentUser) {
        educationMessage.textContent = "กรุณาเข้าสู่ระบบอีกครั้ง";
        return;
    }

    if (!university) {
        educationMessage.textContent = "กรุณากรอกชื่อมหาวิทยาลัย";
        universityInput.focus();
        return;
    }

    if (university === "มหาวิทยาลัยธรรมศาสตร์" && !dormType) {
        educationMessage.textContent = "กรุณาเลือกหอในหรือหอนอก";
        return;
    }

    const saveButton = document.getElementById("saveEducationButton");
    saveButton.disabled = true;

    try {
        const educationData = {
            university,
            dormType: university === "มหาวิทยาลัยธรรมศาสตร์" ? dormType : null
        };

        await saveEducationData(
            currentUser.uid,
            university,
            dormType || null
        );

        userData = { ...userData, ...educationData };
        showApp();
    } catch (error) {
        console.error("Could not save education information:", error);
        educationMessage.textContent = "บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง";
    } finally {
        saveButton.disabled = false;
    }

}


/* ================= LOGIN ================= */

async function login() {

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value.trim();


    if (!email || !password) {

        showMessage("กรุณากรอก Email และ Password");

        return;
    }


    try {

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );


        showMessage("");

    }

    catch (error) {

        console.error(error);

        showMessage(getFirebaseError(error));

    }

}


/* ================= LOGOUT ================= */

async function logout() {

    try {

        await signOut(auth);

    }

    catch (error) {

        console.error(error);

    }

}


/* ================= LOAD USER ================= */

async function loadUserData() {

    if (!currentUser) return;


    const userRef =
        doc(db, "users", currentUser.uid);


    const snapshot =
        await getDoc(userRef);


    if (snapshot.exists()) {

        userData = snapshot.data();

    }

    else {

        userData = {

            uid: currentUser.uid,

            username:
                currentUser.email.split("@")[0],

            email:
                currentUser.email,

            bottles: 0,

            points: 0,

            money: 0

        };


        await setDoc(
            userRef,
            userData
        );

    }


    updateUI();

}


/* ================= SAVE USER ================= */

/* ================= ADD BOTTLE ================= */

async function saveBottle() {

    if (!currentUser) {

        alert("กรุณาเข้าสู่ระบบ");

        return;

    }


    if (bottleCount <= 0) {

        alert("จำนวนขวดไม่ถูกต้อง");

        return;

    }

    if (bottleCount > 1000) {
        alert("ส่งคำขอได้ไม่เกิน 1,000 ขวดต่อครั้ง");
        return;
    }


    const submitButton = document.getElementById("saveBottleButton");
    document.getElementById("submissionMessage").textContent = "";
    submitButton.disabled = true;

    try {
        await createBottleSubmission(currentUser, bottleCount);
        const message = document.getElementById("submissionMessage");
        message.textContent = "ส่งคำขอเรียบร้อยแล้ว รอ Admin ตรวจสอบ";
        bottleCount = 1;
        updateBottlePreview();
        await loadMySubmissions();
    } catch (error) {
        console.error("Could not submit bottle request:", error.code, error.message, error);
        alert("ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
        submitButton.disabled = false;
    }

}


/* ================= MY SUBMISSIONS ================= */

async function loadMySubmissions() {
    if (!currentUser) return;

    const list = document.getElementById("mySubmissionList");
    list.replaceChildren();

    try {
        const requestQuery = query(
            collection(db, "submissions"),
            where("userId", "==", currentUser.uid)
        );
        const snapshot = await getDocs(requestQuery);
        const submissions = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        if (!submissions.length) {
            list.textContent = "ยังไม่มีคำขอ";
            return;
        }

        const statusLabels = {
            pending: "รออนุมัติ",
            approved: "อนุมัติแล้ว",
            rejected: "ปฏิเสธ"
        };

        submissions.forEach(item => {
            const row = document.createElement("article");
            row.className = "submission-item";

            const details = document.createElement("div");
            details.className = "submission-details";
            const count = document.createElement("strong");
            const displayedBottles = item.status === "approved" ? item.approvedBottles : item.bottles;
            count.textContent = item.status === "approved"
                ? `อนุมัติ ${displayedBottles} จาก ${item.bottles} ขวด`
                : `${displayedBottles} ขวด`;
            const date = document.createElement("span");
            date.textContent = item.createdAt?.toDate?.().toLocaleString("th-TH") || "กำลังบันทึกวันที่";
            details.append(count, date);

            const status = document.createElement("div");
            status.className = `submission-status status-${item.status}`;
            status.textContent = statusLabels[item.status] || item.status;
            if (item.status === "approved") {
                const points = document.createElement("strong");
                points.textContent = `+${item.points || 0} PTS`;
                status.append(document.createElement("br"), points);
            }

            row.append(details, status);
            list.appendChild(row);
        });
    } catch (error) {
        console.error("Could not load bottle requests:", error.code, error.message, error);
        list.textContent = "โหลดคำขอไม่สำเร็จ กรุณาลองใหม่";
    }

}


/* ================= LOAD HISTORY ================= */

async function loadHistory() {

    if (!currentUser) return;


    const historyList =
        document.getElementById("historyList");


    historyList.innerHTML = "";


    const historyRef =
        collection(
            db,
            "users",
            currentUser.uid,
            "history"
        );


    const q =
        query(
            historyRef,
            orderBy(
                "createdAt",
                "desc"
            )
        );


    const snapshot =
        await getDocs(q);


    if (snapshot.empty) {

        historyList.innerHTML = `

            <div class="history-item">

                <div class="history-left">

                    <h3>
                        ยังไม่มีประวัติ
                    </h3>

                    <p>
                        เริ่มรีไซเคิลขวดแรกของคุณ
                    </p>

                </div>

            </div>

        `;

        return;

    }


    snapshot.forEach((item) => {

        const data =
            item.data();


        let date = "";


        if (data.createdAt) {

            date =
                data.createdAt
                    .toDate()
                    .toLocaleString("th-TH");

        }


        const element =
            document.createElement("div");


        element.className =
            "history-item";


        element.innerHTML = `

            <div class="history-left">

                <h3>
                    รีไซเคิล ${data.bottles} ขวด
                </h3>

                <p>
                    ${date}
                </p>

            </div>


            <div class="history-right">

                <strong>
                    +${data.points} PTS
                </strong>

                <p>
                    ฿${Number(data.money).toFixed(2)}
                </p>

            </div>

        `;


        historyList.appendChild(element);

    });

}


/* ================= BOTTLE COUNTER ================= */

function changeBottle(amount) {

    bottleCount += amount;


    if (bottleCount < 1) {

        bottleCount = 1;

    }


    updateBottlePreview();

}


function updateBottlePreview() {

    const points =
        bottleCount *
        POINTS_PER_BOTTLE;


    const money =
        bottleCount *
        MONEY_PER_BOTTLE;


    document.getElementById(
        "bottleCount"
    ).textContent =
        bottleCount;


    document.getElementById(
        "previewPoints"
    ).textContent =
        points;


    document.getElementById(
        "previewMoney"
    ).textContent =
        money.toFixed(2);

}


/* ================= UPDATE UI ================= */

function updateUI() {

    if (!userData) return;


    document.getElementById(
        "usernameDisplay"
    ).textContent =
        userData.username;


    document.getElementById(
        "pointsDisplay"
    ).textContent =
        userData.points;


    document.getElementById(
        "bottleDisplay"
    ).textContent =
        userData.bottles;


    document.getElementById(
        "moneyDisplay"
    ).textContent =
        Number(userData.money)
            .toFixed(2);


    document.getElementById(
        "profileUsername"
    ).textContent =
        userData.username;


    document.getElementById(
        "profileEmail"
    ).textContent =
        userData.email;

}


/* ================= PAGE SYSTEM ================= */

function showPage(pageId) {

    const pages =
        document.querySelectorAll(".page");


    pages.forEach(page => {

        page.classList.add("hidden");

    });


    const target =
        document.getElementById(pageId);


    if (target) {

        target.classList.remove("hidden");

    }


    const navButtons =
        document.querySelectorAll(".nav-button");


    navButtons.forEach(button => {

        button.classList.remove("active");


        if (
            button.dataset.page === pageId
        ) {

            button.classList.add("active");

        }

    });


    if (pageId === "historyPage") {

        loadHistory();

    }

    if (pageId === "homePage" && currentUser) {
        loadUserData().catch(error => console.error("Could not refresh user totals:", error));
    }

    if (pageId === "addPage") {
        loadMySubmissions();
    }

}


/* ================= SHOW APP ================= */

function showApp() {

    loginSection.classList.add("hidden");

    educationSection.classList.add("hidden");

    appSection.classList.remove("hidden");

    showPage("homePage");

}


/* ================= SHOW LOGIN ================= */

function showLogin() {

    loginSection.classList.remove("hidden");

    educationSection.classList.add("hidden");

    appSection.classList.add("hidden");

}


function showEducation() {

    loginSection.classList.add("hidden");
    appSection.classList.add("hidden");
    educationSection.classList.remove("hidden");
    educationMessage.textContent = "";
    universityInput.value = userData?.university || "";
    updateDormVisibility();

    const savedDormType = userData?.dormType;
    if (savedDormType) {
        const savedOption = document.querySelector(`input[name="dormType"][value="${savedDormType}"]`);
        if (savedOption) savedOption.checked = true;
    }

}


/* ================= ERROR ================= */

function showMessage(message) {

    authMessage.textContent =
        message;

}


function getFirebaseError(error) {

    switch (error.code) {

        case "auth/email-already-in-use":
            return "Email นี้ถูกใช้งานแล้ว";

        case "auth/invalid-email":
            return "Email ไม่ถูกต้อง";

        case "auth/weak-password":
            return "Password อ่อนเกินไป";

        case "auth/invalid-credential":
            return "Email หรือ Password ไม่ถูกต้อง";

        default:
            return error.message;

    }

}


/* ================= EVENTS ================= */


/* Login */

document
    .getElementById("loginButton")
    .addEventListener(
        "click",
        login
    );


/* Register */

document
    .getElementById("registerButton")
    .addEventListener(
        "click",
        registerUser
    );


educationForm.addEventListener("submit", saveEducation);
universityInput.addEventListener("input", updateDormVisibility);


/* Logout */

document
    .getElementById("logoutButton")
    .addEventListener(
        "click",
        logout
    );


/* Add bottle */

document
    .getElementById("plusBottle")
    .addEventListener(
        "click",
        () => changeBottle(1)
    );


document
    .getElementById("minusBottle")
    .addEventListener(
        "click",
        () => changeBottle(-1)
    );


document
    .getElementById("saveBottleButton")
    .addEventListener(
        "click",
        saveBottle
    );


/* Bottle photo helper */

const bottlePhotoInput =
    document.getElementById("bottlePhotoInput");

const bottlePhotoPreview =
    document.getElementById("bottlePhotoPreview");

const removeBottlePhotoButton =
    document.getElementById("removeBottlePhoto");

function clearBottlePhoto() {

    if (bottlePhotoUrl) {
        URL.revokeObjectURL(bottlePhotoUrl);
        bottlePhotoUrl = null;
    }

    bottlePhotoInput.value = "";
    bottlePhotoPreview.removeAttribute("src");
    bottlePhotoPreview.classList.add("hidden");
    removeBottlePhotoButton.classList.add("hidden");

}

bottlePhotoInput.addEventListener("change", () => {

    const file = bottlePhotoInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        clearBottlePhoto();
        alert("กรุณาเลือกไฟล์รูปภาพ");
        return;
    }

    if (bottlePhotoUrl) URL.revokeObjectURL(bottlePhotoUrl);
    bottlePhotoUrl = URL.createObjectURL(file);
    bottlePhotoPreview.src = bottlePhotoUrl;
    bottlePhotoPreview.classList.remove("hidden");
    removeBottlePhotoButton.classList.remove("hidden");

});

removeBottlePhotoButton.addEventListener("click", clearBottlePhoto);


/* Success */

document
    .getElementById("successHomeButton")
    .addEventListener(
        "click",
        () => showPage("homePage")
    );


/* Home → Add */

document
    .getElementById("goAddBottleButton")
    .addEventListener(
        "click",
        () => showPage("addPage")
    );


/* Home → Coupon */

document
    .getElementById("goCouponButton")
    .addEventListener(
        "click",
        () => showPage("couponPage")
    );


/* Profile → History */

document
    .getElementById("historyButton")
    .addEventListener(
        "click",
        () => showPage("historyPage")
    );


/* Profile → Coupon */

document
    .getElementById("profileCouponButton")
    .addEventListener(
        "click",
        () => showPage("couponPage")
    );


/* Bottom navigation */

document
    .querySelectorAll(".nav-button")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                showPage(
                    button.dataset.page
                );

            }
        );

    });


/* Coupon */

document
    .querySelectorAll(".redeem-button")
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const cost =
                    Number(
                        button.dataset.cost
                    );


                if (
                    userData.points < cost
                ) {

                    alert(
                        "คะแนนไม่เพียงพอ"
                    );

                    return;

                }


                button.disabled = true;
                try {
                    const coupon = button.dataset.coupon || button.closest(".coupon-item")?.querySelector("h3")?.textContent?.trim();
                    await createCouponRedemption(currentUser, coupon, cost);
                    alert("ส่งคำขอแลกคูปองแล้ว รอ Admin ตรวจสอบ");
                } catch (error) {
                    console.error("Could not submit coupon request:", error);
                    alert("ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง");
                } finally {
                    button.disabled = false;
                }

            }
        );

    });


/* Shop search */

document
    .getElementById("shopSearch")
    .addEventListener(
        "input",
        function () {

            const keyword =
                this.value
                    .toLowerCase();


            document
                .querySelectorAll(
                    ".shop-card"
                )
                .forEach(card => {

                    const text =
                        card.textContent
                            .toLowerCase();


                    card.style.display =
                        text.includes(keyword)
                            ? "flex"
                            : "none";

                });

        }
    );


/* ================= AUTH STATE ================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (user) {

            currentUser = user;

            try {
                await loadUserData();

                if (userData?.university?.trim()) {
                    showApp();
                } else {
                    showEducation();
                }
            } catch (error) {
                console.error("Could not load user data:", error);
                currentUser = null;
                userData = null;
                showMessage("โหลดข้อมูลบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง");
                showLogin();
            }

        }

        else {

            currentUser = null;

            userData = null;

            showLogin();

        }

    }
);


/* ================= START ================= */

updateBottlePreview();
