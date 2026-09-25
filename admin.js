import {

    auth,
    db,

    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,

    doc,
    getDoc,

    collection,
    getDocs

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


/* ================= AUTH ================= */

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            showError(
                "กรุณา Login ก่อน"
            );

            return;

        }


        const adminRef =
            doc(
                db,
                "admins",
                user.uid
            );


        const adminSnapshot =
            await getDoc(adminRef);


        if (!adminSnapshot.exists()) {

            showError(
                "บัญชีนี้ไม่มีสิทธิ์ Admin"
            );

            return;

        }


        dashboard.classList.remove(
            "hidden"
        );


        await loadUsers();

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