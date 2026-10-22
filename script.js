import {

    auth,
    db,
    saveEducationData,
    getOrCreateUserProfile,
    createBottleSubmission,
    createCouponRedemption,
    useCouponRedemption,
    initializeCouponCatalog,
    COUPON_CATALOG,

    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,

    collection,
    getDocs,
    onSnapshot,
    query,
    where,
    orderBy

} from "./firebase.js";


/* ================= SETTINGS ================= */

const POINTS_PER_BOTTLE = 2;

let couponLoadUnsubscribe = null;
let myCouponsUnsubscribe = null;
let couponRedeemBusy = false;
let myCouponIds = new Set();
let myCouponsReady = false;
const couponUseBusyIds = new Set();


/* ================= VARIABLES ================= */

let currentUser = null;

let userData = null;

let bottleCount = 1;

let bottlePhotoData = null;
let photoPreparationId = 0;


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

    const isThammasat = universityInput.value.includes("ธรรมศาสตร์");

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

    const enteredUniversity = universityInput.value.trim();
    const isThammasat = enteredUniversity.includes("ธรรมศาสตร์");
    const university = isThammasat ? "มหาวิทยาลัยธรรมศาสตร์" : enteredUniversity;
    const selectedDormType = document.querySelector('input[name="dormType"]:checked')?.value;
    const dormType = isThammasat ? (selectedDormType || null) : null;

    educationMessage.textContent = "";

    if (!currentUser) {
        educationMessage.textContent = "กรุณาเข้าสู่ระบบอีกครั้ง";
        return;
    }

    if (!enteredUniversity) {
        educationMessage.textContent = "กรุณากรอกชื่อมหาวิทยาลัย";
        universityInput.focus();
        return;
    }

    if (isThammasat && !dormType) {
        educationMessage.textContent = "กรุณาเลือกประเภทที่พัก";
        return;
    }

    const saveButton = document.getElementById("saveEducationButton");
    saveButton.disabled = true;

    try {
        const educationData = {
            university,
            dormType
        };

        await saveEducationData(
            currentUser.uid,
            university,
            dormType || null
        );

        userData = { ...userData, ...educationData };
        showApp();
    } catch (error) {
        console.error(error);
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
    userData = await getOrCreateUserProfile(currentUser);

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
        const message = document.getElementById("submissionMessage");
        if (!bottlePhotoData) throw new Error("กรุณาเลือกรูปขวดและรอให้เตรียมรูปเสร็จก่อนส่งคำขอ");
        if (bottlePhotoData.length > 700 * 1024) throw new Error("รูปใหญ่เกินไป กรุณาถ่ายรูปใหม่");
        message.textContent = "กำลังส่งคำขอ...";
        await createBottleSubmission(currentUser, bottleCount, bottlePhotoData);
        message.textContent = "ส่งคำขอเรียบร้อย รอ Admin ตรวจสอบ";
        bottleCount = 1;
        updateBottlePreview();
        clearBottlePhoto();
        await loadMySubmissions();
    } catch (error) {
        console.error("Could not submit bottle request:", error.code, error.message, error);
        document.getElementById("submissionMessage").textContent = error.message || "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง";
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
            appendSubmissionPhoto(row, item.photoURL);
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



    document.getElementById(
        "bottleCount"
    ).textContent =
        bottleCount;


    document.getElementById(
        "previewPoints"
    ).textContent =
        points;



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
    document.getElementById("recyclePhoto");

const bottlePhotoPreview =
    document.getElementById("bottlePhotoPreview");

const removeBottlePhotoButton =
    document.getElementById("removeBottlePhoto");

function clearBottlePhoto() {
    photoPreparationId++;
    bottlePhotoData = null;
    bottlePhotoInput.value = "";
    bottlePhotoPreview.removeAttribute("src");
    bottlePhotoPreview.classList.add("hidden");
    removeBottlePhotoButton.classList.add("hidden");
    document.getElementById("photoPreparationMessage").textContent = "";

}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("อ่านรูปภาพไม่สำเร็จ กรุณาลองเลือกรูปใหม่"));
        reader.readAsDataURL(file);
    });
}

function loadImage(dataURL) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("เปิดรูปภาพไม่สำเร็จ กรุณาเลือกรูปใหม่"));
        image.src = dataURL;
    });
}

async function compressPhoto(file) {
    if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
    if (file.size > 5 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");

    const source = await readFileAsDataURL(file);
    const image = await loadImage(source);
    const maxDataUrlLength = 700 * 1024;
    let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));

    for (let resizeAttempt = 0; resizeAttempt < 10; resizeAttempt++) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("เตรียมรูปภาพไม่สำเร็จ กรุณาลองใหม่");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.7, 0.55, 0.4, 0.3, 0.2]) {
            const compressed = canvas.toDataURL("image/jpeg", quality);
            if (compressed.length <= maxDataUrlLength) return compressed;
        }
        scale *= 0.8;
    }
    throw new Error("รูปใหญ่เกินไป กรุณาถ่ายรูปใหม่");
}

