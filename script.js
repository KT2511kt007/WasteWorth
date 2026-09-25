import {

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

} from "./firebase.js";


/* ================= SETTINGS ================= */

const POINTS_PER_BOTTLE = 5;

const MONEY_PER_BOTTLE = 0.50;


/* ================= VARIABLES ================= */

let currentUser = null;

let userData = null;

let bottleCount = 1;


/* ================= DOM ================= */

const loginSection =
    document.getElementById("loginSection");

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

        const result =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );


        const user = result.user;


        const newUser = {

            uid: user.uid,

            username: email.split("@")[0],

            email: email,

            bottles: 0,

            points: 0,

            money: 0,

            createdAt: serverTimestamp()

        };


        await setDoc(
            doc(db, "users", user.uid),
            newUser
        );


        showMessage("สมัครสมาชิกสำเร็จ");

    }

    catch (error) {

        console.error(error);

        showMessage(getFirebaseError(error));

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

async function saveUserData() {

    if (!currentUser || !userData) return;


    await updateDoc(

        doc(
            db,
            "users",
            currentUser.uid
        ),

        {

            bottles: userData.bottles,

            points: userData.points,

            money: userData.money

        }

    );

}


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


    const earnedPoints =
        bottleCount * POINTS_PER_BOTTLE;


    const earnedMoney =
        bottleCount * MONEY_PER_BOTTLE;


    userData.bottles += bottleCount;

    userData.points += earnedPoints;

    userData.money += earnedMoney;


    await saveUserData();


    /* ================= HISTORY ================= */

    const historyRef =
        collection(
            db,
            "users",
            currentUser.uid,
            "history"
        );


    await addDoc(
        historyRef,
        {

            bottles: bottleCount,

            points: earnedPoints,

            money: earnedMoney,

            createdAt: serverTimestamp()

        }
    );


    document.getElementById(
        "successBottles"
    ).textContent =
        bottleCount;


    document.getElementById(
        "successPoints"
    ).textContent =
        `+${earnedPoints} PTS`;


    bottleCount = 1;

    updateBottlePreview();

    updateUI();

    showPage("successPage");

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

}


/* ================= SHOW APP ================= */

function showApp() {

    loginSection.classList.add("hidden");

    appSection.classList.remove("hidden");

    showPage("homePage");

}


/* ================= SHOW LOGIN ================= */

function showLogin() {

    loginSection.classList.remove("hidden");

    appSection.classList.add("hidden");

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


                userData.points -= cost;


                await saveUserData();


                updateUI();


                alert(
                    "แลกคูปองสำเร็จ 🎉"
                );

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

            await loadUserData();

            showApp();

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