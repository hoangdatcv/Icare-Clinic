// Hồ sơ cá nhân và lịch khám.
(async () => {
if (!(await AppAuth.ready)) return;
// Chuyển mục hồ sơ.

const navItems = document.querySelectorAll(".side-nav .nav-item");
const contentSections = document.querySelectorAll(".content-section");

let medicalHistoryData = [];
const medicalHistoryTableBody = document.querySelector(
	".medical-history-table tbody",
);
const medicalDetailPlaceholder = document.querySelector(
	".medical-record-detail .detail-placeholder",
);

navItems.forEach((item) => {
	item.addEventListener("click", function (e) {
		e.preventDefault();

		navItems.forEach((n) => n.classList.remove("active"));
		contentSections.forEach((sec) => sec.classList.remove("active"));

		this.classList.add("active");
		const targetId = this.getAttribute("href").substring(1);
		const target = document.getElementById(targetId + "-section");
		if (target) target.classList.add("active");

		if (targetId === "medical-history") {
			loadMedicalHistory();
		}
		if (targetId === "appointments") {
			document
				.querySelector('.appointment-filter-nav .filter-btn[data-status="all"]')
				.click();
		}
	});
});

AppAuth.onReady( () => {
	if (window.location.hash) {
		const hash = window.location.hash.replace("#", "");
		const nav = document.querySelector(`a[href="#${hash}"]`);
		if (nav) nav.click();
	}
	loadUserData();
	loadAppointments();
});

// Thông tin cá nhân.

const API_BASE_URL = (AppAuth.apiOrigin + "/api");
let currentUserId = localStorage.getItem("userId");
let initialUserData = {};

const profileForm = document.getElementById("profileForm");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");

// Thông báo.
function showToast(message) {
	const toast = document.getElementById("customToast");
	const body = toast.querySelector(".toast-body");

	body.textContent = message;

	toast.classList.add("show");
	setTimeout(() => toast.classList.remove("show"), 2500);
}

// Tải dữ liệu.
async function loadUserData() {
	if (!currentUserId) return;

	try {
		const res = await AppAuth.fetch(`${API_BASE_URL}/khachhang/${currentUserId}`);
		const data = await res.json();

		if (!res.ok) return showToast("Lỗi tải dữ liệu: " + data.message);

		initialUserData = data;
		populateData(data);
	} catch (e) {
		console.error("Network error:", e);
		showToast("Không thể kết nối máy chủ!");
	}
}
function maskPhoneNumber(phone) {
	if (!phone || phone.length < 2) return phone;
	const lastTwo = phone.slice(-2);
	return "*".repeat(phone.length - 2) + lastTwo;
}
// Hiển thị thông tin cá nhân.
function populateData(user) {
	const { hoTen, gioitinh, ngayThangNamSinh, cccd, diachi, sdt } = user;
	const userNameBtn = document.getElementById("userNameDisplay");
	if (userNameBtn) {
		userNameBtn.textContent = hoTen || "[Tên khách hàng]";
	}
	fillField("hoten", hoTen);
	fillField("cccd", cccd);
	fillField("diachi", diachi);

	if (ngayThangNamSinh) {
		const d = new Date(ngayThangNamSinh);
		const day = String(d.getDate()).padStart(2, "0");
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const year = d.getFullYear();

		document.getElementById("display_ngaysinh").textContent =
			`${day}/${month}/${year}`;
		document.getElementById("input_ngaysinh").value = `${year}-${month}-${day}`;
	} else {
		fillField("ngaysinh", "");
		document.getElementById("display_ngaysinh").classList.add("not-available");
	}

	document.querySelectorAll('input[name="gioitinh"]').forEach((r) => {
		r.checked = r.value === gioitinh;
	});

	const sdtDisplay = document.getElementById("display_sdt");
	if (sdtDisplay) sdtDisplay.textContent = sdt ? maskPhoneNumber(sdt) : "N/A";

	disableSaveButton();
}

function fillField(field, value) {
	const disp = document.getElementById(`display_${field}`);
	const input = document.getElementById(`input_${field}`);

	if (!disp || !input) return;

	disp.textContent = value || "Chưa có";
	input.value = value || "";

	if (value && value.trim() !== "") {
		disp.classList.remove("not-available");
	} else {
		disp.classList.add("not-available");
	}
}

// Trạng thái nút lưu.
function enableSaveButton() {
	saveProfileBtn.disabled = false;
	saveProfileBtn.classList.add("active");
	saveProfileBtn.classList.remove("disabled");  
	cancelEditBtn.classList.add("active");
	cancelEditBtn.classList.remove("hidden");  
}

function disableSaveButton() {
	saveProfileBtn.disabled = true;
	saveProfileBtn.classList.remove("active");
	saveProfileBtn.classList.add("disabled");  
	cancelEditBtn.classList.remove("active");
	cancelEditBtn.classList.add("hidden");  
}

// Theo dõi thay đổi.

function checkFormState() {
	const newData = {
		hoTen: document.getElementById("input_hoten").value.trim(),
		ngayThangNamSinh: document.getElementById("input_ngaysinh").value,
		cccd: document.getElementById("input_cccd").value.trim(),
		diachi: document.getElementById("input_diachi").value.trim(),
		gioitinh:
			document.querySelector('input[name="gioitinh"]:checked')?.value || null,
	};

	const initialDate = initialUserData.ngayThangNamSinh
		? new Date(initialUserData.ngayThangNamSinh).toISOString().substring(0, 10)
		: "";

	const compareData = {
		hoTen: initialUserData.hoTen || "",
		ngayThangNamSinh: initialDate || "",
		cccd: initialUserData.cccd || "",
		diachi: initialUserData.diachi || "",
		gioitinh: initialUserData.gioitinh || "",
	};

	return Object.keys(newData).some(
		(field) => newData[field] !== compareData[field],
	);
}

profileForm.addEventListener("input", () => {
	if (checkFormState()) enableSaveButton();
	else disableSaveButton();
});

document.querySelectorAll('input[name="gioitinh"]').forEach((radio) => {
	radio.addEventListener("change", () => {
		if (checkFormState()) enableSaveButton();
		else disableSaveButton();
	});
});

// Chỉnh sửa thông tin.

document.querySelectorAll("#profileForm .info-row").forEach((row) => {
	const btn = row.querySelector(".btn-change");
	const display = row.querySelector(".info-display");
	const input = row.querySelector(".info-input");

	if (!btn || !input) return;

	btn.addEventListener("click", () => {
		const isEditing = row.classList.toggle("editing");

		if (isEditing) {
			display.style.display = "none";
			input.classList.remove("hidden");
			input.style.display = "block";
			btn.textContent = "Hủy";  
		} else {
			const fieldName = input.id.replace("input_", "");
			const initialFieldMap = {
				hoten: "hoTen",
				ngaysinh: "ngayThangNamSinh",
				cccd: "cccd",
				diachi: "diachi",
				sdt: "sdt",
			};
			let initialValue =
				initialUserData[initialFieldMap[fieldName] || fieldName] || "";

			if (fieldName === "ngaysinh" && initialUserData.ngayThangNamSinh) {
				initialValue = new Date(initialUserData.ngayThangNamSinh)
					.toISOString()
					.substring(0, 10);
			}

			input.value = initialValue;

			display.style.display = "block";
			input.style.display = "none";
			btn.textContent = "Thay đổi";  
		}

		if (checkFormState()) enableSaveButton();
		else disableSaveButton();
	});
});

// Hủy chỉnh sửa.

cancelEditBtn.addEventListener("click", () => {
	populateData(initialUserData);

	document.querySelectorAll("#profileForm .info-row").forEach((row) => {
		row.classList.remove("editing");
		const input = row.querySelector(".info-input");
		const disp = row.querySelector(".info-display");
		const btn = row.querySelector(".btn-change");

		if (input) input.style.display = "none";
		if (disp) disp.style.display = "block";

		if (btn && btn.textContent === "Hủy") btn.textContent = "Thay đổi";
	});

	disableSaveButton();
});

// Lưu hồ sơ.

profileForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	if (saveProfileBtn.disabled) return;

	const data = {
		hoTen: document.getElementById("input_hoten").value.trim(),
		ngayThangNamSinh: document.getElementById("input_ngaysinh").value,
		cccd: document.getElementById("input_cccd").value.trim(),
		diachi: document.getElementById("input_diachi").value.trim(),
		gioitinh:
			document.querySelector('input[name="gioitinh"]:checked')?.value || null,
	};

	if (!data.hoTen) return showToast("❌ Họ tên không được để trống!");

	try {
		const res = await AppAuth.fetch(`${API_BASE_URL}/khachhang/${currentUserId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		});

		const result = await res.json();
		if (!res.ok) return showToast("❌ " + result.message);

		showToast("Cập nhật thành công!");
		localStorage.setItem("userName", data.hoTen);
		await loadUserData();  

		document.querySelectorAll("#profileForm .info-row").forEach((row) => {
			row.classList.remove("editing");

			const input = row.querySelector(".info-input");
			const disp = row.querySelector(".info-display");
			const btn = row.querySelector(".btn-change");

			if (input) input.style.display = "none";
			if (disp) disp.style.display = "block";
			if (btn && btn.textContent === "Hủy") btn.textContent = "Thay đổi";
		});

		disableSaveButton();
	} catch (err) {
		console.error(err);
		showToast("❌ Lỗi kết nối server");
	}
});
// Đổi mật khẩu.
const passOld = document.getElementById("passOld");
const passNew = document.getElementById("passNew");
const passConfirm = document.getElementById("passConfirm");

const passOldErr = document.getElementById("passOldErr");
const passNewErr = document.getElementById("passNewErr");
const passConfirmErr = document.getElementById("passConfirmErr");

const savePassBtn = document.getElementById("savePasswordBtn");
const cancelPassBtn = document.getElementById("cancelPasswordBtn");

// Kiểm tra biểu mẫu.
function updatePassButtons() {
	const oldVal = passOld.value;
	const newVal = passNew.value;
	const confirmVal = passConfirm.value;

	if (oldVal || newVal || confirmVal) {
		cancelPassBtn.classList.remove("hidden");
		cancelPassBtn.classList.add("active");
	} else {
		cancelPassBtn.classList.add("hidden");
		cancelPassBtn.classList.remove("active");
	}

	const hasEmpty = !oldVal || !newVal || !confirmVal;
	const hasError =
		passOldErr.textContent ||
		passNewErr.textContent ||
		passConfirmErr.textContent;

	savePassBtn.disabled = hasEmpty || !!hasError;
	savePassBtn.classList.toggle("disabled", savePassBtn.disabled);
}

// Xóa lỗi nhập liệu.
[passOld, passNew, passConfirm].forEach((input) => {
	input.addEventListener("input", () => {
		if (input.id === "passOld") passOldErr.textContent = "";
		if (input.id === "passNew") passNewErr.textContent = "";
		if (input.id === "passConfirm") passConfirmErr.textContent = "";

		updatePassButtons();
	});
});

// Hủy thao tác.
cancelPassBtn.addEventListener("click", () => {
	[passOld, passNew, passConfirm].forEach((i) => (i.value = ""));
	[passOldErr, passNewErr, passConfirmErr].forEach((e) => (e.textContent = ""));
	updatePassButtons();
});

// Gửi biểu mẫu.
document.getElementById("passForm").addEventListener("submit", async (e) => {
	e.preventDefault();

	passOldErr.textContent = "";
	passNewErr.textContent = "";
	passConfirmErr.textContent = "";

	const oldVal = passOld.value;
	const newVal = passNew.value;
	const confirmVal = passConfirm.value;

	let hasError = false;

	if (!oldVal) {
		passOldErr.textContent = "Mật khẩu cũ không được để trống!";
		hasError = true;
	}

	if (!newVal) {
		passNewErr.textContent = "Mật khẩu mới không được để trống!";
		hasError = true;
	} else if (newVal === oldVal) {
		passNewErr.textContent = "Mật khẩu mới phải khác mật khẩu cũ!";
		hasError = true;
	}

	if (!confirmVal) {
		passConfirmErr.textContent = "Vui lòng xác nhận mật khẩu!";
		hasError = true;
	} else if (confirmVal !== newVal) {
		passConfirmErr.textContent = "Mật khẩu xác nhận không khớp!";
		hasError = true;
	}

	updatePassButtons();
	if (hasError) return;

	try {
		const res = await AppAuth.fetch(
			`${API_BASE_URL}/khachhang/${currentUserId}/changepassword`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ oldPassword: oldVal, newPassword: newVal }),
			},
		);

		const result = await res.json();

		if (!res.ok) {
			if (result.field === "oldPassword")
				passOldErr.textContent = result.message;
			else if (result.field === "newPassword") passNewErr.textContent = result.message;
            else showToast("❌ " + result.message);
			updatePassButtons();
			return;
		}

		showToast(result.message || "Đổi mật khẩu thành công!");
        if (result.reauthenticate) {
            AppAuth.clearLocal();
            setTimeout(() => window.location.replace(AppAuth.loginURL), 1200);
        }
		cancelPassBtn.click();  
		updatePassButtons();
	} catch (err) {
		console.error(err);
		showToast("❌ Lỗi kết nối server");
	}
});

updatePassButtons();
document.querySelectorAll(".toggle-password").forEach((span) => {
	span.addEventListener("click", () => {
		const input = span.previousElementSibling;
		if (input.type === "password") {
			input.type = "text";
			span.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
		} else {
			input.type = "password";
			span.innerHTML = '<i class="fa-regular fa-eye"></i>';
		}
	});
});


async function loadMedicalHistory() {
	const currentUserId = localStorage.getItem("userId");
	if (!currentUserId) return;

	try {
		if (medicalHistoryTableBody) {
			medicalHistoryTableBody.innerHTML =
				'<tr><td colspan="4" style="text-align: center;">Đang tải dữ liệu...</td></tr>';
		}

		const res = await AppAuth.fetch(`${AppAuth.apiOrigin}/hosoyte/${currentUserId}`);
		const data = await res.json();

		medicalHistoryData = data.lichsu || [];

		medicalHistoryData.sort(
			(a, b) => new Date(b.ngayKham) - new Date(a.ngayKham),
		);

		renderMedicalTable(medicalHistoryData);
	} catch (err) {
		console.error(err);
		if (medicalHistoryTableBody) {
			medicalHistoryTableBody.innerHTML =
				'<tr><td colspan="4" style="color: red; text-align: center;">Lỗi tải dữ liệu.</td></tr>';
		}
		showToast("❌ Lỗi tải dữ liệu lịch sử khám bệnh");
	}
}

const sortButton = document.querySelector(".sort-options .btn");
const sortMenu = document.querySelector(".sort-options .sort-menu");

if (sortButton) {
	sortButton.addEventListener("click", (e) => {
		e.stopPropagation();  
		sortMenu.classList.toggle("hidden");
	});
}
document.addEventListener("click", (e) => {
	if (sortMenu && !sortMenu.contains(e.target) && e.target !== sortButton) {
		sortMenu.classList.add("hidden");
	}
});

function renderMedicalTable(lichsu) {
	const tbody = document.querySelector(".medical-history-table tbody");
	const detailContainer = document.querySelector(".medical-record-detail");

	if (!tbody || !detailContainer) return;

	tbody.innerHTML = "";
	detailContainer.innerHTML = `<p class="detail-placeholder">Chi tiết kết quả khám</p>`;

	if (!lichsu || lichsu.length === 0) {
		tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Chưa có lịch sử khám bệnh</td></tr>`;
		return;
	}

	lichsu.forEach((item) => {
		const tr = document.createElement("tr");
		const ngayKhamFormatted = new Date(item.ngayKham).toLocaleDateString(
			"vi-VN",
		);

		tr.dataset.chiTiet = `
            <h3>Kết Quả Khám: ${ngayKhamFormatted}</h3>
            <p><strong>Bác sĩ:</strong> ${AppAuth.escapeHTML(item.bacSi)}</p>
            <p><strong>Khoa:</strong> ${AppAuth.escapeHTML(item.khoa)}</p>
            <p><strong>Kết luận:</strong> ${AppAuth.escapeHTML(item.ketLuan)}</p>
            <hr>
            <p>${AppAuth.escapeHTML(item.chiTiet || "Thông tin chi tiết đang cập nhật...")}</p>
        `;

		tr.innerHTML = `
            <td>${ngayKhamFormatted}</td>
            <td>${AppAuth.escapeHTML(item.bacSi)}</td>
            <td>${AppAuth.escapeHTML(item.khoa)}</td>
            <td>${AppAuth.escapeHTML(item.ketLuan)}</td>
        `;
		tbody.appendChild(tr);
	});

	tbody.querySelectorAll("tr").forEach((tr) => {
		tr.addEventListener("click", () => {
			let oldDetailContent = detailContainer.querySelector(
				"#active-medical-detail",
			);
			if (oldDetailContent) oldDetailContent.remove();

			const newDetailDiv = document.createElement("div");
			newDetailDiv.id = "active-medical-detail";
			newDetailDiv.innerHTML = tr.dataset.chiTiet;

			detailContainer.appendChild(newDetailDiv);

			document.querySelector(
				".medical-record-detail .detail-placeholder",
			).style.display = "none";

			tbody
				.querySelectorAll("tr")
				.forEach((r) => r.classList.remove("selected"));
			tr.classList.add("selected");
		});
	});
}

if (sortMenu) {
	sortMenu.querySelectorAll("a").forEach((a) => {
		a.addEventListener("click", (e) => {
			e.preventDefault();

			if (medicalHistoryData.length === 0) {
				sortMenu.classList.add("hidden");
				return;
			}

			const isDescending = a.querySelector(".fa-arrow-down");
			const order = isDescending ? "desc" : "asc";

			medicalHistoryData.sort((a, b) => {
				const dateA = new Date(a.ngayKham);
				const dateB = new Date(b.ngayKham);
				return order === "asc" ? dateA - dateB : dateB - dateA;
			});

			renderMedicalTable(medicalHistoryData);

			sortMenu.classList.add("hidden");
		});
	});
}

const appointmentsListContainer = document.getElementById(
	"appointmentsListContainer",
);
const appointmentDetailView = document.getElementById("appointmentDetailView");
const appointmentTableBody = document.querySelector(
	".appointments-table tbody",
);
const noAppointmentsMsg = document.getElementById("no-appointments-message");
const filterButtons = document.querySelectorAll(".filter-btn");

let appointmentList = [];

function loadAppointments(status = "all") {
	if (!currentUserId) return;

	appointmentDetailView.style.display = "none";
	appointmentsListContainer.style.display = "block";

	AppAuth.fetch(`${API_BASE_URL}/lich-user/${currentUserId}`)
		.then((res) => res.json())
		.then((data) => {
			appointmentList = data || [];  

			let list = appointmentList;

			if (status !== "all") {
				const filterMap = {
					pending: "chờ xác nhận",
					confirmed: "đã xác nhận",
					rejected: "từ chối",
					cancelled: "đã hủy",
				};
				const filterStatus = filterMap[status] || null;

				if (filterStatus) {
					list = list.filter(
						(item) => (item.trangThai || "").toLowerCase() === filterStatus,
					);
				}
			}

			if (list.length === 0) {
				appointmentTableBody.innerHTML = "";
				noAppointmentsMsg.style.display = "block";
			} else {
				noAppointmentsMsg.style.display = "none";
			}

			appointmentTableBody.innerHTML = list
				.map((item) => {
					const itemStatus = (item.trangThai || "").toLowerCase();

					let statusText = item.trangThai || "-";
					let statusClass = "status-pending";

					if (itemStatus === "chờ xác nhận" || itemStatus === "chưa xác nhận") {
						statusText = "Chưa xác nhận";
						statusClass = "status-pending";
					} else if (
						itemStatus === "đã xác nhận" ||
						itemStatus === "xác nhận"
					) {
						statusText = "Đã xác nhận";
						statusClass = "status-confirmed";
					} else if (itemStatus === "từ chối") {
						statusText = "Từ chối";
						statusClass = "status-rejected";
					} else if (itemStatus === "đã hủy") {
						statusText = "Đã hủy";
						statusClass = "status-cancelled";
					}

					return `
                    <tr data-id="${item.idLichKham}">
                        <td>${AppAuth.escapeHTML(item.tenBacSi)}</td>
                        <td>${AppAuth.escapeHTML(item.tenKhoa)}</td>
                        <td>${formatDateDisplay(item.ngayKham)}</td> 
                        <td>${item.gioKham.substring(0, 5)}</td>   
                        <td class="status-cell">
                                <span class="status-badge ${statusClass}">
                            ${AppAuth.escapeHTML(statusText)}
                                            </span>
                        </td>
                    
                    </tr>
                `;
				})
				.join("");
		})
		.catch((err) => {
			console.error("Lỗi load lịch khám:", err);
			appointmentTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
		});
}

filterButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		filterButtons.forEach((b) => b.classList.remove("active"));

		btn.classList.add("active");

		const status = btn.dataset.status;

		loadAppointments(status);
	});
});