function appendSubmissionPhoto(container, photoURL) {
    const wrapper = document.createElement("div");
    wrapper.className = "submission-photo-wrap";
    if (typeof photoURL === "string" && photoURL.startsWith("data:image/")) {
        const photo = document.createElement("img");
        photo.src = photoURL;
        photo.alt = "รูปขวดที่แนบในคำขอ";
        photo.className = "submission-photo";
        photo.addEventListener("error", () => {
            const fallback = document.createElement("span");
            fallback.textContent = "ไม่สามารถแสดงรูปหลักฐานได้";
            wrapper.replaceChildren(fallback);
        }, { once: true });
        wrapper.appendChild(photo);
    } else {
        const fallback = document.createElement("span");
        fallback.textContent = "ไม่สามารถแสดงรูปหลักฐานได้";
        wrapper.appendChild(fallback);
    }
    container.appendChild(wrapper);
}

bottlePhotoInput.addEventListener("change", () => {

    const file = bottlePhotoInput.files?.[0];
    if (!file) return;
    const preparationId = ++photoPreparationId;
    bottlePhotoData = null;
    bottlePhotoPreview.removeAttribute("src");
    bottlePhotoPreview.classList.add("hidden");
    const preparationMessage = document.getElementById("photoPreparationMessage");
    preparationMessage.textContent = "กำลังเตรียมรูป...";
    compressPhoto(file).then(dataURL => {
        if (preparationId !== photoPreparationId) return;
        bottlePhotoData = dataURL;
        bottlePhotoPreview.src = dataURL;
        bottlePhotoPreview.classList.remove("hidden");
        removeBottlePhotoButton.classList.remove("hidden");
        preparationMessage.textContent = "รูปพร้อมส่ง";
    }).catch(error => {
        if (preparationId !== photoPreparationId) return;
        clearBottlePhoto();
        preparationMessage.textContent = error.message || "เตรียมรูปไม่สำเร็จ";
    });

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
                console.error("Could not load signed-in user's Firestore profile:", error.code, error.message, error);
                userData = null;
                showMessage("โหลดข้อมูลบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง");
                showLogin();
                return;
            }

            // Coupon setup is independent from the authenticated profile. A coupon Rules
            // failure must not send a successfully signed-in user back to Login.
            try {
                await initializeCouponCatalog(user.uid);
            } catch (error) {
                console.error("Could not initialize coupon catalog:", error.code, error.message, error);
            }
            loadCouponCards();
            loadMyCoupons();

        }

        else {

            currentUser = null;

            userData = null;
            if (couponLoadUnsubscribe) couponLoadUnsubscribe();
            if (myCouponsUnsubscribe) myCouponsUnsubscribe();
            couponLoadUnsubscribe = null;
            myCouponsUnsubscribe = null;
            myCouponIds = new Set();
            myCouponsReady = false;

            showLogin();

        }

    }
);

