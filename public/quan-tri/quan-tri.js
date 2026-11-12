// Giao diện quản trị.
// Quản lý bác sĩ.
(async () => {
if (!(await AppAuth.ready)) return;

const API_BASE_ADMIN = (AppAuth.apiOrigin + "/api/admin/bacsi");
const API_KHOA = (AppAuth.apiOrigin + "/api/khoa");

(async function initDoctorsModule() {
	const doctorsSection = document.querySelector('section[data-page="doctors"]');
	if (!doctorsSection) {
		console.warn(
			"Không tìm thấy section[data-page='doctors'] trong admin.html",
		);
		return;
	}

	const table = doctorsSection.querySelector("table");
	if (!table) {
		console.warn("Không tìm thấy <table> trong section doctors");
		return;
	}
	let tbody = table.querySelector("tbody");
	if (!tbody) {
		tbody = document.createElement("tbody");
		table.appendChild(tbody);
	}

	const existingAddBtn = doctorsSection.querySelector("button.bg-teal-500");

	const toolbar = document.createElement("div");
	toolbar.className = "mb-4 flex items-center justify-between gap-3";
	toolbar.innerHTML = `
    <div class="flex items-center gap-2">
      <input id="doctorSearch" placeholder="Tìm tên hoặc khoa..." class="border rounded px-3 py-2 w-64" />
      <button id="refreshDoctors" class="px-3 py-2 border rounded">🔄 Làm mới</button>
    </div>
    <div></div>
  `;
	table.parentNode.insertBefore(toolbar, table);

	const searchInput = toolbar.querySelector("#doctorSearch");
	const refreshBtn = toolbar.querySelector("#refreshDoctors");

	if (existingAddBtn) {
		const addBtnClone = existingAddBtn.cloneNode(true);
		addBtnClone.id = "addDoctorBtn";
		addBtnClone.textContent = "➕ Thêm bác sĩ";
		addBtnClone.className = "bg-teal-500 text-white px-3 py-2 rounded-lg";
		toolbar.querySelector("div:last-child").appendChild(addBtnClone);
		existingAddBtn.style.display = "none";
	} else {
		const addBtn = document.createElement("button");
		addBtn.id = "addDoctorBtn";
		addBtn.className = "bg-teal-500 text-white px-3 py-2 rounded-lg";
		addBtn.textContent = "➕ Thêm bác sĩ";
		toolbar.querySelector("div:last-child").appendChild(addBtn);
	}

	const addDoctorBtn = document.getElementById("addDoctorBtn");

	let doctors = [];
	let khoaList = [];

	async function loadKhoa() {
		try {
			const r = await AppAuth.fetch(API_KHOA);
			khoaList = await r.json();
		} catch (err) {
			console.error("Lỗi load khoa:", err);
			khoaList = [];
		}
	}

	async function loadDoctors(q = "") {
		try {
			const url = q
				? `${API_BASE_ADMIN}?q=${encodeURIComponent(q)}`
				: API_BASE_ADMIN;
			const r = await AppAuth.fetch(url);
			doctors = await r.json();
			renderDoctors();
		} catch (err) {
			console.error("Lỗi load doctors:", err);
			tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-red-600">Lỗi khi tải danh sách bác sĩ</td></tr>`;
		}
	}

	function renderDoctors() {
		if (!Array.isArray(doctors) || doctors.length === 0) {
			tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-gray-600 text-center">Chưa có bác sĩ</td></tr>`;
			return;
		}

		tbody.innerHTML = doctors
			.map((d) => {
				const id = d.idBacSi || "";
				const name = escapeHtml(d.hoTenBacSi || d.tenBacSi || "");
				const hocVi = escapeHtml(d.hocVi || "");
				const tenKhoa = escapeHtml(d.tenKhoa || "");

				return `
      <tr class="border-t hover:bg-gray-50">
        <td class="p-2 font-medium text-center">${id}</td>
        <td class="p-2">${name}</td>
        <td class="p-2">${hocVi}</td>
        <td class="p-2">${tenKhoa}</td>
        <td class="p-2 text-center">
          <button class="editDoctor px-2 py-1 mr-2 text-teal-600 hover:underline" data-id="${id}">✏️</button>
          <button class="deleteDoctor px-2 py-1 text-red-600 hover:underline" data-id="${id}">🗑️</button>
        </td>
      </tr>`;
			})
			.join("");

		tbody.querySelectorAll(".editDoctor").forEach((btn) => {
			btn.addEventListener("click", () => openDoctorModal(btn.dataset.id));
		});
		tbody.querySelectorAll(".deleteDoctor").forEach((btn) => {
			btn.addEventListener("click", () => deleteDoctor(btn.dataset.id));
		});
	}

	function openDoctorModal(id = null) {
		const existing = id
			? doctors.find((x) => String(x.idBacSi) === String(id))
			: null;

		const khoaOptions = khoaList
			.map(
				(k) =>
					`<option value="${k.idKhoa}" ${existing && existing.idKhoa == k.idKhoa ? "selected" : ""}>${escapeHtml(k.tenKhoa)}</option>`,
			)
			.join("");

		const modal = document.createElement("div");
		modal.className = "fixed inset-0 z-50 flex items-center justify-center";
		modal.style.background = "rgba(0,0,0,0.45)";
		modal.innerHTML = `
      <div class="bg-white rounded-lg w-[92%] max-w-md p-6 shadow-lg">
        <h3 class="text-lg font-semibold mb-3">${id ? "Sửa bác sĩ" : "Thêm bác sĩ"}</h3>
        <form id="doctorForm" class="space-y-3">
          <div>
            <label class="block text-sm mb-1">Họ tên bác sĩ</label>
            <input name="hoTenBacSi" class="w-full border rounded px-3 py-2" value="${escapeHtml(existing?.hoTenBacSi || "")}" required />
          </div>
          <div>
            <label class="block text-sm mb-1">Học vị</label>
            <input name="hocVi" class="w-full border rounded px-3 py-2" value="${escapeHtml(existing?.hocVi || "")}" />
          </div>
          <div>
            <label class="block text-sm mb-1">Khoa</label>
            <select name="idKhoa" class="w-full border rounded px-3 py-2" required>
              <option value="">-- Chọn khoa --</option>
              ${khoaOptions}
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" id="cancelModal" class="px-3 py-2 border rounded">Hủy</button>
            <button type="submit" class="px-3 py-2 bg-teal-600 text-white rounded">${id ? "Lưu" : "Thêm"}</button>
          </div>
        </form>
      </div>
    `;
		document.body.appendChild(modal);

		modal
			.querySelector("#cancelModal")
			.addEventListener("click", () => modal.remove());
		modal.addEventListener("click", (e) => {
			if (e.target === modal) modal.remove();
		});

		const form = modal.querySelector("#doctorForm");
		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			const fd = new FormData(form);
			const payload = Object.fromEntries(fd.entries());
			if (!payload.hoTenBacSi || !payload.idKhoa) {
				alert("Vui lòng điền tên bác sĩ và chọn khoa");
				return;
			}
			try {
				if (id) {
					const res = await AppAuth.fetch(`${API_BASE_ADMIN}/${id}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					const json = await res.json();
					if (!res.ok) throw new Error(json.message || "Cập nhật thất bại");
					alert(json.message || "Cập nhật thành công");
				} else {
					const res = await AppAuth.fetch(API_BASE_ADMIN, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					const json = await res.json();
					if (!res.ok) throw new Error(json.message || "Thêm thất bại");
					alert(json.message || "Thêm thành công");
				}
			} catch (err) {
				console.error(err);
				alert(err.message || "Lỗi khi lưu bác sĩ");
			} finally {
				modal.remove();
				await loadDoctors(searchInput.value.trim());
			}
		});
	}

	async function deleteDoctor(id) {
		if (!id) return;

		const doctor = doctors.find((d) => String(d.idBacSi) === String(id));
		const doctorName = doctor?.hoTenBacSi || doctor?.tenBacSi || `ID ${id}`;

		const firstConfirm = confirm(
			`Bạn có chắc chắn muốn xóa bác sĩ "${doctorName}" không?`,
		);

		if (!firstConfirm) return;

		try {
			const res = await AppAuth.fetch(`${API_BASE_ADMIN}/${id}`, { method: "DELETE" });
			const result = await res.json();

			if (!res.ok) {
				throw new Error(result.message || "Xóa bác sĩ thất bại!");
			}

			if (result.requireConfirm) {
				const forceConfirm = confirm(
					`${result.message}\n\nBạn có chắc chắn muốn xóa bác sĩ và toàn bộ dữ liệu liên quan không?`,
				);

				if (!forceConfirm) return;

				const res2 = await AppAuth.fetch(`${API_BASE_ADMIN}/${id}?force=true`, {
					method: "DELETE",
				});
				const result2 = await res2.json();

				if (!res2.ok) {
					throw new Error(result2.message || "Xóa bác sĩ thất bại!");
				}

				alert(result2.message || "Đã xóa bác sĩ và dữ liệu liên quan!");
			} else {
				alert(result.message || "Đã xóa bác sĩ thành công!");
			}

			await loadDoctors(searchInput.value.trim());
		} catch (err) {
			console.error("❌ Lỗi khi xóa bác sĩ:", err);
			alert(err.message || "Đã xảy ra lỗi khi xóa bác sĩ!");
		}
	}

	function escapeHtml(str) {
		if (str == null) return "";
		return String(str).replace(
			/[&<>"']/g,
			(m) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[m],
		);
	}

	addDoctorBtn.addEventListener("click", () => openDoctorModal());
	refreshBtn.addEventListener("click", () =>
		loadDoctors(searchInput.value.trim()),
	);
	searchInput.addEventListener("input", (e) => {
		const q = e.target.value.trim();
		loadDoctors(q);
	});


	await loadKhoa();
	await loadDoctors();
})();

})();

// Quản lý tài khoản.
(async () => {
if (!(await AppAuth.ready)) return;
const API_BASE = (AppAuth.apiOrigin + "");  
const API_TAIKHOAN = API_BASE + "/api/taikhoan";

async function loadAccounts() {
	try {

		const res = await AppAuth.fetch(API_TAIKHOAN);
		if (!res.ok) {
			const text = await res.text();
			throw new Error("API trả về lỗi: " + res.status + " - " + text);
		}
		const data = await res.json();


		const tbody = document.getElementById("accountList");
		if (!tbody) {
			console.error("Không tìm thấy #accountList trong DOM");
			return;
		}
		tbody.innerHTML = "";

		if (!Array.isArray(data) || data.length === 0) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center p-2 text-gray-500">Không có tài khoản nào</td></tr>`;
			return;
		}

		data.forEach((acc) => {
			const tr = document.createElement("tr");
			tr.classList.add("border-t");
			tr.innerHTML = `
          <td class="p-2">${acc.idKH ?? ""}</td>
          <td class="p-2">${AppAuth.escapeHTML(acc.hoTen ?? "")}</td>
          <td class="p-2">${AppAuth.escapeHTML(acc.gioiTinh ?? "")}</td>
          <td class="p-2">${AppAuth.escapeHTML(acc.sdt ?? "")}</td>
          <td class="p-2">
            <button onclick="deleteAccount(${
							acc.idKH
						})" class="text-red-500 hover:underline">Xóa</button>
          </td>
        `;
			tbody.appendChild(tr);
		});
	} catch (err) {
		console.error("Lỗi khi tải danh sách tài khoản:", err);
		const tbody = document.getElementById("accountList");
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center p-2 text-red-500">Lỗi khi tải dữ liệu. Kiểm tra console.</td></tr>`;
		}
	}
}

async function deleteAccount(idKH) {
  if (!confirm("Bạn có chắc muốn xóa tài khoản này không?")) return;
  try {
    const url = `${API_TAIKHOAN}/${idKH}`;
    const res = await AppAuth.fetch(url, { method: "DELETE" });
    const result = await res.json();

    if (result.requireConfirm) {
      const msg = `${result.message}\n\nChọn OK để xóa toàn bộ, Cancel để hủy.`;
      if (confirm(msg)) {
        const forceRes = await AppAuth.fetch(`${url}?force=true`, { method: "DELETE" });
        const forceJson = await forceRes.json();
        alert(forceJson.message || "Đã xóa tài khoản và dữ liệu liên quan!");
      } else {
        alert("❎ Đã hủy thao tác xóa.");
      }
    } else {
      alert(result.message || "🗑️ Xóa tài khoản thành công!");
    }

    loadAccounts();
  } catch (err) {
    console.error("Lỗi khi xóa tài khoản:", err);
    alert("Xảy ra lỗi khi xóa. Kiểm tra console.");
  }
}

const accBtn = document.querySelector('button[data-page="accounts"]');
if (accBtn) {
	accBtn.addEventListener("click", () => {
		loadAccounts();
	});
} else {
	AppAuth.onReady( loadAccounts);
}

window.deleteAccount = deleteAccount;

})();

// Quản lý lịch khám.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
	const tableBody = document.querySelector("#lichTable tbody");
	const apiUrl = (AppAuth.apiOrigin + "/api/admin/lichkham");
	const baseUrl = (AppAuth.apiOrigin + "/api");

	const BOOKING_TIME_SLOTS = [
		"07:45",
		"08:00",
		"08:15",
		"08:30",
		"08:45",
		"09:00",
		"09:15",
		"09:30",
		"09:45",
		"10:00",
	];

	const modal = document.getElementById("lichModal");
	const openBtn = document.getElementById("openAddLich");
	const closeBtn = document.getElementById("closeLichModal");
	const cancelBtn = document.getElementById("cancelLich");
	const form = document.getElementById("lichForm");

	const idKHInput = document.getElementById("idKH");
	const hoTen = document.getElementById("hoTen");
	const lyDo = document.getElementById("lyDo");
	const ngayKham = document.getElementById("ngayKham");
	const gioKham = document.getElementById("gioKham");
	const gioKhamSlots = document.getElementById("gioKhamSlots");
	const gioKhamHint = document.getElementById("gioKhamHint");
	const idKhoa = document.getElementById("idKhoa");
	const idBacSi = document.getElementById("idBacSi");

	function normalizeStatus(status) {
		return String(status || "")
			.trim()
			.toLowerCase();
	}

	function statusLabel(status) {
		const value = normalizeStatus(status);
		if (value === "chờ xác nhận" || value === "chưa xác nhận")
			return "Chưa xác nhận";
		if (value === "đã xác nhận" || value === "xác nhận") return "Xác nhận";
		if (value === "từ chối") return "Từ chối";
		if (value === "đã hủy") return "Khách hàng đã hủy";
		return status || "-";
	}

	function escapeHtml(value) {
		return String(value ?? "").replace(
			/[&<>"']/g,
			(ch) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[ch],
		);
	}

	// Danh sách lịch khám.
	async function loadAppointments() {
		try {
			const res = await AppAuth.fetch(apiUrl);
			const data = await res.json();

			if (!res.ok || !Array.isArray(data)) {
				throw new Error(data.message || "Không tải được danh sách lịch khám");
			}

			tableBody.innerHTML = "";
			data.forEach((row) => {
				const tr = document.createElement("tr");
				tr.classList.add("border-t");

				const currentStatus = normalizeStatus(row.trangThai);
				const customerCancelled = currentStatus === "đã hủy";

				const statusControl = customerCancelled
					? `
            <div class="admin-status-locked" title="Khách hàng đã hủy lịch. Admin không thể thay đổi trạng thái này.">
              <span>🔒 Khách hàng đã hủy</span>
            </div>`
					: `
            <select data-id="${row.idLichKham}" data-current="${escapeHtml(row.trangThai)}" class="appointment-status-select border rounded px-2 py-1 text-sm">
              <option value="chờ xác nhận" ${["chờ xác nhận", "chưa xác nhận"].includes(currentStatus) ? "selected" : ""}>Chưa xác nhận</option>
              <option value="đã xác nhận" ${["đã xác nhận", "xác nhận"].includes(currentStatus) ? "selected" : ""}>Xác nhận</option>
              <option value="từ chối" ${currentStatus === "từ chối" ? "selected" : ""}>Từ chối</option>
            </select>`;

				tr.innerHTML = `
          <td class="p-2">${row.idLichKham}</td>
          <td class="p-2">${row.idKH || "-"}</td>
          <td class="p-2">${escapeHtml(row.hoTen)}</td>
          <td class="p-2">${escapeHtml(row.lyDo || "")}</td>
          <td class="p-2">${escapeHtml(row.ngayKham)}</td>
          <td class="p-2">${escapeHtml(String(row.gioKham || "").substring(0, 5))}</td>
          <td class="p-2">${escapeHtml(row.tenBacSi)}</td>
          <td class="p-2">${escapeHtml(row.tenKhoa)}</td>
          <td class="p-2">${statusControl}</td>
          <td class="p-2 text-center">
            <button data-id="${row.idLichKham}" class="delBtn text-red-600" title="Xóa lịch khám">🗑️</button>
          </td>
        `;
				tableBody.appendChild(tr);
			});
		} catch (error) {
			console.error(error);
			tableBody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-red-600">Không tải được danh sách lịch khám.</td></tr>`;
		}
	}

	// Chọn chuyên khoa và bác sĩ.
	async function loadOptions() {
		try {
			const khoaRes = await AppAuth.fetch(`${baseUrl}/khoa`);
			const khoaData = await khoaRes.json();

			idKhoa.innerHTML = '<option value="">-- Chọn khoa --</option>';
			khoaData.forEach((k) => {
				idKhoa.innerHTML += `<option value="${k.idKhoa}">${escapeHtml(k.tenKhoa)}</option>`;
			});

			idBacSi.innerHTML = '<option value="">-- Chọn bác sĩ --</option>';
		} catch (error) {
			console.error("Lỗi tải khoa:", error);
		}
	}

	idKhoa.addEventListener("change", async () => {
		const id = idKhoa.value;
		idBacSi.innerHTML = '<option value="">-- Chọn bác sĩ --</option>';
		resetTimeSlots("Vui lòng chọn bác sĩ và ngày khám để xem khung giờ.");

		if (!id) return;

		try {
			const res = await AppAuth.fetch(`${baseUrl}/bacsi/${id}`);
			const data = await res.json();
			data.forEach((b) => {
				idBacSi.innerHTML += `<option value="${b.idBacSi}">${escapeHtml(b.hoTenBacSi)} (${escapeHtml(b.hocVi || "")})</option>`;
			});
		} catch (error) {
			console.error("Lỗi tải bác sĩ:", error);
		}
	});

	// Khung giờ khám.
	function resetTimeSlots(
		message = "Vui lòng chọn bác sĩ và ngày khám để xem khung giờ.",
	) {
		gioKham.value = "";
		gioKhamSlots.innerHTML = "";
		gioKhamHint.textContent = message;
		gioKhamHint.classList.remove("has-slots");
	}

	function renderTimeSlots(bookedTimes = []) {
		gioKham.value = "";
		gioKhamSlots.innerHTML = "";
		gioKhamHint.textContent =
			"Chọn một khung giờ còn trống. Ô màu đen là giờ bác sĩ đã có lịch khám.";
		gioKhamHint.classList.add("has-slots");

		BOOKING_TIME_SLOTS.forEach((time) => {
			const isBooked = bookedTimes.includes(time);
			const button = document.createElement("button");
			button.type = "button";
			button.className = `admin-time-slot ${isBooked ? "booked" : "available"}`;
			button.dataset.time = time;
			button.disabled = isBooked;
			button.innerHTML = `
        <span class="slot-time">${time}</span>
        <span class="slot-note">${isBooked ? "Đã có lịch khám" : "Còn trống"}</span>
      `;

			if (!isBooked) {
				button.addEventListener("click", () => {
					gioKhamSlots
						.querySelectorAll(".admin-time-slot")
						.forEach((slot) => slot.classList.remove("selected"));
					button.classList.add("selected");
					gioKham.value = time;
				});
			}

			gioKhamSlots.appendChild(button);
		});
	}

	async function loadAvailableSlots() {
		const doctorId = idBacSi.value;
		const date = ngayKham.value;

		if (!doctorId || !date) {
			resetTimeSlots();
			return;
		}

		resetTimeSlots("Đang kiểm tra lịch của bác sĩ...");

		try {
			const res = await AppAuth.fetch(
				`${baseUrl}/lich-da-dat?bacsi=${encodeURIComponent(doctorId)}&ngay=${encodeURIComponent(date)}`,
			);
			const bookedTimes = await res.json();
			if (!res.ok)
				throw new Error(
					bookedTimes.message || "Không kiểm tra được lịch bác sĩ",
				);
			renderTimeSlots(Array.isArray(bookedTimes) ? bookedTimes : []);
		} catch (error) {
			console.error(error);
			resetTimeSlots("Không thể tải khung giờ. Vui lòng thử lại.");
		}
	}

	idBacSi.addEventListener("change", loadAvailableSlots);
	ngayKham.addEventListener("change", loadAvailableSlots);

	// Cập nhật trạng thái lịch.
	tableBody.addEventListener("change", async (e) => {
		if (!e.target.classList.contains("appointment-status-select")) return;

		const select = e.target;
		const id = select.dataset.id;
		const trangThai = select.value;
		const previousValue = select.dataset.current;
		select.disabled = true;

		try {
			const res = await AppAuth.fetch(`${apiUrl}/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ trangThai }),
			});
			const result = await res.json();

			if (!res.ok || !result.success) {
				alert(result.message || "Cập nhật trạng thái thất bại!");
				select.value = previousValue;
				await loadAppointments();
				return;
			}

			select.dataset.current = result.trangThai || trangThai;
			await loadAppointments();
		} catch (error) {
			console.error(error);
			alert("Không thể kết nối máy chủ để cập nhật trạng thái!");
			await loadAppointments();
		} finally {
			select.disabled = false;
		}
	});

	// Xóa lịch khám.
	tableBody.addEventListener("click", async (e) => {
		const button = e.target.closest(".delBtn");
		if (!button) return;

		const id = button.dataset.id;
		if (!confirm("Bạn có chắc muốn xóa lịch khám này không?")) return;

		await AppAuth.fetch(`${apiUrl}/${id}`, { method: "DELETE" });
		loadAppointments();
	});

	// Thêm lịch khám.
	openBtn.addEventListener("click", () => {
		modal.classList.remove("hidden");
		form.reset();
		idBacSi.innerHTML = '<option value="">-- Chọn bác sĩ --</option>';
		resetTimeSlots();
	});

	closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
	cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

	form.addEventListener("submit", async (e) => {
		e.preventDefault();

		const idKH = idKHInput.value.trim();
		const hoTenVal = hoTen.value.trim();
		const lyDoVal = lyDo.value.trim();
		const ngayKhamVal = ngayKham.value;
		const gioKhamVal = gioKham.value;
		const idBacSiVal = idBacSi.value;
		const idKhoaVal = idKhoa.value;

		if (!idKH || !hoTenVal || !ngayKhamVal || !idBacSiVal || !idKhoaVal) {
			return alert("⚠️ Vui lòng nhập đầy đủ thông tin!");
		}

		if (!gioKhamVal) {
			return alert("⚠️ Vui lòng chọn một khung giờ khám còn trống!");
		}

		const checkKH = await AppAuth.fetch(`${baseUrl}/admin/khachhang/${idKH}`);
		const khData = await checkKH.json();
		if (!khData.exists) {
			return alert("❌ ID khách hàng không tồn tại trong hệ thống!");
		}

		const res = await AppAuth.fetch(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				idKH,
				hoTen: hoTenVal,
				lyDo: lyDoVal,
				ngayKham: ngayKhamVal,
				gioKham: gioKhamVal,
				idBacSi: idBacSiVal,
				idKhoa: idKhoaVal,
			}),
		});

		const result = await res.json();
		alert(
			result.message ||
				(res.ok ? "Thêm lịch khám thành công!" : "Thêm lịch khám thất bại!"),
		);

		if (!res.ok) {
			if (res.status === 409) await loadAvailableSlots();
			return;
		}

		modal.classList.add("hidden");
		loadAppointments();
	});

	loadAppointments();
	loadOptions();
	resetTimeSlots();
});

})();

// Quản lý hồ sơ y tế.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
  const tableBody = document.querySelector("#hosoyteTable tbody");
  const apiUrl = (AppAuth.apiOrigin + "/api/admin/hosoyte");

  const modal = document.getElementById("hosoyteModal");
  const closeBtn = document.getElementById("closeHosoyteModal");
  const cancelBtn = document.getElementById("cancelHosoyte");
  const addBtn = document.getElementById("openAddHosoyte");
  const form = document.getElementById("hosoyteForm");
  const idKHInput = document.getElementById("idKHInput");

  async function loadData() {
    const res = await AppAuth.fetch(apiUrl);
    const data = await res.json();
    tableBody.innerHTML = "";
    data.forEach((hs) => {
      const tr = document.createElement("tr");
      tr.classList.add("border-t");
      tr.innerHTML = `
        <td class="p-2">${hs.idHoSoYTe}</td>
        <td class="p-2">${hs.idKH}</td>
        <td class="p-2 text-center">
          <button class="viewBtn text-blue-600" data-id="${hs.idHoSoYTe}">👁️</button>
          <button class="delBtn text-red-600" data-id="${hs.idHoSoYTe}">🗑️</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  tableBody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("viewBtn")) {
      const id = e.target.dataset.id;
      const res = await AppAuth.fetch(`${apiUrl}/${id}`);
      const hs = await res.json();
      alert(`
📋 Hồ sơ #${hs.idHoSoYTe}
👤 Họ tên: ${hs.idKH}

      `);
    }
  });

tableBody.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delBtn")) {
    const id = e.target.dataset.id;

    const res = await AppAuth.fetch(`${apiUrl}/${id}`, { method: "DELETE" });
    const check = await res.json();

    if (check.requireConfirm) {
      const confirmDelete = confirm(check.message + "\n\nChọn OK để xóa toàn bộ, Cancel để hủy.");
      if (confirmDelete) {
        await AppAuth.fetch(`${apiUrl}/${id}?force=true`, { method: "DELETE" });
        alert("🗑️ Đã xóa hồ sơ cùng các lịch liên quan!");
      } else {
        alert("❎ Đã hủy xóa.");
      }
    } else {
      alert(check.message || "🗑️ Đã xóa hồ sơ y tế!");
    }

    loadData();
  }
});

  addBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
    form.reset();
  });
  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idKH = idKHInput.value.trim();
    if (!idKH) return alert("Vui lòng nhập ID khách hàng!");
    const res = await AppAuth.fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idKH }),
    });
    const result = await res.json();
    alert(result.message);
    modal.classList.add("hidden");
    loadData();
  });

  loadData();
});

})();