function formatDateDisplay(dateString) {
	if (!dateString) return "";

	let datePart = dateString.split("T")[0];

	const parts = datePart.split("-");
	if (parts.length === 3) {
		return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
	}

	return dateString;
}


function updateProgressBar(status) {
	const lowerCaseStatus = (status || "").toLowerCase();

	document
		.querySelectorAll(".progress-step")
		.forEach((step) =>
			step.classList.remove("active", "cancelled", "rejected"),
		);
	document
		.querySelectorAll(".progress-line")
		.forEach((line) => line.classList.remove("active"));

	document.getElementById("step_placed").style.display = "flex";
	document.getElementById("step_pending").style.display = "flex";
	document.getElementById("step_confirmed").style.display = "flex";
	document.getElementById("step_cancelled").style.display = "none";
	document.getElementById("step_rejected").style.display = "none";

	document.getElementById("line1").style.display = "block";
	document.getElementById("line2").style.display = "block";

	document.querySelector("#step_pending .circle").innerHTML =
		'<i class="fa-solid fa-hourglass-half"></i>';

	document.querySelector("#step_cancelled .circle").innerHTML =
		'<i class="fa-solid fa-xmark"></i>';
	document.querySelector("#step_rejected .circle").innerHTML =
		'<i class="fa-solid fa-ban"></i>';

	// Cập nhật trạng thái lịch.

	if (
		lowerCaseStatus === "chờ xác nhận" ||
		lowerCaseStatus === "chưa xác nhận"
	) {
		document.getElementById("step_placed").classList.add("active");
		document.getElementById("line1").classList.add("active");
		document.getElementById("step_pending").classList.add("active");
	} else if (
		lowerCaseStatus === "đã xác nhận" ||
		lowerCaseStatus === "xác nhận"
	) {
		document.getElementById("step_placed").classList.add("active");
		document.getElementById("line1").classList.add("active");
		document.getElementById("step_pending").classList.add("active");
		document.getElementById("line2").classList.add("active");
		document.getElementById("step_confirmed").classList.add("active");

		document.querySelector("#step_pending .circle").innerHTML =
			'<i class="fa-solid fa-check"></i>';
	} else if (lowerCaseStatus === "từ chối") {
		document.getElementById("step_placed").style.display = "none";
		document.getElementById("step_pending").style.display = "none";
		document.getElementById("step_confirmed").style.display = "none";
		document.getElementById("line1").style.display = "none";
		document.getElementById("line2").style.display = "none";
		document.getElementById("step_rejected").style.display = "flex";
		document.getElementById("step_rejected").classList.add("rejected");
	} else if (lowerCaseStatus === "đã hủy") {
		document.getElementById("step_placed").style.display = "none";
		document.getElementById("step_pending").style.display = "none";
		document.getElementById("step_confirmed").style.display = "none";
		document.getElementById("line1").style.display = "none";
		document.getElementById("line2").style.display = "none";
		document.getElementById("step_cancelled").style.display = "flex";
		document.getElementById("step_cancelled").classList.add("cancelled");
	}
}