async function loadCouponCards() {
    const list = document.getElementById("couponList");
    const message = document.getElementById("couponPageMessage");
    if (!list || !currentUser) return;
    if (couponLoadUnsubscribe) couponLoadUnsubscribe();
    message.textContent = "กำลังโหลดคูปอง…";
    couponLoadUnsubscribe = onSnapshot(collection(db, "coupons"), snapshot => {
        const availableCoupons = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]));
        list.replaceChildren();
        if (snapshot.empty) {
            message.textContent = "ยังไม่มีเอกสารคูปองใน Firestore กรุณาให้ Admin เปิดหน้า Admin เพื่อเตรียมรายการคูปอง";
            return;
        }
        const matchedCoupons = COUPON_CATALOG.filter(coupon => availableCoupons.has(coupon.id));
        if (matchedCoupons.length === 0) {
            console.error("Coupon documents found, but none match the configured coupon IDs:", {
                projectId: auth.app.options.projectId,
                collection: "coupons",
                documentIds: [...availableCoupons.keys()]
            });
            message.textContent = `พบเอกสาร ${snapshot.size} รายการใน coupons แต่ ID ไม่ตรงกับแค็ตตาล็อกคูปอง (${COUPON_CATALOG.map(coupon => coupon.id).join(", ")})`;
            return;
        }
        COUPON_CATALOG.forEach(defaultCoupon => {
            const coupon = availableCoupons.get(defaultCoupon.id);
            if (!coupon) return;
            const card = document.createElement("article");
            card.className = "coupon-item";
            const icon = document.createElement("div");
            icon.className = "coupon-left";
            icon.textContent = coupon.icon || "🎁";
            const content = document.createElement("div");
            content.className = "coupon-content";
            const name = document.createElement("h3");
            name.textContent = coupon.name;
            const detail = document.createElement("p");
            detail.textContent = coupon.description;
            const cost = document.createElement("p");
            cost.className = "coupon-cost";
            cost.textContent = `ใช้ ${coupon.pointsCost} คะแนน`;
            const stock = document.createElement("p");
            stock.className = "coupon-stock";
            const remaining = Number(coupon.remainingQuantity ?? coupon.quantity ?? 0);
            stock.textContent = `คงเหลือ ${remaining} ${coupon.id === "tokyo-free" ? "ใบ" : "สิทธิ์"}`;
            content.append(name, detail, cost, stock);
            const button = document.createElement("button");
            button.className = "redeem-button";
            button.type = "button";
            button.dataset.couponId = coupon.id;
            if (coupon.status === "pending") {
                button.textContent = "รอคอนเฟิร์ม";
                button.disabled = true;
                card.classList.add("coupon-pending");
            } else if (remaining <= 0) {
                button.textContent = "คูปองหมด";
                button.disabled = true;
            } else if (!myCouponsReady) {
                button.textContent = "กำลังตรวจสอบ…";
                button.disabled = true;
            } else if (myCouponIds.has(coupon.id)) {
                button.textContent = "แลกแล้ว";
                button.disabled = true;
            } else {
                button.textContent = "แลกคูปอง";
                button.addEventListener("click", () => redeemCoupon(coupon, button));
            }
            card.append(icon, content, button);
            list.append(card);
        });
        const missingCoupons = COUPON_CATALOG.length - matchedCoupons.length;
        message.textContent = missingCoupons
            ? `โหลดคูปอง ${matchedCoupons.length}/${COUPON_CATALOG.length} รายการ ยังขาด ${missingCoupons} รายการ ให้ Admin เปิดหน้า Admin เพื่อเติมรายการที่ขาด`
            : "";
    }, error => {
        console.error(error.code, error.message, error);
        message.textContent = error.code === "permission-denied"
            ? `อ่าน coupons ไม่ได้รับอนุญาต (${error.code}): ตรวจว่า Firestore Rules ที่ Deploy อนุญาต signed-in user อ่าน coupons แล้ว`
            : `โหลด coupons ไม่สำเร็จ (${error.code || "unknown"}): ${error.message || "ไม่ทราบสาเหตุ"}`;
    });
}

