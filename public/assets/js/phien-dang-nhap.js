// Phiên đăng nhập và gọi API.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const currentScript = document.currentScript;
  const base = new URL('../../', currentScript.src);
  const apiOrigin = window.location.port === '5500'
    ? `${window.location.protocol}//${window.location.hostname}:3000` : window.location.origin;
  const loginURL = new URL('khach-hang/dang-nhap.html', base).href;
  const customerURL = new URL('khach-hang/trang-chu.html', base).href;
  const adminURL = new URL('quan-tri/index.html', base).href;
  const role = currentScript.dataset.role || '';
  const storageKeys = ['loggedIn', 'userId', 'userName', 'adminId'];
  const clearLocal = () => storageKeys.forEach(key => localStorage.removeItem(key));
  let csrfToken;
  let csrfPromise;
  let identity = { authenticated: false };

  async function loadCSRF() {
    if (!csrfPromise) csrfPromise = nativeFetch(`${apiOrigin}/api/csrf-token`, { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Không thể khởi tạo phiên an toàn.');
        csrfToken = (await response.json()).csrfToken;
        return csrfToken;
      }).finally(() => { csrfPromise = null; });
    return csrfPromise;
  }
  async function apiFetch(input, init = {}) {
    let url = new URL(input, window.location.href);
    if (url.port === '3000' && ['localhost', '127.0.0.1'].includes(url.hostname)) url = new URL(url.pathname + url.search, apiOrigin);
    if (url.origin !== apiOrigin) throw new Error('API origin không hợp lệ.');
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('X-CSRF-Token', csrfToken || await loadCSRF());
    }
    const response = await nativeFetch(url, { ...init, method, headers, credentials: 'include', cache: 'no-store' });
    if (response.ok && url.pathname === '/login') {
      const data = await response.clone().json();
      csrfToken = data.csrfToken;
    }
    if (response.status === 401 && !['/login', '/api/session'].includes(url.pathname)) {
      clearLocal();
      if (role) window.location.replace(loginURL);
    }
    return response;
  }
  const ready = (async () => {
    try {
      const response = await apiFetch(`${apiOrigin}/api/session`);
      if (!response.ok) throw new Error('Không thể kiểm tra phiên.');
      identity = await response.json();
      clearLocal();
      if (identity.authenticated) {
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem(identity.role === 'admin' ? 'adminId' : 'userId', identity.id);
        if (identity.role === 'customer') {
          const profile = await apiFetch(`${apiOrigin}/api/khachhang/${identity.id}`);
          if (profile.ok) localStorage.setItem('userName', (await profile.json()).hoTen || '');
        }
      }
      if (role && (!identity.authenticated || identity.role !== role)) {
        window.location.replace(identity.authenticated ? (identity.role === 'admin' ? adminURL : customerURL) : loginURL);
        return false;
      }
      return true;
    } catch {
      clearLocal();
      if (role) window.location.replace(loginURL);
      return !role;
    }
  })();
  const onReady = callback => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else queueMicrotask(callback);
  };
  async function logout() {
    try {
      const response = await apiFetch(`${apiOrigin}/logout`, { method: 'POST' });
      if (!response.ok && response.status !== 401) throw new Error('Đăng xuất thất bại.');
      clearLocal();
      window.location.replace(loginURL);
    } catch { alert('Không thể đăng xuất khỏi server. Vui lòng thử lại.'); }
  }
  window.AppAuth = { ready, fetch: apiFetch, onReady, logout, clearLocal, loginURL, apiOrigin,
    escapeHTML: value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]) };
})();
