// Thông tin tài khoản trên trang chủ.
(async () => {
if (!(await AppAuth.ready)) return;
ICareChat.init();

const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById("logoutBtn");

const form = document.getElementById("infoForm");

function displayUserName() {
    const userName = localStorage.getItem('userName');
    const loggedIn = localStorage.getItem('loggedIn');
    const userMenu = document.querySelector('.user-menu');
    const authDiv = document.querySelector('.auth');

    if (userName && loggedIn === 'true' && userNameDisplay) {
        userNameDisplay.textContent = `${userName}`;
        if (userMenu) userMenu.style.display = 'inline-block';
        if (authDiv) authDiv.style.display = 'none';
    } else {
        if (userMenu) userMenu.style.display = 'none';
        if (authDiv) authDiv.style.display = 'flex';
    }
}
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        AppAuth.logout();
    });
}
AppAuth.onReady( () => {
    displayUserName();
});
})();