const appointmentsListView = document.querySelector(
	".appointments-table tbody",
);
const backToAppointmentsBtn = document.getElementById("backToAppointmentsList");
const cancelAppointmentArea = document.getElementById("cancelAppointmentArea");
const cancelAppointmentBtn = document.getElementById("cancelAppointmentBtn");

if (appointmentsListView && appointmentDetailView) {
	appointmentsListView.addEventListener("click", (e) => {
		const tr = e.target.closest("tr");
		if (!tr) return;

		const idLichKham = tr.dataset.id;
		const item = appointmentList.find((i) => i.idLichKham == idLichKham);

		if (!item) return;

		document.getElementById("detail_idLichKham").textContent =
			`#${item.idLichKham}`;
		document.getElementById("detail_hoTen").textContent = item.hoTen;
		document.getElementById("detail_lyDo").textContent =
			item.lyDo || "Không có";
		document.getElementById("detail_tenBacSi").textContent = item.tenBacSi;
		document.getElementById("detail_tenKhoa").textContent = item.tenKhoa;
		document.getElementById("detail_ngayKham").textContent = formatDateDisplay(
			item.ngayKham,
		);
		document.getElementById("detail_gioKham").textContent =
			item.gioKham.substring(0, 5);

		updateProgressBar(item.trangThai);

		const currentStatus = (item.trangThai || "").toLowerCase().trim();
		const canCancel = [
			"chờ xác nhận",
			"chưa xác nhận",
			"đã xác nhận",
			"xác nhận",
		].includes(currentStatus);
		if (canCancel) {
			cancelAppointmentBtn.dataset.id = item.idLichKham;
			cancelAppointmentArea.style.display = "block";
		} else {
			cancelAppointmentArea.style.display = "none";
		}

		appointmentsListContainer.style.display = "none";
		appointmentDetailView.style.display = "block";
	});

	backToAppointmentsBtn.addEventListener("click", (e) => {
		e.preventDefault();
		appointmentDetailView.style.display = "none";
		appointmentsListContainer.style.display = "block";
	});

	cancelAppointmentBtn.addEventListener("click", async function () {
		const idLichKham = this.dataset.id;
		if (
			!confirm(
				`Bạn có chắc chắn muốn hủy lịch khám #${idLichKham} này không? Sau khi hủy, Admin sẽ không thể đổi lại trạng thái.`,
			)
		) {
			return;
		}

		try {
			const res = await AppAuth.fetch(`${API_BASE_URL}/huy-lich`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ idLichKham }),
			});

			const result = await res.json();

			if (!res.ok || !result.success) {
				showToast("❌ " + (result.message || "Hủy lịch thất bại!"));
				return;
			}

			showToast("✅ Hủy lịch thành công!");

			const activeStatus =
				document.querySelector(".filter-btn.active").dataset.status;
			loadAppointments(activeStatus);

			backToAppointmentsBtn.click();
		} catch (err) {
			console.error("Lỗi hủy lịch:", err);
			showToast("❌ Lỗi kết nối server khi hủy lịch.");
		}
	});
}

})();