function loadMyCoupons() {
    const list = document.getElementById("myCouponsList");
    const empty = document.getElementById("myCouponsEmpty");
    const count = document.getElementById("myCouponsCount");
    if (!list || !currentUser) return;
    if (myCouponsUnsubscribe) myCouponsUnsubscribe();
    const ownedCoupons = query(
        collection(db, "couponRedemptions"),
        where("userId", "==", currentUser.uid)
    );
    myCouponsUnsubscribe = onSnapshot(ownedCoupons, snapshot => {
        const redemptions = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        myCouponIds = new Set(redemptions.map(redemption => redemption.couponId).filter(Boolean));
        myCouponsReady = true;
        loadCouponCards();
        document.querySelectorAll(".redeem-button[data-coupon-id]").forEach(button => {
            if (myCouponIds.has(button.dataset.couponId)) {
                button.disabled = true;
                button.textContent = "แลกแล้ว";
            }
        });
        count.textContent = `${redemptions.length} ใบ`;
        const renderRedemptions = entries => {
            list.replaceChildren();
            const usableCount = entries.filter(redemption => {
                const expiry = redemption.expiresAt?.toDate?.();
                return ["available", "redeemed"].includes(redemption.status) && (!expiry || expiry > new Date());
            }).length;
            empty.textContent = entries.length === 0
                ? "คุณยังไม่มีคูปองที่แลกไว้"
                : "คุณไม่มีคูปองที่ใช้ได้";
            empty.classList.toggle("hidden", usableCount > 0);

            entries.forEach(redemption => {
                const card = document.createElement("article");
                card.className = "owned-coupon-card";
                const title = document.createElement("h3");
                title.textContent = redemption.coupon || redemption.couponName || "คูปอง WasteWorth";
                const detail = document.createElement("p");
                detail.className = "owned-coupon-detail";
                detail.textContent = redemption.couponDescription || `${redemption.cost || 0} คะแนน`;
                const date = document.createElement("p");
                date.className = "owned-coupon-date";
                const redeemedAt = redemption.createdAt?.toDate?.();
                date.textContent = redeemedAt
                    ? `แลกเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(redeemedAt)}`
                    : "แลกเมื่อกำลังบันทึกเวลา";
                const code = document.createElement("p");
                code.className = "owned-coupon-code";
                code.textContent = `รหัสคูปอง: ${redemption.id}`;
                const status = document.createElement("span");
                status.className = "owned-coupon-status";
                const expiry = redemption.expiresAt?.toDate?.();
                const expired = Boolean(expiry && expiry < new Date());
                const usable = ["available", "redeemed"].includes(redemption.status) && !expired;
                const statusText = expired ? "หมดอายุ"
                    : redemption.status === "used" ? "ใช้แล้ว"
                        : redemption.status === "pending" ? "รอตรวจสอบ"
                            : redemption.status === "rejected" ? "ไม่อนุมัติ" : "ใช้ได้";
                status.textContent = statusText;
                if (!usable) status.classList.add("is-inactive");
                card.append(title, detail, date, code, status);

                if (usable) {
                    const useButton = document.createElement("button");
                    useButton.type = "button";
                    useButton.className = "owned-coupon-use-button";
                    useButton.textContent = "ใช้คูปอง";
                    useButton.disabled = couponUseBusyIds.has(redemption.id);
                    useButton.addEventListener("click", async () => {
                        if (couponUseBusyIds.has(redemption.id)) return;
                        if (!window.confirm("ยืนยันการใช้คูปองนี้หรือไม่?")) return;
                        couponUseBusyIds.add(redemption.id);
                        useButton.disabled = true;
                        try {
                            await useCouponRedemption(currentUser, redemption.id);
                            const index = redemptions.findIndex(item => item.id === redemption.id);
                            if (index >= 0) redemptions[index] = { ...redemptions[index], status: "used", usedAt: new Date() };
                            renderRedemptions(redemptions);
                        } catch (error) {
                            console.error("Could not use coupon:", error.code, error.message, error);
                            const message = error.message === "COUPON_ALREADY_USED"
                                ? "คูปองนี้ถูกใช้ไปแล้ว"
                                : error.message === "COUPON_NOT_OWNED"
                                    ? "คุณไม่มีสิทธิ์ใช้คูปองนี้"
                                    : "ใช้คูปองไม่สำเร็จ กรุณาลองอีกครั้ง";
                            alert(message);
                            useButton.disabled = false;
                        } finally {
                            couponUseBusyIds.delete(redemption.id);
                        }
                    });
                    card.append(useButton);
                }
                list.append(card);
            });
        };
        renderRedemptions(redemptions);
    }, error => {
        console.error(error.code, error.message, error);
        empty.textContent = error.code === "permission-denied"
            ? `อ่านคูปองของฉันไม่สำเร็จ (${error.code}): ตรวจ Firestore Rules ของ couponRedemptions ว่าจำกัดให้อ่านเฉพาะ UID เจ้าของและ Admin`
            : `อ่านคูปองของฉันไม่สำเร็จ (${error.code || "unknown"}): ${error.message || "กรุณาลองใหม่อีกครั้ง"}`;
        empty.classList.remove("hidden");
    });
}

async function redeemCoupon(coupon, button) {
    if (!currentUser) {
        alert("กรุณาเข้าสู่ระบบก่อนแลกคูปอง");
        showLogin();
        return;
    }
    if (couponRedeemBusy) return;
    couponRedeemBusy = true;
    button.disabled = true;
    try {
        await createCouponRedemption(currentUser, coupon, coupon.pointsCost);
        myCouponIds.add(coupon.id);
        button.textContent = "แลกแล้ว";
        userData.points = Number(userData.points || 0) - coupon.pointsCost;
        document.getElementById("pointsDisplay").textContent = userData.points;
        const notice = document.getElementById("myCouponsNotice");
        notice.textContent = "เพิ่มคูปองเรียบร้อยแล้ว";
        document.getElementById("myCouponsSection").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        const messageByCode = {
            INSUFFICIENT_POINTS: "คะแนนของคุณไม่เพียงพอสำหรับคูปองนี้",
            COUPON_SOLD_OUT: "คูปองนี้หมดแล้ว",
            COUPON_UNAVAILABLE: "คูปองนี้ยังไม่พร้อมใช้งาน",
            DUPLICATE_REDEMPTION: "คุณแลกคูปองนี้ไปแล้ว ดูรหัสได้ในคูปองของฉัน",
            USER_NOT_FOUND: "ไม่พบข้อมูลบัญชี กรุณาเข้าสู่ระบบใหม่"
        };
        alert(messageByCode[error.message] || "แลกคูปองไม่สำเร็จ กรุณาลองอีกครั้ง");
        console.error("Could not redeem coupon:", error);
    } finally {
        couponRedeemBusy = false;
        if (coupon.status === "active" && Number(coupon.remainingQuantity ?? coupon.quantity ?? 0) > 0 && !myCouponIds.has(coupon.id)) button.disabled = false;
    }
}


/* ================= START ================= */

updateBottlePreview();
