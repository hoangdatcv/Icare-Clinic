// Đăng ký và đăng nhập.
(async () => {
if (!(await AppAuth.ready)) return;
ICareChat.init();

// Tài khoản.

const API_BASE = (AppAuth.apiOrigin + "");

// Xử lý biểu mẫu.
function validatePhone(phone) {
	return /^0[0-9]{9,10}$/.test(phone);
}

function setFieldError(input, errorElement, message = "") {
	if (!input || !errorElement) return;

	if (message) {
		errorElement.textContent = message;
		errorElement.style.display = "block";
		input.classList.add("input-error");
	} else {
		errorElement.textContent = "";
		errorElement.style.display = "none";
		input.classList.remove("input-error");
	}
}

function setFormError(errorElement, message = "") {
	if (!errorElement) return;
	errorElement.textContent = message;
	errorElement.style.display = message ? "block" : "none";
}

function setButtonLoading(button, loading, loadingText, normalText) {
	if (!button) return;
	button.disabled = loading;
	button.classList.toggle("is-loading", loading);
	button.textContent = loading ? loadingText : normalText;
}

// Biểu mẫu đăng ký.
const formRegister = document.getElementById("formRegister");
const reg_name = document.getElementById("reg_name");
const reg_phone = document.getElementById("reg_phone");
const reg_email = document.getElementById("reg_email");
const reg_pass = document.getElementById("reg_pass");
const reg_repass = document.getElementById("reg_repass");
const registerBtn = document.getElementById("registerBtn");

const reg_nameError = document.getElementById("reg_nameError");
const reg_phoneError = document.getElementById("reg_phoneError");
const reg_emailError = document.getElementById("reg_emailError");
const reg_passError = document.getElementById("reg_passError");
const reg_repassError = document.getElementById("reg_repassError");
const registerError = document.getElementById("registerError");

// Biểu mẫu đăng nhập.
const formLogin = document.getElementById("formLogin");
const log_phone = document.getElementById("log_phone");
const log_pass = document.getElementById("log_pass");
const logBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const log_phoneError = document.getElementById("log_phoneError");

// Hộp thoại tài khoản.
const registerModal = document.getElementById("registerModal");
const loginModal = document.getElementById("loginModal");
const headerRegister = document.getElementById("headerRegister");
const headerLogin = document.getElementById("headerLogin");
const closeRegister = document.getElementById("closeRegister");
const closeLogin = document.getElementById("closeLogin");
const toLogin = document.getElementById("toLogin");
const toRegister = document.getElementById("toRegister");

// Kiểm tra đăng ký.

function clearRegisterErrors() {
	setFieldError(reg_name, reg_nameError);
	setFieldError(reg_phone, reg_phoneError);
	setFieldError(reg_email, reg_emailError);
	setFieldError(reg_pass, reg_passError);
	setFieldError(reg_repass, reg_repassError);
	setFormError(registerError);
}

function validateRegisterForm() {
	clearRegisterErrors();

	const nameValue = reg_name ? reg_name.value.trim() : "";
	const phoneValue = reg_phone ? reg_phone.value.trim() : "";
	const emailValue = reg_email ? reg_email.value.trim() : "";
	const passValue = reg_pass ? reg_pass.value : "";
	const repassValue = reg_repass ? reg_repass.value : "";

	let isValid = true;
	if (!emailValue || !reg_email.validity.valid) {
		setFieldError(reg_email, reg_emailError, "Vui lòng nhập email hợp lệ.");
		isValid = false;
	}

	if (!nameValue) {
		setFieldError(reg_name, reg_nameError, "Vui lòng nhập họ tên.");
		isValid = false;
	}

	if (!phoneValue) {
		setFieldError(reg_phone, reg_phoneError, "Vui lòng nhập số điện thoại.");
		isValid = false;
	} else if (!validatePhone(phoneValue)) {
		setFieldError(
			reg_phone,
			reg_phoneError,
			"Số điện thoại không hợp lệ. Vui lòng nhập 10 hoặc 11 số và bắt đầu bằng 0.",
		);
		isValid = false;
	}

	if (!passValue) {
		setFieldError(reg_pass, reg_passError, "Vui lòng nhập mật khẩu.");
		isValid = false;
	}

	if (!repassValue) {
		setFieldError(reg_repass, reg_repassError, "Vui lòng xác nhận mật khẩu.");
		isValid = false;
	} else if (passValue && passValue !== repassValue) {
		setFieldError(reg_repass, reg_repassError, "Mật khẩu xác nhận không khớp!");
		isValid = false;
	}

	return isValid;
}

function handleRegisterInput(input) {
	if (!input) return;
	if (input === reg_email) setFieldError(reg_email, reg_emailError);

	if (input === reg_name && reg_name.value.trim()) {
		setFieldError(reg_name, reg_nameError);
	}

	if (input === reg_phone) {
		const phoneValue = reg_phone.value.trim();
		if (!phoneValue || validatePhone(phoneValue)) {
			setFieldError(reg_phone, reg_phoneError);
		}
	}

	if (input === reg_pass && reg_pass.value) {
		setFieldError(reg_pass, reg_passError);
	}

	if (input === reg_repass) {
		if (!reg_repass.value) {
			setFieldError(reg_repass, reg_repassError);
		} else if (reg_pass.value && reg_repass.value !== reg_pass.value) {
			setFieldError(
				reg_repass,
				reg_repassError,
				"Mật khẩu xác nhận không khớp!",
			);
		} else {
			setFieldError(reg_repass, reg_repassError);
		}
	}

	setFormError(registerError);
}

// Kiểm tra đăng nhập.

function updateLoginState() {
	if (!logBtn || !log_phone || !log_pass) return;

	const phoneValue = log_phone.value.trim();
	const passValue = log_pass.value;

	setFieldError(log_phone, log_phoneError);

	if (phoneValue && !validatePhone(phoneValue)) {
		setFieldError(log_phone, log_phoneError, "Số điện thoại không hợp lệ.");
		logBtn.disabled = true;
		return;
	}

	logBtn.disabled = !(phoneValue && passValue);
}

// Mở và đóng hộp thoại.

function openModal(modal) {
	if (!modal) return;
	modal.style.display = "flex";
	requestAnimationFrame(() => modal.classList.add("show"));
}

function closeModal(modal) {
	if (!modal) return;
	modal.classList.remove("show");
	setTimeout(() => {
		if (!modal.classList.contains("show")) {
			modal.style.display = "none";
		}
	}, 220);
}

function resetRegisterForm() {
	if (formRegister) formRegister.reset();
	clearRegisterErrors();
	setButtonLoading(registerBtn, false, "ĐANG ĐĂNG KÝ...", "ĐĂNG KÝ");
}

function resetLoginForm() {
	if (formLogin) formLogin.reset();
	setFormError(loginError);
	setFieldError(log_phone, log_phoneError);
	if (logBtn) logBtn.disabled = true;
}

function showRegisterModal(reset = true) {
	closeModal(loginModal);
	if (reset) resetRegisterForm();
	openModal(registerModal);
	setTimeout(() => reg_name && reg_name.focus(), 50);
}

function showLoginModal(reset = true) {
	closeModal(registerModal);
	if (reset) resetLoginForm();
	openModal(loginModal);
	setTimeout(() => log_phone && log_phone.focus(), 50);
}

// Đăng ký tài khoản.

async function submitRegister() {
	if (!validateRegisterForm()) {
		const firstInvalid =
			formRegister && formRegister.querySelector(".input-error");
		if (firstInvalid) firstInvalid.focus();
		return;
	}

	const payload = {
		hoten: reg_name.value.trim(),
		sdt: reg_phone.value.trim(),
		email: reg_email.value.trim(),
		matkhau: reg_pass.value,
	};

	setButtonLoading(registerBtn, true, "ĐANG ĐĂNG KÝ...", "ĐĂNG KÝ");
	setFormError(registerError);

	try {
		const response = await AppAuth.fetch(API_BASE + "/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			if (data.field === "hoten") {
				setFieldError(
					reg_name,
					reg_nameError,
					data.message || "Vui lòng nhập họ tên.",
				);
			} else if (data.field === "sdt") {
				setFieldError(
					reg_phone,
					reg_phoneError,
					data.message || "Số điện thoại không hợp lệ.",
				);
			} else if (data.field === "email") {
				setFieldError(reg_email, reg_emailError, data.message || "Email không hợp lệ.");
			} else if (data.field === "matkhau") {
				setFieldError(
					reg_pass,
					reg_passError,
					data.message || "Vui lòng nhập mật khẩu.",
				);
			} else {
				setFormError(registerError, data.message || "Đăng ký thất bại!");
			}
			return;
		}

		alert(data.message || "Đăng ký thành công! Vui lòng đăng nhập.");

		closeModal(registerModal);
		resetLoginForm();
		if (log_phone) log_phone.value = payload.sdt;
		updateLoginState();
		openModal(loginModal);
		setTimeout(() => log_pass && log_pass.focus(), 50);
	} catch (error) {
		console.error("Lỗi kết nối Server:", error);
		setFormError(registerError, "Không thể kết nối tới server.");
	} finally {
		setButtonLoading(registerBtn, false, "ĐANG ĐĂNG KÝ...", "ĐĂNG KÝ");
	}
}

// Đăng nhập.

async function submitLogin() {
	if (!log_phone || !log_pass || !logBtn) return;

	const sdtValue = log_phone.value.trim();
	const passValue = log_pass.value;

	setFormError(loginError);
	setFieldError(log_phone, log_phoneError);

	if (!sdtValue || !passValue) {
		setFormError(loginError, "Vui lòng nhập số điện thoại và mật khẩu!");
		updateLoginState();
		return;
	}

	if (!validatePhone(sdtValue)) {
		setFieldError(log_phone, log_phoneError, "Số điện thoại không hợp lệ.");
		logBtn.disabled = true;
		return;
	}

	setButtonLoading(logBtn, true, "ĐANG ĐĂNG NHẬP...", "ĐĂNG NHẬP");

	try {
		const response = await AppAuth.fetch(API_BASE + "/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sdt: sdtValue, matkhau: passValue }),
		});

		const data = await response.json().catch(() => ({}));

		if (!response.ok) {
			setFormError(
				loginError,
				data.message || "Số điện thoại hoặc mật khẩu không đúng!",
			);
			return;
		}

		localStorage.setItem("loggedIn", "true");

		if (data.isAdmin) {
			localStorage.setItem("adminId", data.admin.idQTV);
			window.location.href = "../quan-tri/index.html";
		} else {
			localStorage.setItem("userId", data.user.idKH);
			localStorage.setItem("userName", data.user.hoTen);
			window.location.href = "trang-chu.html";
		}
	} catch (error) {
		console.error("Lỗi kết nối Server:", error);
		setFormError(loginError, "Không thể kết nối tới server.");
	} finally {
		setButtonLoading(logBtn, false, "ĐANG ĐĂNG NHẬP...", "ĐĂNG NHẬP");
		updateLoginState();
	}
}

