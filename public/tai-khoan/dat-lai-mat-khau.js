// Đặt lại mật khẩu.
(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  await AppAuth.ready;
  const form = document.getElementById('resetForm');
  const message = document.getElementById('message');
  document.getElementById('loginLink').href = AppAuth.loginURL;
  if (!token) { form.hidden = true; message.hidden = false; message.textContent = 'Thiếu liên kết đặt lại mật khẩu. Hãy chọn “Yêu cầu liên kết mới”.'; }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    message.hidden = false;
    if (newPassword !== confirmPassword) { message.textContent = 'Mật khẩu xác nhận không khớp.'; return; }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const response = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/reset-password`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword, confirmPassword }) });
      const result = await response.json();
      message.textContent = result.message;
      message.dataset.error = String(!response.ok);
      if (response.ok) { form.reset(); form.hidden = true; AppAuth.clearLocal(); }
    } catch { message.textContent = 'Không thể kết nối server. Vui lòng thử lại.'; }
    finally { button.disabled = false; }
  });
})();
