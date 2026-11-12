// Xác minh email.
(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  await AppAuth.ready;
  const verifyForm = document.getElementById('verifyEmailForm');
  const resendForm = document.getElementById('resendEmailForm');
  const message = document.getElementById('verifyEmailMessage');
  document.getElementById('verifyLoginLink').href = AppAuth.loginURL;
  verifyForm.hidden = !token; resendForm.hidden = Boolean(token);
  async function send(form, endpoint, body) {
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const response = await AppAuth.fetch(`${AppAuth.apiOrigin}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      message.textContent = result.message; message.dataset.error = String(!response.ok);
      return response.ok;
    } catch { message.textContent = 'Không thể kết nối máy chủ. Vui lòng thử lại.'; message.dataset.error = 'true'; return false; }
    finally { message.hidden = false; button.disabled = false; }
  }
  verifyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const ok = await send(verifyForm, '/api/email-verification/confirm', { token });
    verifyForm.hidden = true; resendForm.hidden = ok;
  });
  resendForm.addEventListener('submit', async event => {
    event.preventDefault();
    await send(resendForm, '/api/email-verification/resend', { email: document.getElementById('resendEmail').value.trim() });
  });
})();
