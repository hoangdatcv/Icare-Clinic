// Gửi yêu cầu khôi phục mật khẩu.
(async () => {
  await AppAuth.ready;
  const form = document.getElementById('forgotPasswordForm');
  const message = document.getElementById('forgotMessage');
  document.getElementById('forgotLoginLink').href = AppAuth.loginURL;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true; message.hidden = true;
    try {
      const response = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('forgotEmail').value.trim() }),
      });
      const result = await response.json();
      message.dataset.error = String(!response.ok); message.textContent = result.message;
    } catch { message.dataset.error = 'true'; message.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.'; }
    finally { message.hidden = false; button.disabled = false; }
  });
})();