// Quản lý lịch sử khám.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
  console.log("✅ admin-lskhambenh.js loaded");

  const tableBody = document.querySelector("#lichsuTable tbody");
  const modal = document.getElementById("lichsuModal");
  const openBtn = document.getElementById("openAddLS");
  const closeBtn = document.getElementById("closeLSModal");
  const cancelBtn = document.getElementById("cancelLS");
  const form = document.getElementById("lichsuForm");
  const apiUrl = (AppAuth.apiOrigin + "/api/admin/lichsu");

  const idBacSiEl = document.getElementById("idBacSiLS");
  const idKhoaEl = document.getElementById("idKhoaLS");
  const idHSEl = document.getElementById("idHoSoYTeLS");

  function safeText(str) {
    return AppAuth.escapeHTML(str);
  }

  async function loadBacSiTheoKhoa(idKhoaValue, selectValue = null) {
    try {
      if (!idKhoaValue) {
        idBacSiEl.innerHTML = `<option value="">-- Chọn bác sĩ --</option>`;
        return;
      }
      const res = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/bacsi/khoa/${idKhoaValue}`);
      if (!res.ok) throw new Error("Không lấy được danh sách bác sĩ");
      const bacsi = await res.json();
      if (!Array.isArray(bacsi) || bacsi.length === 0) {
        idBacSiEl.innerHTML = `<option value="">(Không có bác sĩ)</option>`;
        return;
      }
      idBacSiEl.innerHTML = bacsi
        .map(b => `<option value="${b.idBacSi}">${safeText(b.hoTenBacSi)}</option>`)
        .join("");
      if (selectValue) idBacSiEl.value = selectValue;
    } catch (err) {
      console.error("❌ loadBacSiTheoKhoa:", err);
      idBacSiEl.innerHTML = `<option value="">(Lỗi tải bác sĩ)</option>`;
    }
  }

  async function loadOptions(defaultKhoaId = null, selectedBacSi = null, selectedHS = null) {
    try {
      const [khoaRes, hsRes] = await Promise.all([
        AppAuth.fetch((AppAuth.apiOrigin + "/api/khoa")),
        AppAuth.fetch((AppAuth.apiOrigin + "/api/admin/hosoyte"))
      ]);

      if (!khoaRes.ok) throw new Error("Lỗi tải khoa");
      if (!hsRes.ok) throw new Error("Lỗi tải hồ sơ y tế");

      const [khoa, hs] = await Promise.all([khoaRes.json(), hsRes.json()]);

      if (Array.isArray(khoa) && khoa.length) {
        idKhoaEl.innerHTML = `<option value="">-- Chọn khoa --</option>` +
          khoa.map(k => `<option value="${k.idKhoa}">${safeText(k.tenKhoa)}</option>`).join("");
        if (defaultKhoaId) idKhoaEl.value = defaultKhoaId;
      } else {
        idKhoaEl.innerHTML = `<option value="">(Không có khoa)</option>`;
      }

      if (Array.isArray(hs) && hs.length) {
        idHSEl.innerHTML = `<option value="">-- Chọn mã hồ sơ --</option>` +
          hs.map(h => `<option value="${h.idHoSoYTe}">HS#${h.idHoSoYTe} (KH#${h.idKH || ""})</option>`).join("");
        if (selectedHS) idHSEl.value = selectedHS;
      } else {
        idHSEl.innerHTML = `<option value="">(Không có hồ sơ y tế)</option>`;
      }

      const targetKhoa = defaultKhoaId || (Array.isArray(khoa) && khoa.length ? khoa[0].idKhoa : null);
      await loadBacSiTheoKhoa(targetKhoa, selectedBacSi);
    } catch (err) {
      console.error("❌ loadOptions:", err);
      idKhoaEl.innerHTML = `<option value="">(Lỗi tải khoa)</option>`;
      idHSEl.innerHTML = `<option value="">(Lỗi tải hồ sơ)</option>`;
      idBacSiEl.innerHTML = `<option value="">(Lỗi tải bác sĩ)</option>`;
    }
  }

  async function loadData() {
    try {
      const res = await AppAuth.fetch(apiUrl);
      if (!res.ok) throw new Error("Lỗi lấy dữ liệu lịch sử");
      const data = await res.json();
      tableBody.innerHTML = "";
      (data || []).forEach(row => {
        const tr = document.createElement("tr");
        tr.classList.add("border-t");
        const ngay = safeText(row.ngayKham).includes("T") ? row.ngayKham.split("T")[0] : safeText(row.ngayKham);
        tr.innerHTML = `
          <td class="p-2">${row.idLS}</td>
          <td class="p-2">${ngay}</td>
          <td class="p-2">${safeText(row.ketLuan)}</td>
          <td class="p-2">${safeText(row.chiTiet)}</td>
          <td class="p-2">${safeText(row.tenBacSi || "")}</td>
          <td class="p-2">${safeText(row.tenKhoa || "")}</td>
          <td class="p-2">${safeText(row.idHoSoYTe || "")}</td>
          <td class="p-2 text-center">
            <button class="editBtn text-blue-600" data-id="${row.idLS}">✏️</button>
            <button class="delBtn text-red-600" data-id="${row.idLS}">🗑️</button>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("❌ loadData:", err);
      tableBody.innerHTML = `<tr><td colspan="8" class="p-4 text-red-600">Lỗi tải dữ liệu lịch sử khám</td></tr>`;
    }
  }

  tableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".delBtn");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm("Bạn có chắc muốn xóa bản ghi này?")) return;
    try {
      const res = await AppAuth.fetch(`${apiUrl}/${id}`, { method: "DELETE" });
      const result = await res.json();
      alert(result.message || "Đã xóa");
      await loadData();
    } catch (err) {
      console.error("❌ Xóa lỗi:", err);
      alert("Xảy ra lỗi khi xóa");
    }
  });

  tableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".editBtn");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      let record = null;
      try {
        const oneRes = await AppAuth.fetch(`${apiUrl}/${id}`);  
        if (oneRes.ok) record = await oneRes.json();
      } catch (_) {
        const allRes = await AppAuth.fetch(apiUrl);
        const all = await allRes.json();
        record = all.find(r => String(r.idLS) === String(id));
      }
      if (!record) return alert("Không tìm thấy bản ghi để sửa");

      document.getElementById("lichsuTitle").innerText = "Sửa lịch sử khám";
      document.getElementById("idLS").value = record.idLS;
      const ngayVal = safeText(record.ngayKham).includes("T") ? record.ngayKham.split("T")[0] : record.ngayKham;
      document.getElementById("ngayKhamLS").value = ngayVal || "";
      document.getElementById("ketLuanLS").value = record.ketLuan || "";
      document.getElementById("chiTietLS").value = record.chiTiet || "";

      const defaultKhoaId = record.idKhoa || null;
      const defaultBacSiId = record.idBacSi || null;
      const defaultHS = record.idHoSoYTe || null;

      await loadOptions(defaultKhoaId, defaultBacSiId, defaultHS);

      if (!defaultBacSiId && record.tenBacSi) {
        const opt = Array.from(idBacSiEl.options).find(o => o.textContent.trim() === record.tenBacSi.trim());
        if (opt) idBacSiEl.value = opt.value;
      }
      if (!defaultKhoaId && record.tenKhoa) {
        const opt2 = Array.from(idKhoaEl.options).find(o => o.textContent.trim() === record.tenKhoa.trim());
        if (opt2) {
          idKhoaEl.value = opt2.value;
          await loadBacSiTheoKhoa(idKhoaEl.value, defaultBacSiId);
        }
      }

      modal.classList.remove("hidden");
    } catch (err) {
      console.error("❌ Sửa lỗi:", err);
      alert("Lỗi khi mở form sửa");
    }
  });

  openBtn.addEventListener("click", async () => {
    form.reset();
    document.getElementById("lichsuTitle").innerText = "Thêm lịch sử khám";
    document.getElementById("idLS").value = "";
    await loadOptions();  
    modal.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("idLS").value;
    const payload = {
      ngayKham: document.getElementById("ngayKhamLS").value,
      ketLuan: document.getElementById("ketLuanLS").value.trim(),
      chiTiet: document.getElementById("chiTietLS").value.trim(),
      idBacSi: document.getElementById("idBacSiLS").value,
      idKhoa: document.getElementById("idKhoaLS").value,
      idHoSoYTe: document.getElementById("idHoSoYTeLS").value
    };

    if (!payload.ngayKham || !payload.ketLuan || !payload.idBacSi || !payload.idKhoa || !payload.idHoSoYTe) {
      return alert("Vui lòng nhập đầy đủ thông tin bắt buộc (ngày, kết luận, bác sĩ, khoa, mã hồ sơ).");
    }

    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `${apiUrl}/${id}` : apiUrl;
      const res = await AppAuth.fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      alert(result.message || (id ? "Đã cập nhật" : "Đã thêm"));
      modal.classList.add("hidden");
      await loadData();
    } catch (err) {
      console.error("❌ Lưu lỗi:", err);
      alert("Lỗi khi lưu dữ liệu");
    }
  });

  idKhoaEl.addEventListener("change", (e) => {
    const v = e.target.value;
    loadBacSiTheoKhoa(v);
  });

  loadData();
});

})();

// Thống kê tổng quan.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
    console.log("✅ Dashboard JS loaded");
    
    const dashboardBtn = document.querySelector('button[data-page="dashboard"]');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            loadDashboardData();
            loadRecentActivities();
        });
    }
    
    const dashboardSection = document.querySelector('section[data-page="dashboard"]');
    if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
        loadDashboardData();
        loadRecentActivities();
    }
    
    setInterval(loadRecentActivities, 30000);
});

async function loadDashboardData() {
    console.log("📊 Đang tải dữ liệu dashboard...");
    
    try {
        const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/dashboard"));
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("✅ Dữ liệu nhận được:", data);

        const totalRecords = document.getElementById("totalRecords");
        const totalDoctors = document.getElementById("totalDoctors");
        const todayAppointments = document.getElementById("todayAppointments");
        const newContacts = document.getElementById("newContacts");

        if (totalRecords) totalRecords.innerText = data.totalRecords || 0;
        if (totalDoctors) totalDoctors.innerText = data.totalDoctors || 0;
        if (todayAppointments) todayAppointments.innerText = data.todayAppointments || 0;
        if (newContacts) newContacts.innerText = data.newContacts || 0;

        loadDailyAppointmentsChart();

    } catch (error) {
        console.error("❌ Lỗi load dashboard:", error);
        alert("Không thể tải dữ liệu thống kê. Vui lòng kiểm tra console.");
    }
}

async function loadRecentActivities() {
    console.log("🕒 Đang tải hoạt động gần đây...");
    
    try {
        const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/hoatdong"));
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("✅ Hoạt động nhận được:", data);

        const container = document.getElementById("recentActivities");
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center py-4">Chưa có hoạt động nào</div>';
            return;
        }

        container.innerHTML = data.map(item => {
            const iconMap = {
                "THÊM BÁC SĨ": "👨‍⚕️",
                "XÓA BÁC SĨ": "🗑️",
                "THÊM LỊCH KHÁM": "📅",
                "CẬP NHẬT LỊCH": "✏️",
                "THÊM KHOA": "🏥",
                "XÓA KHOA": "🗑️",
                "THÊM HỒ SƠ": "📋",
                "XÓA HỒ SƠ": "🗑️"
            };
            
            const icon = iconMap[item.loaiHoatDong] || "📌";
            
            return `
                <div class="flex gap-2 items-start py-2 border-b border-slate-100 last:border-0">
                    <span class="text-lg">${icon}</span>
                    <div class="flex-1">
                        <div class="text-slate-700 text-xs">${escapeHtml(item.moTa)}</div>
                        <div class="text-slate-400 text-xs mt-1">${item.thoiGian}</div>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("❌ Lỗi load hoạt động:", error);
        const container = document.getElementById("recentActivities");
        if (container) {
            container.innerHTML = '<div class="text-red-500 text-center py-4">Lỗi tải hoạt động</div>';
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


async function loadDailyAppointmentsChart() {
    console.log("📈 Đang tải dữ liệu biểu đồ...");
    
    try {
        const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/dashboard/daily-appointments"));
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        
        const labels = data.map(item => {
            const [year, month, day] = item.date.split('-');
            return `${day}/${month}`;
        });
        const counts = data.map(item => item.count);
        
        renderChart(labels, counts);

    } catch (error) {
        console.error("❌ Lỗi load biểu đồ:", error);
        const chartContainer = document.getElementById("chartPlaceholder");
        if (chartContainer) {
            chartContainer.innerHTML = '<div class="text-red-500 text-center py-4">Không thể tải biểu đồ lịch khám. (Kiểm tra Chart.js đã được nhúng chưa)</div>';
        }
    }
}

function renderChart(labels, data) {
    const chartArea = document.getElementById('chartCanvas');
    if (!chartArea) return; 

    if (window.appointmentChart instanceof Chart) {
        window.appointmentChart.destroy();
    }
    
    window.appointmentChart = new Chart(chartArea, {
        type: 'bar',  
        data: {
            labels: labels,
            datasets: [{
                label: 'Số Lịch Khám',
                data: data,
                backgroundColor: 'rgba(56, 189, 248, 0.7)',  
                borderColor: 'rgba(56, 189, 248, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Số Lượt'
                    },
                    ticks: {
                        stepSize: 1,
                        precision: 0  
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Ngày'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Lịch Khám 30 Ngày Gần Nhất'
                }
            }
        }
    });
}
})();

// Quản lý chuyên khoa.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
	const API = (AppAuth.apiOrigin + "/api/khoa");
	const tableBody = document.querySelector("#deptTable tbody");
	const openAddBtn = document.getElementById("openAddDept");
	const refreshBtn = document.getElementById("refreshDept");
	const searchInput = document.getElementById("searchDept");

	let allDepartments = [];

	const modal = document.getElementById("deptModal");
	const form = document.getElementById("deptForm");
	const idInput = document.getElementById("idKhoa");
	const nameInput = document.getElementById("tenKhoa");
	const title = document.getElementById("deptModalTitle");
	const closeBtn = document.getElementById("closeDeptModal");
	const cancelBtn = document.getElementById("cancelDept");

	function escapeHtml(str) {
		return str
			? str.replace(
					/[&<>"']/g,
					(m) =>
						({
							"&": "&amp;",
							"<": "&lt;",
							">": "&gt;",
							'"': "&quot;",
							"'": "&#39;",
						})[m],
				)
			: "";
	}

	function normalizeText(value) {
		return String(value ?? "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/đ/g, "d")
			.replace(/Đ/g, "D")
			.toLowerCase()
			.trim();
	}

	function renderDepartments(departments) {
		tableBody.innerHTML = "";

		if (!departments.length) {
			const hasKeyword = searchInput && searchInput.value.trim();
			tableBody.innerHTML = hasKeyword
				? `<tr><td colspan="3" class="p-2 text-gray-500">Không tìm thấy khoa phù hợp</td></tr>`
				: `<tr><td colspan="3" class="p-2 text-gray-500">Chưa có khoa nào</td></tr>`;
			return;
		}

		departments.forEach((khoa) => {
			const tr = document.createElement("tr");
			tr.classList.add("border-t");
			tr.innerHTML = `
        <td class="p-2">${escapeHtml(String(khoa.idKhoa))}</td>
        <td class="p-2">${escapeHtml(khoa.tenKhoa)}</td>
        <td class="p-2 text-center">
          <button class="editBtn text-blue-600 mr-2" data-id="${khoa.idKhoa}" data-name="${encodeURIComponent(khoa.tenKhoa)}">✏️</button>
          <button class="delBtn text-red-600" data-id="${khoa.idKhoa}">🗑️</button>
        </td>`;
			tableBody.appendChild(tr);
		});
	}

	function applySearch() {
		if (!searchInput) {
			renderDepartments(allDepartments);
			return;
		}

		const keyword = normalizeText(searchInput.value);
		if (!keyword) {
			renderDepartments(allDepartments);
			return;
		}

		const filtered = allDepartments.filter((khoa) => {
			const id = normalizeText(khoa.idKhoa);
			const name = normalizeText(khoa.tenKhoa);
			return id.includes(keyword) || name.includes(keyword);
		});

		renderDepartments(filtered);
	}

	async function loadData() {
		tableBody.innerHTML = `<tr><td colspan="3" class="p-2 text-gray-500">Đang tải...</td></tr>`;
		try {
			const res = await AppAuth.fetch(API);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();
			if (!Array.isArray(data)) throw new Error("Dữ liệu khoa không hợp lệ");

			allDepartments = data;
			applySearch();
		} catch (err) {
			console.error("❌ Lỗi tải danh sách khoa:", err);
			allDepartments = [];
			tableBody.innerHTML = `<tr><td colspan="3" class="text-red-600 p-2">Lỗi tải dữ liệu</td></tr>`;
		}
	}

	openAddBtn.addEventListener("click", () => {
		form.reset();
		idInput.value = "";
		title.textContent = "Thêm khoa";
		modal.classList.remove("hidden");
	});

	[closeBtn, cancelBtn].forEach((btn) =>
		btn.addEventListener("click", () => modal.classList.add("hidden")),
	);

	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const id = idInput.value;
		const tenKhoa = nameInput.value.trim();
		if (!tenKhoa) return alert("Tên khoa không được để trống!");

		try {
			const method = id ? "PUT" : "POST";
			const url = id ? `${API}/${id}` : API;
			const res = await AppAuth.fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tenKhoa }),
			});
			const data = await res.json();
			alert(data.message || (id ? "Cập nhật thành công" : "Thêm thành công"));
			modal.classList.add("hidden");
			loadData();
		} catch (err) {
			console.error("❌ Lỗi lưu khoa:", err);
			alert("Lỗi khi lưu khoa");
		}
	});

	tableBody.addEventListener("click", (e) => {
		const editBtn = e.target.closest(".editBtn");
		if (!editBtn) return;
		idInput.value = editBtn.dataset.id;
		nameInput.value = decodeURIComponent(editBtn.dataset.name);
		title.textContent = "Sửa khoa";
		modal.classList.remove("hidden");
	});

	tableBody.addEventListener("click", async (e) => {
		const delBtn = e.target.closest(".delBtn");
		if (!delBtn) return;
		const id = delBtn.dataset.id;
		if (!confirm("Bạn có chắc muốn xóa khoa này không?")) return;

		try {
			const res = await AppAuth.fetch(`${API}/${id}`, { method: "DELETE" });
			const result = await res.json();

			if (result.needConfirm && Array.isArray(result.doctors)) {
				let msg = `${result.message}\n\nChi tiết:\n`;
				result.doctors.forEach((b) => {
					msg += `- ${b.hoTenBacSi} (Lịch khám: ${b.lichCount}, Lịch sử: ${b.lichsuCount})\n`;
				});
				msg += "\nChọn OK để xóa toàn bộ, Cancel để hủy.";
				if (confirm(msg)) {
					const forceRes = await AppAuth.fetch(`${API}/${id}?force=true`, {
						method: "DELETE",
					});
					const j2 = await forceRes.json();
					alert(j2.message || "Đã xóa khoa và toàn bộ dữ liệu liên quan!");
				} else {
					alert("❎ Đã hủy thao tác xóa.");
				}
			} else {
				alert(result.message || "🗑️ Đã xóa khoa thành công!");
			}

			loadData();
		} catch (err) {
			console.error("❌ Lỗi xóa khoa:", err);
			alert("Lỗi khi xóa khoa");
		}
	});

	if (searchInput) {
		searchInput.addEventListener("input", applySearch);
	}

	refreshBtn.addEventListener("click", () => {
		if (searchInput) searchInput.value = "";
		loadData();
	});

	loadData();
});

})();
