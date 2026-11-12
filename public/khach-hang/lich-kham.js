// Xem và hủy lịch khám.
(async () => {
if (!(await AppAuth.ready)) return;
function formatNgay(datetime) {
	if (!datetime) return "";
	const raw = String(datetime).split("T")[0];
	const parts = raw.split("-");
	if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;

	const d = new Date(datetime);
	const day = String(d.getDate()).padStart(2, "0");
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const year = d.getFullYear();
	return `${day}/${month}/${year}`;
}

function normalizeStatus(status) {
	return String(status || "")
		.trim()
		.toLowerCase();
}

function getStatusLabel(status) {
	const value = normalizeStatus(status);
	if (value === "chờ xác nhận" || value === "chưa xác nhận")
		return "Chưa xác nhận";
	if (value === "đã xác nhận" || value === "xác nhận") return "Đã xác nhận";
	if (value === "từ chối") return "Từ chối";
	if (value === "đã hủy") return "Đã hủy";
	return status || "-";
}

function canUserCancel(status) {
	const value = normalizeStatus(status);
	return ["chờ xác nhận", "chưa xác nhận", "đã xác nhận", "xác nhận"].includes(
		value,
	);
}

const lichList = document.getElementById("lichList");
const userId = parseInt(localStorage.getItem("userId"), 10);

async function loadLichCuaToi() {
	if (!userId) {
		lichList.innerHTML = '<tr><td colspan="6">Bạn chưa đăng nhập!</td></tr>';
		return;
	}

	try {
		const res = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/lich-user/${userId}`);
		const data = await res.json();

		if (!Array.isArray(data) || data.length === 0) {
			lichList.innerHTML =
				'<tr><td colspan="6">Bạn chưa có lịch khám nào.</td></tr>';
			return;
		}

		lichList.innerHTML = data
			.map(
				(l) => `
            <tr>
                <td>${AppAuth.escapeHTML(l.tenBacSi)}</td>
                <td>${AppAuth.escapeHTML(l.tenKhoa)}</td>
                <td>${formatNgay(l.ngayKham)}</td>
                <td>${String(l.gioKham || "").substring(0, 5)}</td>
                <td>${AppAuth.escapeHTML(getStatusLabel(l.trangThai))}</td>
                <td>${
									canUserCancel(l.trangThai)
										? `<button class="huy" onclick="huyLich(${l.idLichKham})">Hủy lịch</button>`
										: ""
								}</td>
            </tr>
        `,
			)
			.join("");
	} catch (err) {
		console.error(err);
		lichList.innerHTML = '<tr><td colspan="6">Lỗi khi tải lịch khám!</td></tr>';
	}
}

async function huyLich(idLichKham) {
	if (
		!confirm(
			"Bạn có chắc chắn muốn hủy lịch này?",
		)
	)
		return;

	try {
		const res = await AppAuth.fetch((AppAuth.apiOrigin + "/api/huy-lich"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ idLichKham }),
		});
		const data = await res.json();
		alert(
			data.message || (res.ok ? "Hủy lịch thành công!" : "Hủy lịch thất bại!"),
		);
		if (res.ok && data.success) loadLichCuaToi();
	} catch (err) {
		console.error(err);
		alert("Hủy lịch thất bại!");
	}
}

loadLichCuaToi();

window.huyLich = huyLich;

})();
