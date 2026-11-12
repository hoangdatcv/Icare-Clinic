// Quản lý email tài khoản.
(async () => {
  if (!(await AppAuth.ready)) return;
  const panel = document.querySelector('[data-account-email]');
  if (!panel) return;
  const form = panel.querySelector('[data-email-form]');
  const message = panel.querySelector('[data-email-message]');
  let loaded = false;
  function showMessage(text, error = false) { message.hidden = false; message.textContent = text; message.dataset.error = String(error); }
  async function loadEmail() {
    try {
      const response = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/account/email`);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) { form.hidden = true; showMessage('Vui lòng đăng nhập để quản lý email.', true); }
        else showMessage(data.message, true);
        return;
      }
      form.hidden = false;
      panel.querySelector('[data-email-current]').textContent = data.email ? `Email đã đăng ký: ${data.email}` : 'Tài khoản chưa có email.';
      panel.querySelector('[data-email-status]').textContent = data.emailVerifiedAt ? 'Đã xác minh — có thể dùng để khôi phục mật khẩu.' : 'Chưa xác minh — hãy thêm hoặc xác minh email để dùng chức năng quên mật khẩu.';
      const pending = panel.querySelector('[data-email-pending]');
      pending.hidden = !data.pendingEmail;
      pending.textContent = data.pendingEmail ? `Đang chờ xác minh: ${data.pendingEmail}. Vui lòng kiểm tra hộp thư và thư rác.` : '';
      if (!loaded) form.elements.email.value = data.pendingEmail || data.email || '';
      loaded = true;
    } catch { showMessage('Không thể tải email tài khoản. Vui lòng thử lại.', true); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const response = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/account/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.elements.email.value.trim(), currentPassword: form.elements.currentPassword.value }) });
      const data = await response.json();
      showMessage(data.message, !response.ok);
      form.elements.currentPassword.value = '';
      if (response.ok) await loadEmail();
    } catch { showMessage('Không thể kết nối máy chủ. Vui lòng thử lại.', true); }
    finally { button.disabled = false; }
  });
  const backLink = document.getElementById('emailBackLink');
  if (backLink) {
    const session = await AppAuth.fetch(`${AppAuth.apiOrigin}/api/session`).then(response => response.json());
    backLink.href = session.authenticated ? (session.role === 'admin' ? '/quan-tri/index.html' : '/khach-hang/ho-so.html') : AppAuth.loginURL;
  }
  await loadEmail();
  window.addEventListener('focus', loadEmail);
})();
