// Đặt lịch khám.
(async () => {
if (!(await AppAuth.ready)) return;
const khoaInput = document.getElementById("khoaInput");
const dropdown = document.getElementById("dropdownKhoa");
const doctorsList = document.getElementById("doctorsList");
const popup = document.getElementById("confirmPopup");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");
const confirmSummary = document.getElementById("confirmSummary");

const khoaNameById = new Map();

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

function escapeHtml(text) {
	if (!text) return "";
	return String(text).replace(
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

function getNext7Days() {
	const daysOfWeek = [
		"Chủ Nhật",
		"Thứ 2",
		"Thứ 3",
		"Thứ 4",
		"Thứ 5",
		"Thứ 6",
		"Thứ 7",
	];
	const today = new Date();
	const dates = [];

	for (let i = 0; i < 7; i++) {
		const d = new Date(today);
		d.setDate(today.getDate() + i);

		const weekday = daysOfWeek[d.getDay()];
		const displayDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
		const apiDate = `${displayDate}/${d.getFullYear()}`;

		dates.push({ weekday, displayDate, apiDate });
	}

	return dates;
}

async function loadKhoa() {
	try {
		const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/khoa"));
		if (!res.ok) throw new Error("Không tải được danh sách khoa");

		const data = await res.json();
		dropdown.innerHTML = "";
		khoaNameById.clear();

		data.forEach((khoa) => {
			khoaNameById.set(String(khoa.idKhoa), khoa.tenKhoa);

			const item = document.createElement("div");
			item.className = "dropdown-item";
			item.tabIndex = 0;
			item.textContent = khoa.tenKhoa;
			item.dataset.id = khoa.idKhoa;

			item.addEventListener("click", () => {
				khoaInput.value = khoa.tenKhoa;
				khoaInput.dataset.id = String(khoa.idKhoa);
				dropdown.style.display = "none";
				khoaInput.setAttribute("aria-expanded", "false");
				loadBacSi(khoa.idKhoa);
			});

			dropdown.appendChild(item);
		});
	} catch (err) {
		console.error(err);
	}
}

khoaInput.addEventListener("click", (e) => {
	e.stopPropagation();
	const willOpen = dropdown.style.display !== "block";
	dropdown.style.display = willOpen ? "block" : "none";
	khoaInput.setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("click", (e) => {
	if (!e.target.closest(".input-box")) {
		dropdown.style.display = "none";
		khoaInput.setAttribute("aria-expanded", "false");
	}
});

async function loadBacSi(idKhoa = null) {
	doctorsList.innerHTML = "<p>Đang tải danh sách bác sĩ...</p>";

	try {
		const url = idKhoa
			? `${AppAuth.apiOrigin}/api/bacsi/${idKhoa}`
			: (AppAuth.apiOrigin + "/api/bacsi-all");

		const res = await AppAuth.fetch(url);
		if (!res.ok) throw new Error("Không tải được danh sách bác sĩ");

		const data = await res.json();
		renderDoctors(data);
	} catch (err) {
		console.error(err);
		doctorsList.innerHTML = "<p>Không tải được danh sách bác sĩ</p>";
	}
}

function renderDoctors(bacSiArray) {
	if (!Array.isArray(bacSiArray) || bacSiArray.length === 0) {
		doctorsList.innerHTML = "<p>Chưa có bác sĩ</p>";
		return;
	}

	doctorsList.innerHTML = bacSiArray.map(createDoctorCardHTML).join("");
	attachInteractivity();
}

function createDoctorCardHTML(bs) {
	const idKhoa = bs.idKhoa == null ? "" : String(bs.idKhoa);
	const tenKhoa = bs.tenKhoa || khoaNameById.get(idKhoa) || "";

	const days = getNext7Days()
		.map(
			(d, idx) =>
				`<div class="day-card ${idx === 0 ? "selected" : ""}"
              data-weekday="${escapeHtml(d.weekday)}"
              data-date="${escapeHtml(d.apiDate)}"
              data-display-date="${escapeHtml(d.displayDate)}">
            <div class="weekday">${escapeHtml(d.weekday)}</div>
            <div class="date">${escapeHtml(d.displayDate)}</div>
        </div>`,
		)
		.join("");

	const timeBtnsHTML = BOOKING_TIME_SLOTS.map(
		(t) => `
				<button type="button" class="time-btn" data-time="${t}" aria-label="Khung giờ ${t}">
					<span class="time-value">${t}</span>
					<span class="time-note">Đã có lịch khám</span>
				</button>`,
	).join("");

	return `<article class="doctor-card"
                    data-id="${escapeHtml(bs.idBacSi)}"
                    data-name="${escapeHtml(bs.hoTenBacSi)}"
                    data-khoaid="${escapeHtml(idKhoa)}"
                    data-tenkhoa="${escapeHtml(tenKhoa)}">
        <div class="doctor-header">
            <div class="avatar"><img src="../assets/images/doctor.png" alt="avatar"></div>
            <div class="meta">
                <div class="name">${escapeHtml(bs.hoTenBacSi)}</div>
                <div class="spec">🩺 ${escapeHtml(bs.hocVi || "")}${tenKhoa ? ` · ${escapeHtml(tenKhoa)}` : ""}</div>
            </div>
            <button type="button" class="arrow-btn" aria-label="Xem lịch bác sĩ">&#9660;</button>
        </div>
        <div class="details" aria-hidden="true">
            <div class="details-inner">
                <div class="days">${days}</div>
                <div class="clinic">
                    <div class="clinic-icon">🏥</div>
                    <div class="clinic-info">
                        <div class="title">Phòng khám - ${escapeHtml(bs.hoTenBacSi)}</div>
                        <div class="times">${timeBtnsHTML}</div>
                        <div class="time-availability-note">
                            <span class="legend-dot available-dot"></span> Còn trống
                            <span class="legend-dot booked-dot"></span> Đã có lịch khám
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </article>`;
}

function attachInteractivity() {
	document.querySelectorAll(".arrow-btn").forEach((btn) => {
		btn.onclick = async (e) => {
			e.stopPropagation();
			const card = btn.closest(".doctor-card");
			const details = card.querySelector(".details");
			const isOpen = btn.classList.contains("open");

			document.querySelectorAll(".doctor-card .details").forEach((d) => {
				d.style.maxHeight = null;
				d.setAttribute("aria-hidden", "true");
			});
			document
				.querySelectorAll(".arrow-btn")
				.forEach((a) => a.classList.remove("open"));

			if (!isOpen) {
				btn.classList.add("open");
				details.style.maxHeight = details.scrollHeight + "px";
				details.setAttribute("aria-hidden", "false");

				const selectedDay = card.querySelector(".day-card.selected");
				if (selectedDay) await updateTimeAvailability(selectedDay);
			}
		};
	});

	document.querySelectorAll(".day-card").forEach((day) => {
		day.onclick = async () => {
			const parent = day.parentNode;
			parent
				.querySelectorAll(".day-card")
				.forEach((d) => d.classList.remove("selected"));
			day.classList.add("selected");
			await updateTimeAvailability(day);
		};
	});

	document.querySelectorAll(".time-btn").forEach((btn) => {
		btn.onclick = () => {
			const card = btn.closest(".doctor-card");
			if (btn.disabled) return;

			card
				.querySelectorAll(".time-btn")
				.forEach((t) => t.classList.remove("time-selected"));
			btn.classList.add("time-selected");

			const name = document.getElementById("fullname").value.trim();
			const reason = document.getElementById("reason").value.trim();
			const selectedDay = card.querySelector(".day-card.selected");
			const doctorKhoaId = card.dataset.khoaid;
			const doctorKhoaName =
				card.dataset.tenkhoa || khoaNameById.get(doctorKhoaId) || "";

			if (!name || !reason || !selectedDay || !doctorKhoaId) {
				alert(
					"Vui lòng nhập đầy đủ họ tên, lý do khám và chọn bác sĩ phù hợp.",
				);
				return;
			}

			const apiDate = selectedDay.dataset.date;
			const displayDate = selectedDay.dataset.displayDate || apiDate;
			const bacSiName = card.dataset.name;
			const bacSiId = card.dataset.id;

			confirmSummary.innerHTML = `
                <strong>Người bệnh:</strong> ${escapeHtml(name)}<br>
                <strong>Khoa:</strong> ${escapeHtml(doctorKhoaName)}<br>
                <strong>Bác sĩ:</strong> ${escapeHtml(bacSiName)}<br>
                <strong>Ngày:</strong> ${escapeHtml(displayDate)}<br>
                <strong>Giờ:</strong> ${escapeHtml(btn.dataset.time)}<br>
                <strong>Lý do:</strong> ${escapeHtml(reason)}
            `;

			popup.dataset.selHoTen = name;
			popup.dataset.selLyDo = reason;
			popup.dataset.selIdBacSi = bacSiId;
			popup.dataset.selIdKhoa = doctorKhoaId;
			popup.dataset.selTenKhoa = doctorKhoaName;
			popup.dataset.selNgay = apiDate;
			popup.dataset.selGio = btn.dataset.time;
			popup.style.display = "flex";
			popup.setAttribute("aria-hidden", "false");
		};
	});
}

async function updateTimeAvailability(dayCard) {
	const card = dayCard.closest(".doctor-card");
	const bacSiId = card.dataset.id;
	const date = dayCard.dataset.date;
	const times = card.querySelectorAll(".time-btn");

	try {
		const res = await AppAuth.fetch(
			`${AppAuth.apiOrigin}/api/lich-da-dat?bacsi=${encodeURIComponent(bacSiId)}&ngay=${encodeURIComponent(date)}`,
		);
		if (!res.ok) throw new Error("Không kiểm tra được giờ đã đặt");

		const bookedTimes = await res.json();

		times.forEach((t) => {
			const timeValue = t.dataset.time;
			const isBooked = bookedTimes.includes(timeValue);
			t.disabled = isBooked;
			t.classList.toggle("disabled-time", isBooked);
			t.setAttribute(
				"aria-label",
				isBooked
					? `${timeValue} - Đã có lịch khám`
					: `${timeValue} - Còn trống`,
			);
			if (isBooked) t.classList.remove("time-selected");
		});
	} catch (err) {
		console.error(err);
	}
}

confirmNo.onclick = () => {
	popup.style.display = "none";
	popup.setAttribute("aria-hidden", "true");
};

confirmYes.onclick = async () => {
	if (confirmYes.disabled) return;

	const body = {
		hoTen: popup.dataset.selHoTen,
		lyDo: popup.dataset.selLyDo,
		idKH: parseInt(localStorage.getItem("userId"), 10) || null,
		idBacSi: popup.dataset.selIdBacSi,
		idKhoa: popup.dataset.selIdKhoa,
		ngayKham: popup.dataset.selNgay,
		gioKham: popup.dataset.selGio,
	};

	confirmYes.disabled = true;

	try {
		const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/dat-lich"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		const data = await res.json();

		if (!res.ok) {
			alert(data.message || "Đặt lịch thất bại!");

			if (res.status === 409) {
				const card = document.querySelector(
					`.doctor-card[data-id="${CSS.escape(String(body.idBacSi))}"]`,
				);
				const dayCard = card
					? Array.from(card.querySelectorAll(".day-card")).find(
							(d) => d.dataset.date === body.ngayKham,
						)
					: null;
				if (dayCard) await updateTimeAvailability(dayCard);
			}
			return;
		}

		alert(data.message || "Đặt lịch khám thành công!");
		popup.style.display = "none";
		popup.setAttribute("aria-hidden", "true");

		const card = document.querySelector(
			`.doctor-card[data-id="${CSS.escape(String(body.idBacSi))}"]`,
		);
		const dayCard = card
			? Array.from(card.querySelectorAll(".day-card")).find(
					(d) => d.dataset.date === body.ngayKham,
				)
			: null;
		if (dayCard) await updateTimeAvailability(dayCard);
	} catch (err) {
		console.error(err);
		alert("Đặt lịch thất bại! Vui lòng thử lại.");
	} finally {
		confirmYes.disabled = false;
	}
};

loadKhoa();
loadBacSi();

})();
