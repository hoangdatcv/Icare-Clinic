// Hồ sơ y tế và lịch sử khám.
(async () => {
if (!(await AppAuth.ready)) return;
AppAuth.onReady( () => {
  const idKH = localStorage.getItem("userId");

  if (!idKH) {
    alert("Vui lòng đăng nhập trước khi xem hồ sơ!");
    window.location.href = "trang-chu.html";
    return;
  }

  AppAuth.fetch(`${AppAuth.apiOrigin}/hosoyte/${idKH}`)
    .then(res => res.json())
    .then(data => {
      if (!data.benhnhan) {
        alert("Không tìm thấy hồ sơ!");
        return;
      }

      const b = data.benhnhan;

      document.getElementById("name").textContent = b.hoTen;
      document.getElementById("gender").textContent = b.gioiTinh;
      document.getElementById("dob").textContent = new Date(b.ngayThangNamSinh).toLocaleDateString('vi-VN');
      document.getElementById("recordId").textContent = "HS" + b.idKH;
      document.getElementById("cccd").textContent = b.CCCD || "Chưa có";
      document.getElementById("diaChi").textContent = b.diaChi || "Chưa có";

      const table = document.getElementById("recordTable");
      table.innerHTML = "";

      if (data.lichsu.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" style="text-align:center;">Chưa có lịch sử khám</td>`;
        table.appendChild(tr);
      } else {
        data.lichsu.forEach(item => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${item.ngayKham ? new Date(item.ngayKham).toLocaleDateString('vi-VN') : 'Chưa có'}</td>
            <td>${AppAuth.escapeHTML(item.bacSi || 'Chưa có')}</td>
            <td>${AppAuth.escapeHTML(item.khoa || 'Chưa có')}</td>
            <td>${AppAuth.escapeHTML(item.ketLuan || 'Chưa có')}</td>
          `;
          tr.onclick = () => showDetail(item.chiTiet || "Chưa có chi tiết");
          table.appendChild(tr);
        });
      }
    })
    .catch(err => {
      console.error(err);
      alert("Lỗi khi tải hồ sơ y tế!");
    });
});

function showDetail(text) {
  document.getElementById("detailText").textContent = text;
}

})();