// Sự kiện giao diện.

if (headerRegister) {
	headerRegister.addEventListener("click", () => showRegisterModal(true));
}

if (headerLogin) {
	headerLogin.addEventListener("click", () => showLoginModal(true));
}

if (closeRegister) {
	closeRegister.addEventListener("click", () => closeModal(registerModal));
}

if (closeLogin) {
	closeLogin.addEventListener("click", () => closeModal(loginModal));
}

if (toLogin) {
	toLogin.addEventListener("click", () => showLoginModal(true));
}

if (toRegister) {
	toRegister.addEventListener("click", () => showRegisterModal(true));
}

if (registerBtn) {
	registerBtn.addEventListener("click", submitRegister);
}

if (logBtn) {
	logBtn.addEventListener("click", submitLogin);
}

[reg_name, reg_phone, reg_email, reg_pass, reg_repass].forEach((input) => {
	if (!input) return;
	input.addEventListener("input", () => handleRegisterInput(input));
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			submitRegister();
		}
	});
});

if (reg_phone) {
	reg_phone.addEventListener("blur", () => {
		const value = reg_phone.value.trim();
		if (value && !validatePhone(value)) {
			setFieldError(
				reg_phone,
				reg_phoneError,
				"Số điện thoại không hợp lệ. Vui lòng nhập 10 hoặc 11 số và bắt đầu bằng 0.",
			);
		}
	});
}

if (log_phone) {
	log_phone.addEventListener("input", () => {
		setFormError(loginError);
		updateLoginState();
	});
}

if (log_pass) {
	log_pass.addEventListener("input", () => {
		setFormError(loginError);
		updateLoginState();
	});

	log_pass.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !logBtn.disabled) {
			event.preventDefault();
			submitLogin();
		}
	});
}

const btnDatLich = document.getElementById("btnDatLich");
const btnHoSo = document.getElementById("btnHoSo");

if (btnDatLich) {
	btnDatLich.addEventListener("click", (event) => {
		event.preventDefault();
		showLoginModal(true);
	});
}

if (btnHoSo) {
	btnHoSo.addEventListener("click", (event) => {
		event.preventDefault();
		showLoginModal(true);
	});
}

[registerModal, loginModal].forEach((modal) => {
	if (!modal) return;
	modal.addEventListener("click", (event) => {
		if (event.target === modal) closeModal(modal);
	});
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	if (registerModal && registerModal.style.display === "flex")
		closeModal(registerModal);
	if (loginModal && loginModal.style.display === "flex") closeModal(loginModal);
});

})();
