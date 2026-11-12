// Backend Icare Clinic.
const express = require('express');
const path = require('node:path');
const mysql = require('mysql2');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const argon2 = require('argon2');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const nodemailer = require('nodemailer');
const isEmail = require('validator/lib/isEmail');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// Cấu hình máy chủ.

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET']) {
    if (!env[key]) throw new Error(`Thiếu cấu hình ${key} trong .env.`);
  }
  if (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-')) throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự ngẫu nhiên.');
  if (production && env.DB_USER.toLowerCase() === 'root') throw new Error('Production không được dùng MySQL root.');
  const port = Number(env.PORT || 3000);
  const origins = (env.ALLOWED_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`)
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(s => {
    try { const url = new URL(s); return url.origin !== s || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:'); }
    catch { return true; }
  })) throw new Error('ALLOWED_ORIGINS phải là các origin cụ thể, phân cách bằng dấu phẩy.');
  const publicBaseURL = (env.APP_BASE_URL || origins[0]).replace(/\/$/, '');
  if (!origins.includes(publicBaseURL)) throw new Error('APP_BASE_URL phải là origin tin cậy trong ALLOWED_ORIGINS.');
  const smtpPort = Number(env.SMTP_PORT || 465);
  if (![465, 587].includes(smtpPort)) throw new Error('SMTP_PORT phải là 465 hoặc 587.');
  return {
    production, port, origins, publicBaseURL, secret: env.SESSION_SECRET,
    smtp: { host: env.SMTP_HOST || 'smtp.gmail.com', port: smtpPort, secure: smtpPort === 465,
      user: env.SMTP_USER || '', password: (env.SMTP_APP_PASSWORD || '').replace(/\s/g, '') },
    trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
    db: { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER,
      password: env.DB_PASSWORD || '', database: env.DB_NAME, dateStrings: true,
      connectionLimit: 10, connectTimeout: 5000, multipleStatements: false },
  };
}

// Băm và kiểm tra mật khẩu.

const pbkdf2 = promisify(crypto.pbkdf2);

const ARGON_OPTIONS = Object.freeze({
  type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
});

function passwordPolicy(password) {
  if (typeof password !== 'string' || [...password].length < 12 ||
      [...password].length > 128 || Buffer.byteLength(password, 'utf8') > 512 ||
      !/\p{L}/u.test(password) || !/[^\p{L}\s]/u.test(password)) {
    return 'Mật khẩu cần 12–128 ký tự, có chữ và ít nhất một số hoặc ký tự đặc biệt.';
  }
  return null;
}

function validPasswordInput(password) {
  return typeof password === 'string' && password.length > 0 &&
    Buffer.byteLength(password, 'utf8') <= 512;
}

function passwordFormat(stored) {
  if (typeof stored !== 'string') return 'unsupported';
  const argon = /^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d{1,2})\$[A-Za-z0-9+/]{16,86}\$[A-Za-z0-9+/]{22,86}$/.exec(stored);
  if (argon && +argon[1] >= 8 * +argon[3] && +argon[1] <= 262144 &&
      +argon[2] >= 1 && +argon[2] <= 10 && +argon[3] >= 1 && +argon[3] <= 8) return 'argon2id';
  const legacy = /^pbkdf2\$([1-9]\d{0,6})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(stored);
  if (legacy && +legacy[1] <= 1000000 &&
      Buffer.from(legacy[2], 'base64url').toString('base64url') === legacy[2] &&
      Buffer.from(legacy[3], 'base64url').toString('base64url') === legacy[3]) return 'pbkdf2';
  return 'unsupported';
}

async function hashPassword(password) {
  return argon2.hash(password, ARGON_OPTIONS);
}

async function verifyPassword(password, stored) {
  const format = passwordFormat(stored);
  if (!validPasswordInput(password) || format === 'unsupported' || password === stored) {
    return { ok: false, needsRehash: false, format };
  }
  try {
    if (format === 'argon2id') {
      const ok = await argon2.verify(stored, password);
      return { ok, needsRehash: ok && argon2.needsRehash(stored, ARGON_OPTIONS), format };
    }
    const [, iterations, salt, key] = stored.split('$');
    const calculated = await pbkdf2(password, salt, +iterations, 32, 'sha512');
    const ok = crypto.timingSafeEqual(calculated, Buffer.from(key, 'base64url'));
    return { ok, needsRehash: ok, format };
  } catch {
    return { ok: false, needsRehash: false, format };
  }
}

// Tài khoản và truy vấn MySQL.

const ACCOUNTS = Object.freeze({
  customer: { table: 'khachhang', id: 'idKH', phone: 'sdt', password: 'matKhau' },
  admin: { table: 'quantrivien', id: 'idQTV', phone: 'sdtQTV', password: 'matKhauQTV' },
});
function credentialTag(secret, role, id, stored) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(['credential', role, String(id), stored])).digest('hex');
}
function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}
function query(db, sql, values = []) {
  return new Promise((resolve, reject) => db.query(sql, values, (err, result) => err ? reject(err) : resolve(result)));
}
async function readAccount(db, role, id) {
  const account = ACCOUNTS[role];
  if (!account || !/^[1-9]\d*$/.test(String(id))) return null;
  const rows = await query(db, `SELECT ${account.id} AS id, ${account.password} AS password FROM ${account.table} WHERE ${account.id} = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

// Lưu phiên đăng nhập.

class MySQLSessionStore extends session.Store {
  constructor(db) { super(); this.db = db; this.lastCleanup = 0; }
  get(sid, callback) {
    this.db.query('SELECT data FROM app_sessions WHERE session_id = ? AND expires_at > ?', [sid, Date.now()], (err, rows) => {
      if (err) return callback(err);
      try { callback(null, rows.length ? JSON.parse(rows[0].data) : null); }
      catch (error) { callback(error); }
    });
  }
  set(sid, data, callback = () => {}) {
    const expires = new Date(data.cookie.expires).getTime();
    this.db.query('INSERT INTO app_sessions (session_id, expires_at, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), data = VALUES(data)',
      [sid, expires, JSON.stringify(data)], callback);
    if (Date.now() - this.lastCleanup > 60000) {
      this.lastCleanup = Date.now();
      this.db.query('DELETE FROM app_sessions WHERE expires_at <= ? LIMIT 1000', [Date.now()], () => {});
    }
  }
  destroy(sid, callback = () => {}) {
    this.db.query('DELETE FROM app_sessions WHERE session_id = ?', [sid], callback);
  }
  touch(sid, data, callback = () => {}) {
    this.db.query('UPDATE app_sessions SET expires_at = ? WHERE session_id = ?',
      [new Date(data.cookie.expires).getTime(), sid], callback);
  }
}

// Email và giao dịch dữ liệu.

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && isEmail(email, { allow_utf8_local_part: false, allow_display_name: false }) ? email : null;
}
function emailAccountTag(secret, role, account) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify([
    'email-credential', role, String(account.id), account.password, account.email || null, account.emailVerifiedAt || null,
  ])).digest('hex');
}
async function readEmailAccount(db, role, id, lock = false) {
  const fields = ACCOUNTS[role];
  if (!fields || !/^[1-9]\d*$/.test(String(id))) return null;
  const rows = await query(db, `SELECT ${fields.id} AS id, ${fields.password} AS password, email, emailVerifiedAt FROM ${fields.table} WHERE ${fields.id} = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [id]);
  return rows[0] || null;
}
async function findEmailAccounts(db, email) {
  const rows = [];
  for (const [role, fields] of Object.entries(ACCOUNTS)) {
    const accounts = await query(db, `SELECT ${fields.id} AS id, ${fields.password} AS password, email, emailVerifiedAt FROM ${fields.table} WHERE LOWER(TRIM(email)) = ?`, [email]);
    accounts.forEach(account => rows.push({ ...account, role }));
  }
  return rows;
}
function accountError(code, message, status = 400, field) {
  return Object.assign(new Error(message), { code, status, field, publicMessage: message });
}
async function withEmailTransaction(db, operation) {
  const connection = await new Promise((resolve, reject) => db.getConnection((error, conn) => error ? reject(error) : resolve(conn)));
  let locked = false;
  let transaction = false;
  try {
    const result = await query(connection, 'SELECT GET_LOCK(?, 5) AS acquired', ['icare.account-email']);
    if (Number(result[0]?.acquired) !== 1) throw accountError('EMAIL_BUSY', 'Hệ thống đang bận. Vui lòng thử lại.', 503);
    locked = true;
    await connection.promise().beginTransaction();
    transaction = true;
    const value = await operation(connection);
    await connection.promise().commit();
    transaction = false;
    return value;
  } catch (error) {
    if (transaction) await connection.promise().rollback();
    throw error;
  } finally {
    if (locked) await query(connection, 'SELECT RELEASE_LOCK(?) AS released', ['icare.account-email']).catch(() => {});
    connection.release();
  }
}

// Gửi email.

function createMailer(config, transport) {
  const smtp = config.smtp || {};
  const configured = Boolean(transport || (smtp.user && smtp.password));
  const client = transport || (configured ? nodemailer.createTransport({
    host: smtp.host || 'smtp.gmail.com', port: smtp.port || 465, secure: smtp.secure !== false,
    requireTLS: smtp.secure === false, auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  }) : null);
  async function sendLink(to, purpose, link) {
    if (!configured) throw Object.assign(new Error('Email transport is not configured'), { code: 'EMAIL_NOT_CONFIGURED' });
    const verification = purpose === 'verify_email';
    const subject = verification ? 'Icare Clinic — Xác minh email tài khoản' : 'Icare Clinic — Đặt lại mật khẩu';
    const action = verification ? 'xác minh email tài khoản' : 'đặt lại mật khẩu';
    const info = await client.sendMail({
      from: { name: 'Icare Clinic', address: smtp.user || 'icare@example.test' }, to, subject,
      text: `Bạn đã yêu cầu ${action} tại Icare Clinic.\n\nMở liên kết sau để tiếp tục:\n${link}\n\nLiên kết hết hạn sau 15 phút và chỉ dùng một lần. Nếu không yêu cầu, hãy bỏ qua email này. Không chia sẻ liên kết với người khác.`,
    });
    if (info.rejected?.length) throw Object.assign(new Error('Email delivery rejected'), { code: 'EMAIL_DELIVERY_FAILED' });
  }
  return { configured, sendLink };
}

// Token xác minh và khôi phục mật khẩu.

const TOKEN_LIFETIME = 15 * 60000;
function parseToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(token) ? token.split('.') : null;
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function createEmailService({ db, config, mailer, audit = () => {} }) {
  async function ensureAvailable(connection, email, role, id) {
    const accounts = await findEmailAccounts(connection, email);
    if (accounts.some(account => account.role !== role || String(account.id) !== String(id))) {
      throw accountError('EMAIL_IN_USE', 'Email này đã được sử dụng cho tài khoản khác.', 409, 'email');
    }
  }
  async function prepareToken(connection, role, account, purpose, email) {
    const now = Date.now();
    const rows = await query(connection, 'SELECT COUNT(*) AS total, MAX(created_at) AS latest FROM account_email_tokens WHERE purpose = ? AND created_at > ? AND (email = ? OR (account_role = ? AND account_id = ?))', [purpose, now - TOKEN_LIFETIME, email, role, account.id]);
    if (Number(rows[0].total) >= 3 || (rows[0].latest && now - Number(rows[0].latest) < 60000)) {
      throw accountError('EMAIL_SEND_LIMIT', 'Vui lòng chờ ít nhất 60 giây giữa các lần gửi; tối đa 3 lần trong 15 phút.', 429);
    }
    const selector = crypto.randomBytes(16).toString('hex');
    const token = `${selector}.${crypto.randomBytes(32).toString('base64url')}`;
    await query(connection, 'UPDATE account_email_tokens SET used_at = ? WHERE account_role = ? AND account_id = ? AND purpose = ? AND used_at IS NULL', [now, role, account.id, purpose]);
    await query(connection, 'INSERT INTO account_email_tokens (selector, token_hash, purpose, account_role, account_id, email, credential_tag, created_at, expires_at, used_at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)',
      [selector, tokenHash(token), purpose, role, account.id, email, emailAccountTag(config.secret, role, account), now, now + TOKEN_LIFETIME]);
    return { selector, token, purpose, email };
  }
  async function deliver(prepared, req) {
    const page = prepared.purpose === 'verify_email' ? 'xac-minh-email.html' : 'dat-lai-mat-khau.html';
    const link = `${config.publicBaseURL}/tai-khoan/${page}#${prepared.token}`;
    try {
      await mailer.sendLink(prepared.email, prepared.purpose, link);
      audit('account_email_sent', req, { purpose: prepared.purpose });
      return true;
    } catch {
      await query(db, 'UPDATE account_email_tokens SET used_at = ? WHERE selector = ? AND used_at IS NULL', [Date.now(), prepared.selector]);
      audit('account_email_delivery_failed', req, { purpose: prepared.purpose });
      return false;
    }
  }
  async function requestVerification(role, id, emailValue, currentPassword, req) {
    const email = normalizeEmail(emailValue);
    if (!email) throw accountError('EMAIL_INVALID', 'Vui lòng nhập email hợp lệ.', 400, 'email');
    if (!mailer.configured) throw accountError('EMAIL_NOT_CONFIGURED', 'Dịch vụ gửi email chưa được cấu hình. Vui lòng thử lại sau.', 503);
    const prepared = await withEmailTransaction(db, async connection => {
      const account = await readEmailAccount(connection, role, id, true);
      if (!account) throw accountError('ACCOUNT_MISSING', 'Tài khoản không còn tồn tại.', 401);
      if (!(await verifyPassword(currentPassword, account.password)).ok) throw accountError('PASSWORD_INCORRECT', 'Mật khẩu hiện tại không đúng.', 400, 'currentPassword');
      await ensureAvailable(connection, email, role, id);
      if (normalizeEmail(account.email) === email && account.emailVerifiedAt) throw accountError('EMAIL_ALREADY_VERIFIED', 'Email này đã được xác minh.');
      return prepareToken(connection, role, account, 'verify_email', email);
    });
    if (!await deliver(prepared, req)) throw accountError('EMAIL_DELIVERY_FAILED', 'Chưa gửi được email xác minh. Vui lòng thử lại sau.', 503);
  }
  async function sendRegistrationVerification(role, id, req) {
    if (!mailer.configured) return false;
    const prepared = await withEmailTransaction(db, async connection => {
      const account = await readEmailAccount(connection, role, id, true);
      if (!account || account.emailVerifiedAt || !normalizeEmail(account.email)) return null;
      return prepareToken(connection, role, account, 'verify_email', normalizeEmail(account.email));
    });
    return prepared ? deliver(prepared, req) : false;
  }
  async function requestPublicEmail(emailValue, purpose, req) {
    const email = normalizeEmail(emailValue);
    if (!email || !mailer.configured) return;
    try {
      const prepared = await withEmailTransaction(db, async connection => {
        const matches = await findEmailAccounts(connection, email);
        if (matches.length !== 1) return null;
        const match = matches[0];
        const account = await readEmailAccount(connection, match.role, match.id, true);
        if (!account || normalizeEmail(account.email) !== email || Boolean(account.emailVerifiedAt) !== (purpose === 'reset_password')) return null;
        return prepareToken(connection, match.role, account, purpose, email);
      });
      if (prepared) await deliver(prepared, req);
    } catch { audit('account_email_request_unavailable', req, { purpose }); }
  }
  async function consume(token, purpose, newPassword) {
    const parts = parseToken(token);
    if (!parts) return { ok: false };
    return withEmailTransaction(db, async connection => {
      const rows = await query(connection, 'SELECT * FROM account_email_tokens WHERE selector = ? FOR UPDATE', [parts[0]]);
      const record = rows[0];
      const now = Date.now();
      if (!record || record.purpose !== purpose || record.used_at != null || Number(record.expires_at) <= now || record.attempts >= 5) return { ok: false };
      if (!equalSecret(tokenHash(token), record.token_hash)) {
        await query(connection, 'UPDATE account_email_tokens SET attempts = attempts + 1, used_at = ? WHERE selector = ?', [record.attempts + 1 >= 5 ? now : null, record.selector]);
        return { ok: false };
      }
      const account = await readEmailAccount(connection, record.account_role, record.account_id, true);
      if (!account || !equalSecret(record.credential_tag, emailAccountTag(config.secret, record.account_role, account))) return { ok: false };
      const fields = ACCOUNTS[record.account_role];
      if (purpose === 'verify_email') {
        await ensureAvailable(connection, record.email, record.account_role, record.account_id);
        await query(connection, `UPDATE ${fields.table} SET email = ?, emailVerifiedAt = UTC_TIMESTAMP() WHERE ${fields.id} = ?`, [record.email, record.account_id]);
      } else {
        if (!account.emailVerifiedAt || normalizeEmail(account.email) !== record.email) return { ok: false };
        const error = passwordPolicy(newPassword);
        if (error) return { ok: false, policyError: error };
        if ((await verifyPassword(newPassword, account.password)).ok || newPassword === account.password) return { ok: false, policyError: 'Hãy chọn mật khẩu mới khác mật khẩu cũ.' };
        const hashed = await hashPassword(newPassword);
        await query(connection, `UPDATE ${fields.table} SET ${fields.password} = ? WHERE ${fields.id} = ?`, [hashed, record.account_id]);
      }
      await query(connection, 'UPDATE account_email_tokens SET used_at = ? WHERE account_role = ? AND account_id = ? AND used_at IS NULL', [now, record.account_role, record.account_id]);
      return { ok: true, role: record.account_role, id: String(record.account_id) };
    });
  }
  return { ensureAvailable, sendRegistrationVerification, requestVerification, requestPublicEmail, consume };
}

// Phiên, phân quyền và bảo vệ API.

const COOKIE_NAME = 'icare.sid';
function safeLogger(logger = global.console) {
  return {
    log: (...args) => logger.log(...args),
    error: (message, error) => logger.error(message, { code: /^[A-Z_0-9]+$/.test(error?.code || '') ? error.code : 'INTERNAL_ERROR' }),
  };
}
function installSecurity(app, { db, config, store, logger }) {
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: config.production ? undefined : false, referrerPolicy: { policy: 'no-referrer' } }));
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && !config.origins.includes(origin)) return res.status(403).json({ message: 'Origin không được phép.' });
    next();
  });
  app.use(cors({ origin: config.origins, credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  const cookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: config.production ? true : 'auto', maxAge: 30 * 60000 };
  app.use(session({ name: COOKIE_NAME, secret: config.secret, store: store || new MySQLSessionStore(db),
    resave: false, saveUninitialized: false, rolling: true, cookie }));

  const audit = (event, req, extra = {}) => {
    logger.log(JSON.stringify({ event, actorId: req.auth?.id || null, role: req.auth?.role || null, ...extra }));
  };
  const clearCookie = (req, res) => res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true,
    sameSite: 'lax', secure: config.production || req.secure });
  const invalidate = async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(err => err ? reject(err) : resolve()));
    clearCookie(req, res);
  };
  app.use((req, res, next) => {
    if (/^\/(api|hosoyte)(\/|$)/.test(req.path) || ['/login', '/register', '/logout'].includes(req.path)) {
      res.set('Cache-Control', 'no-store');
    }
    next();
  });
  app.use(async (req, res, next) => {
    try {
      const principal = req.session.principal;
      if (!principal) return next();
      const account = await readAccount(db, principal.role, principal.id);
      if (!account || Date.now() - principal.authenticatedAt > 8 * 3600000 ||
          !equalSecret(principal.tag, credentialTag(config.secret, principal.role, principal.id, account.password))) {
        await invalidate(req, res);
        return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
      }
      req.auth = { role: principal.role, id: String(principal.id) };
      next();
    } catch (err) { next(err); }
  });
  const requireAuth = (req, res, next) => req.auth ? next() : res.status(401).json({ message: 'Vui lòng đăng nhập.' });
  const requireRole = role => [requireAuth, (req, res, next) => {
    if (req.auth.role === role) return next();
    audit('access_denied', req);
    return res.status(403).json({ message: 'Bạn không có quyền truy cập.' });
  }];
  const requireOwner = [ ...requireRole('customer'), (req, res, next) => {
    if (!/^[1-9]\d*$/.test(req.params.idKH) || String(req.params.idKH) !== req.auth.id) {
      audit('ownership_denied', req);
      return res.status(403).json({ message: 'Bạn chỉ được truy cập dữ liệu của mình.' });
    }
    next();
  }];
  const csrf = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const token = req.get('X-CSRF-Token');
    if (!equalSecret(token, req.session.csrfToken)) {
      audit('csrf_rejected', req);
      return res.status(403).json({ code: 'CSRF_INVALID', message: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.' });
    }
    next();
  };
  const limiter = (limit, keyGenerator) => rateLimit({ windowMs: 15 * 60000, limit,
    standardHeaders: 'draft-8', legacyHeaders: false, ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      audit('rate_limited', req);
      res.status(429).json({ message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' });
    } });
  const loginByIP = limiter(100);
  const loginByAccount = limiter(10, req => crypto.createHash('sha256')
    .update(String(req.body?.sdt || '').trim().slice(0, 20)).digest('hex'));
  const passwordLimit = limiter(5, req => req.auth ? `${req.auth.role}:${req.auth.id}` : ipKeyGenerator(req.ip));
  const registerLimit = limiter(10);
  const resetLimit = limiter(10);
  const emailSendLimit = limiter(10);
  const emailAddressLimit = limiter(3, req => crypto.createHash('sha256')
    .update(String(req.body?.email || '').trim().toLowerCase().slice(0, 255)).digest('hex'));
  const emailConfirmLimit = limiter(10);

  app.get('/api/csrf-token', limiter(200), (req, res) => {
    req.session.csrfToken ||= crypto.randomBytes(32).toString('hex');
    res.json({ csrfToken: req.session.csrfToken });
  });
  app.get('/api/session', (req, res) => res.json({ authenticated: Boolean(req.auth),
    ...(req.auth ? { role: req.auth.role, id: req.auth.id } : {}) }));
  app.use((req, res, next) => {
    const publicRead = req.method === 'GET' && (
      ['/api/khoa', '/api/bacsi', '/api/bacsi-all', '/api/lich-da-dat'].includes(req.path) ||
      /^\/api\/bacsi\/(?:khoa\/)?[1-9]\d*$/.test(req.path));
    if (publicRead || ['/login', '/register', '/api/reset-password', '/api/forgot-password', '/api/email-verification/resend', '/api/email-verification/confirm'].includes(req.path)) return next();
    if (/^\/(api|hosoyte)(\/|$)/.test(req.path) || req.path === '/logout') return requireAuth(req, res, next);
    next();
  });
  app.use(csrf);
  app.use('/api/admin', ...requireRole('admin'));
  app.use(['/api/taikhoan', '/api/dashboard', '/api/hoatdong'], ...requireRole('admin'));
  app.use('/api/khoa', (req, res, next) => req.method === 'GET' ? next() : requireRole('admin')[1](req, res, next));

  return { audit, invalidate, requireRole, requireOwner, loginByIP, loginByAccount, passwordLimit, registerLimit, resetLimit,
    emailSendLimit, emailAddressLimit, emailConfirmLimit };
}

// Đăng ký, đăng nhập và đổi mật khẩu.

function installAuthRoutes(app, { db, config, security, emailService }) {
  const { audit, invalidate, requireOwner, loginByIP, loginByAccount, passwordLimit, registerLimit, resetLimit } = security;
  const dummyHash = hashPassword(crypto.randomBytes(32).toString('hex'));
  app.post('/register', registerLimit, async (req, res) => {
    const { hoten, sdt, matkhau } = req.body;
    const email = normalizeEmail(req.body.email);
    if (typeof hoten !== 'string' || !hoten.trim() || hoten.length > 255) return res.status(400).json({ field: 'hoten', message: 'Vui lòng nhập họ tên hợp lệ.' });
    if (typeof sdt !== 'string' || !/^0[0-9]{9,10}$/.test(sdt.trim())) return res.status(400).json({ field: 'sdt', message: 'Số điện thoại không hợp lệ.' });
    if (!email) return res.status(400).json({ field: 'email', message: 'Vui lòng nhập email hợp lệ.' });
    const policyError = passwordPolicy(matkhau);
    if (policyError) return res.status(400).json({ field: 'matkhau', message: policyError });
    const hashed = await hashPassword(matkhau);
    let id;
    try {
      id = await withEmailTransaction(db, async connection => {
        const exists = await query(connection, 'SELECT idKH FROM khachhang WHERE sdt = ? LIMIT 1', [sdt.trim()]);
        const adminExists = await query(connection, 'SELECT idQTV FROM quantrivien WHERE sdtQTV = ? LIMIT 1', [sdt.trim()]);
        if (exists.length || adminExists.length) throw accountError('PHONE_IN_USE', 'Số điện thoại này đã được đăng ký.', 409, 'sdt');
        await emailService.ensureAvailable(connection, email, 'customer', null);
        const result = await query(connection, 'INSERT INTO khachhang (hoten, sdt, matkhau, gioitinh, ngayThangNamSinh, cccd, diachi, email, emailVerifiedAt) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL)', [hoten.trim(), sdt.trim(), hashed, email]);
        await query(connection, 'INSERT INTO hosoyte (idKH) VALUES (?)', [result.insertId]);
        return result.insertId;
      });
    } catch (error) {
      if (!error.publicMessage) throw error;
      return res.status(error.status).json({ field: error.field, message: error.publicMessage });
    }
    audit('registration_success', req, { accountId: id });
    let verificationSent = false;
    try { verificationSent = await emailService.sendRegistrationVerification('customer', id, req); }
    catch { audit('registration_email_unavailable', req); }
    res.status(201).json({ verificationSent, message: verificationSent
      ? 'Đăng ký thành công! Hãy mở email để xác minh tài khoản, sau đó đăng nhập.'
      : 'Đăng ký thành công! Hiện chưa gửi được email xác minh. Bạn vẫn có thể đăng nhập và gửi lại email xác minh sau.' });
  });
  app.post('/login', loginByIP, loginByAccount, async (req, res) => {
    const { sdt, matkhau } = req.body;
    if (typeof sdt !== 'string' || !/^0[0-9]{9,10}$/.test(sdt.trim()) || !validPasswordInput(matkhau)) return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ.' });
    const adminRows = await query(db, 'SELECT idQTV, sdtQTV, matKhauQTV FROM quantrivien WHERE sdtQTV = ? LIMIT 1', [sdt.trim()]);
    const role = adminRows.length ? 'admin' : 'customer';
    const rows = adminRows.length ? adminRows : await query(db, 'SELECT idKH, hoTen, sdt, matKhau FROM khachhang WHERE sdt = ? LIMIT 1', [sdt.trim()]);
    const fields = ACCOUNTS[role];
    const account = rows[0];
    let stored = account?.[fields.password];
    const checked = await verifyPassword(matkhau, stored);
    if (!checked.ok) {
      if (!account || checked.format === 'unsupported') await verifyPassword(matkhau, await dummyHash);
      audit('login_failed', req);
      return res.status(401).json({ message: 'Số điện thoại hoặc mật khẩu không đúng. Bạn có thể chọn “Quên mật khẩu?” nếu đã có email được xác minh.' });
    }
    const id = String(account[fields.id]);
    if (checked.needsRehash) {
      const upgraded = await hashPassword(matkhau);
      const result = await query(db, `UPDATE ${fields.table} SET ${fields.password} = ? WHERE ${fields.id} = ? AND BINARY ${fields.password} = BINARY ?`, [upgraded, id, stored]);
      if (result.affectedRows !== 1) return res.status(409).json({ message: 'Thông tin đăng nhập vừa thay đổi. Vui lòng thử lại.' });
      stored = upgraded;
      audit('password_hash_upgraded', req, { accountId: id, accountRole: role });
    }
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.principal = { id, role, authenticatedAt: Date.now(), tag: credentialTag(config.secret, role, id, stored) };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    req.auth = { id, role };
    audit('login_success', req);
    res.json({ message: 'Đăng nhập thành công!', isAdmin: role === 'admin', csrfToken: req.session.csrfToken,
      ...(role === 'admin' ? { admin: { idQTV: account.idQTV, sdt: account.sdtQTV } } : { user: { idKH: account.idKH, hoTen: account.hoTen, sdt: account.sdt } }) });
  });
  app.post('/logout', async (req, res) => {
    audit('logout', req);
    await invalidate(req, res);
    res.json({ success: true, message: 'Đã đăng xuất.' });
  });
  app.put('/api/khachhang/:idKH/changepassword', ...requireOwner, passwordLimit, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!validPasswordInput(oldPassword)) return res.status(400).json({ field: 'oldPassword', message: 'Vui lòng nhập mật khẩu cũ hợp lệ.' });
    const policyError = passwordPolicy(newPassword);
    if (policyError) return res.status(400).json({ field: 'newPassword', message: policyError });
    const account = await readAccount(db, 'customer', req.auth.id);
    if (!account) return res.status(401).json({ message: 'Tài khoản không còn tồn tại.' });
    if (!(await verifyPassword(oldPassword, account.password)).ok) {
      audit('password_change_failed', req);
      return res.status(400).json({ field: 'oldPassword', message: 'Mật khẩu cũ không đúng.' });
    }
    if (newPassword === oldPassword || (await verifyPassword(newPassword, account.password)).ok) return res.status(400).json({ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu cũ.' });
    const hashed = await hashPassword(newPassword);
    const result = await query(db, 'UPDATE khachhang SET matKhau = ? WHERE idKH = ? AND BINARY matKhau = BINARY ?', [hashed, req.auth.id, account.password]);
    if (result.affectedRows !== 1) return res.status(409).json({ message: 'Mật khẩu vừa thay đổi. Vui lòng đăng nhập lại.' });
    audit('password_changed', req);
    await invalidate(req, res);
    res.json({ success: true, reauthenticate: true, message: 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.' });
  });
  app.post('/api/reset-password', resetLimit, async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;
    const policyError = passwordPolicy(newPassword);
    if (policyError) return res.status(400).json({ field: 'newPassword', message: policyError });
    if (confirmPassword !== newPassword) return res.status(400).json({ field: 'confirmPassword', message: 'Mật khẩu xác nhận không khớp.' });
    const result = await emailService.consume(token, 'reset_password', newPassword);
    if (result.policyError) return res.status(400).json({ field: 'newPassword', message: result.policyError });
    if (!result.ok) {
      audit('password_reset_rejected', req);
      return res.status(400).json({ message: 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn.' });
    }
    audit('password_reset_success', req, { accountId: result.id, accountRole: result.role });
    await invalidate(req, res);
    res.json({ success: true, message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập.' });
  });
}

// Quản lý email tài khoản.

function installEmailRoutes(app, { db, config, security, emailService }) {
  const { audit, emailSendLimit, emailAddressLimit, emailConfirmLimit } = security;
  const handle = callback => async (req, res, next) => {
    try { await callback(req, res); }
    catch (error) {
      if (!error.publicMessage) return next(error);
      res.status(error.status).json({ message: error.publicMessage, ...(error.field ? { field: error.field } : {}) });
    }
  };
  app.get('/api/account/email', handle(async (req, res) => {
    const account = await readEmailAccount(db, req.auth.role, req.auth.id);
    if (!account) return res.status(401).json({ message: 'Tài khoản không còn tồn tại.' });
    const pending = await query(db, 'SELECT email, credential_tag FROM account_email_tokens WHERE account_role = ? AND account_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1', [req.auth.role, req.auth.id, 'verify_email', Date.now()]);
    const pendingEmail = pending[0]?.credential_tag === emailAccountTag(config.secret, req.auth.role, account) ? pending[0].email : null;
    res.json({ email: account.email || null, emailVerifiedAt: account.emailVerifiedAt || null, pendingEmail });
  }));
  app.post('/api/account/email', emailSendLimit, handle(async (req, res) => {
    if (Object.keys(req.body).some(key => !['email', 'currentPassword'].includes(key))) return res.status(400).json({ message: 'Chỉ được cập nhật email của tài khoản đang đăng nhập.' });
    await emailService.requestVerification(req.auth.role, req.auth.id, req.body.email, req.body.currentPassword, req);
    audit('account_email_change_requested', req);
    res.json({ message: 'Đã gửi liên kết xác minh đến email mới. Email chỉ thay đổi sau khi bạn xác minh thành công.' });
  }));
  app.post('/api/email-verification/resend', emailSendLimit, emailAddressLimit, handle(async (req, res) => {
    if (!normalizeEmail(req.body.email)) return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ.' });
    res.json({ message: 'Nếu email thuộc tài khoản chưa xác minh, hệ thống sẽ gửi liên kết xác minh. Vui lòng kiểm tra hộp thư và thư rác.' });
    await emailService.requestPublicEmail(req.body.email, 'verify_email', req);
  }));
  app.post('/api/email-verification/confirm', emailConfirmLimit, handle(async (req, res) => {
    const result = await emailService.consume(req.body.token, 'verify_email');
    if (!result.ok) {
      audit('email_verification_rejected', req);
      return res.status(400).json({ message: 'Liên kết xác minh không hợp lệ, đã hết hạn hoặc đã được sử dụng.' });
    }
    audit('email_verified', req, { accountId: result.id, accountRole: result.role });
    res.json({ message: 'Xác minh email thành công. Bạn có thể sử dụng email này để khôi phục mật khẩu.' });
  }));
  app.post('/api/forgot-password', emailSendLimit, emailAddressLimit, handle(async (req, res) => {
    if (!normalizeEmail(req.body.email)) return res.status(400).json({ message: 'Vui lòng nhập email hợp lệ.' });
    res.json({ message: 'Nếu email đã được đăng ký và xác minh, hệ thống sẽ gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư và thư rác.' });
    await emailService.requestPublicEmail(req.body.email, 'reset_password', req);
  }));
}

// API nghiệp vụ.

function createApp({ db, config, sessionStore, mailer, logger = global.console }) {
const app = express();
const console = safeLogger(logger);
const security = installSecurity(app, { db, config, store: sessionStore, logger: console });
app.use(express.json({ limit: '32kb', strict: true }));
app.use((req, res, next) => {
  req.body ||= {};
  if (Array.isArray(req.body) || Object.values(req.body).some(value => value !== null && typeof value === 'object')) {
    return res.status(400).json({ message: 'Dữ liệu yêu cầu không hợp lệ.' });
  }
  next();
});
const emailService = createEmailService({ db, config, mailer: mailer || createMailer(config), audit: security.audit });
installAuthRoutes(app, { db, config, security, emailService });
installEmailRoutes(app, { db, config, security, emailService });

app.get("/api/khoa", (req, res) => {
	const sql = "SELECT idKhoa, tenKhoa FROM khoa";
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách khoa:", err);
			return res.status(500).json({ message: "Lỗi máy chủ khi lấy khoa" });
		}
		res.json(results);
	});
});

app.get("/api/bacsi/:idKhoa", (req, res) => {
	const idKhoa = req.params.idKhoa;
	const sql = `
		SELECT b.idBacSi, b.hoTenBacSi, b.hocVi, b.idKhoa, k.tenKhoa
		FROM bacsi b
		JOIN khoa k ON b.idKhoa = k.idKhoa
		WHERE b.idKhoa = ?
	`;
	db.query(sql, [idKhoa], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
			return res.status(500).json({ message: "Lỗi máy chủ khi lấy bác sĩ" });
		}
		res.json(results);
	});
});

// Chuẩn hóa ngày giờ đặt lịch.
function normalizeBookingDate(ngayKham) {
	if (typeof ngayKham !== "string") return null;
	const value = ngayKham.trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [year, month, day] = value.split("-").map(Number);
		const test = new Date(Date.UTC(year, month - 1, day));
		if (
			test.getUTCFullYear() !== year ||
			test.getUTCMonth() + 1 !== month ||
			test.getUTCDate() !== day
		)
			return null;
		return value;
	}

	const parts = value.split("/");
	if (parts.length !== 2 && parts.length !== 3) return null;

	const day = Number(parts[0]);
	const month = Number(parts[1]);
	let year = parts.length === 3 ? Number(parts[2]) : new Date().getFullYear();

	if (
		!Number.isInteger(day) ||
		!Number.isInteger(month) ||
		!Number.isInteger(year)
	) {
		return null;
	}

	if (parts.length === 2) {
		const now = new Date();
		const candidate = new Date(year, month - 1, day);
		const thirtyDaysAgo = new Date(now);
		thirtyDaysAgo.setDate(now.getDate() - 30);
		if (candidate < thirtyDaysAgo) year += 1;
	}

	const test = new Date(Date.UTC(year, month - 1, day));
	if (
		test.getUTCFullYear() !== year ||
		test.getUTCMonth() + 1 !== month ||
		test.getUTCDate() !== day
	)
		return null;

	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeBookingTime(gioKham) {
	if (typeof gioKham !== "string") return null;
	const value = gioKham.trim();
	if (/^([0-1]\d|2[0-3]):([0-5]\d)$/.test(value)) return `${value}:00`;
	if (/^([0-1]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value)) return value;
	return null;
}

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

function isAllowedBookingTime(formattedTime) {
	if (!formattedTime) return false;
	return BOOKING_TIME_SLOTS.includes(formattedTime.slice(0, 5));
}

function isActiveAppointmentStatus(status) {
	const normalized = String(status || "")
		.trim()
		.toLowerCase();
	return ["chờ xác nhận", "chưa xác nhận", "đã xác nhận", "xác nhận"].includes(
		normalized,
	);
}

// Đặt lịch khám.
app.post("/api/dat-lich", ...security.requireRole("customer"), (req, res) => {
	let { hoTen, lyDo, idBacSi, idKhoa, ngayKham, gioKham } = req.body;
	const idKH = req.auth.id;
	if (req.body.idKH != null && String(req.body.idKH) !== idKH) {
		return res.status(403).json({ message: "Không được đặt lịch bằng tài khoản khác." });
	}

	hoTen = typeof hoTen === "string" ? hoTen.trim() : "";
	lyDo = typeof lyDo === "string" ? lyDo.trim() : "";

	if (!hoTen || !idBacSi || !ngayKham || !gioKham) {
		return res.status(400).json({ message: "Thiếu thông tin đặt lịch!" });
	}

	if (!idKH) {
		return res
			.status(400)
			.json({ message: "Vui lòng đăng nhập trước khi đặt lịch!" });
	}

	const formattedNgay = normalizeBookingDate(ngayKham);
	if (!formattedNgay) {
		return res.status(400).json({ message: "Ngày khám không hợp lệ!" });
	}

	const formattedGio = normalizeBookingTime(gioKham);
	if (!formattedGio || !isAllowedBookingTime(formattedGio)) {
		return res.status(400).json({
			message: "Giờ khám không hợp lệ. Vui lòng chọn một khung giờ có sẵn!",
		});
	}

	const doctorSql = `
		SELECT b.idBacSi, b.idKhoa, b.hoTenBacSi, k.tenKhoa
		FROM bacsi b
		JOIN khoa k ON b.idKhoa = k.idKhoa
		WHERE b.idBacSi = ?
		LIMIT 1
	`;

	db.query(doctorSql, [idBacSi], (doctorErr, doctorRows) => {
		if (doctorErr) {
			console.error("❌ Lỗi kiểm tra bác sĩ trước khi đặt lịch:", doctorErr);
			return res
				.status(500)
				.json({ message: "Lỗi máy chủ khi kiểm tra bác sĩ!" });
		}

		if (doctorRows.length === 0) {
			return res.status(400).json({ message: "Bác sĩ không tồn tại!" });
		}

		const doctor = doctorRows[0];
		const realIdKhoa = doctor.idKhoa;

		const insertSql = `
			INSERT INTO lichkham
				(hoTen, lyDo, ngayKham, gioKham, idKH, idBacSi, idKhoa, trangThai)
			SELECT ?, ?, ?, ?, ?, ?, ?, 'chờ xác nhận'
			FROM DUAL
			WHERE NOT EXISTS (
				SELECT 1
				FROM lichkham
				WHERE idBacSi = ?
				  AND ngayKham = ?
				  AND gioKham = ?
				  AND LOWER(TRIM(trangThai)) IN ('chờ xác nhận', 'chưa xác nhận', 'đã xác nhận', 'xác nhận')
				LIMIT 1
			)
		`;

		const values = [
			hoTen,
			lyDo || null,
			formattedNgay,
			formattedGio,
			idKH,
			idBacSi,
			realIdKhoa,
			idBacSi,
			formattedNgay,
			formattedGio,
		];

		db.query(insertSql, values, (err, result) => {
			if (err) {
				console.error("❌ Lỗi khi insert LICHKHAM:", err);
				return res.status(500).json({ message: "Đặt lịch thất bại!" });
			}

			if (result.affectedRows === 0) {
				return res.status(409).json({
					success: false,
					code: "SLOT_ALREADY_BOOKED",
					message:
						"Khung giờ này đã có người đặt với bác sĩ. Vui lòng chọn giờ khác!",
				});
			}

			logActivity(
				"ĐẶT LỊCH KHÁM",
				`Bệnh nhân ${hoTen} đặt lịch với ${doctor.hoTenBacSi} ngày ${formattedNgay} lúc ${formattedGio.slice(0, 5)}`,
				idKH,
			);

			return res.status(201).json({
				success: true,
				message: "Đặt lịch khám thành công!",
			});
		});
	});
});

app.get("/api/lich-da-dat", (req, res) => {
	const idBacSi = Number(req.query.bacsi);
	const formattedNgay = normalizeBookingDate(req.query.ngay);

	if (!Number.isInteger(idBacSi) || idBacSi <= 0 || !formattedNgay) {
		return res
			.status(400)
			.json({ message: "Bác sĩ hoặc ngày khám không hợp lệ!" });
	}

	const sql = `
		SELECT TIME_FORMAT(gioKham, '%H:%i') AS gioKham
		FROM lichkham
		WHERE idBacSi = ?
		  AND ngayKham = ?
		  AND LOWER(TRIM(trangThai)) IN ('chờ xác nhận', 'chưa xác nhận', 'đã xác nhận', 'xác nhận')
		ORDER BY gioKham ASC
	`;

	db.query(sql, [idBacSi, formattedNgay], (err, rows) => {
		if (err) {
			console.error("❌ Lỗi khi lấy các giờ đã đặt:", err);
			return res
				.status(500)
				.json({ message: "Không thể kiểm tra khung giờ đã đặt!" });
		}

		return res.json(rows.map((row) => row.gioKham));
	});
});

app.get("/api/bacsi-all", (req, res) => {
	const sql = `
		SELECT b.idBacSi, b.hoTenBacSi, b.hocVi, b.idKhoa, k.tenKhoa
		FROM bacsi b
		JOIN khoa k ON b.idKhoa = k.idKhoa
		ORDER BY b.hoTenBacSi ASC
	`;
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy tất cả bác sĩ:", err);
			return res.status(500).json({ message: "Lỗi máy chủ khi lấy bác sĩ" });
		}
		res.json(results);
	});
});

// Quản lý bác sĩ.

app.get("/api/admin/bacsi", (req, res) => {
	const keyword = req.query.q ? `%${req.query.q}%` : "%";

	const sql = `
        SELECT b.idBacSi, b.hoTenBacSi, b.hocVi, b.idKhoa, k.tenKhoa
        FROM bacsi b
        JOIN khoa k ON b.idKhoa = k.idKhoa
        WHERE b.hoTenBacSi LIKE ? OR b.hocVi LIKE ? OR k.tenKhoa LIKE ?
        ORDER BY b.idBacSi DESC
    `;
	db.query(sql, [keyword, keyword, keyword], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
			return res
				.status(500)
				.json({ message: "Lỗi máy chủ khi lấy danh sách bác sĩ!" });
		}
		res.json(results);
	});
});

app.post("/api/admin/bacsi", (req, res) => {
	const { hoTenBacSi, hocVi, idKhoa } = req.body;

	if (!hoTenBacSi || !idKhoa) {
		return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
	}

	const sql = `
        INSERT INTO bacsi (hoTenBacSi, hocVi, idKhoa)
        VALUES (?, ?, ?)
    `;
	db.query(sql, [hoTenBacSi, hocVi || "", idKhoa], (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi thêm bác sĩ:", err);
			return res.status(500).json({ message: "Thêm bác sĩ thất bại!" });
		}

		logActivity("THÊM BÁC SĨ", `Admin thêm: ${hoTenBacSi}`);

		res.json({
			success: true,
			message: "Thêm bác sĩ thành công!",
			id: result.insertId,
		});
	});
});

app.put("/api/admin/bacsi/:id", (req, res) => {
	const { id } = req.params;
	const { hoTenBacSi, hocVi, idKhoa } = req.body;

	if (!hoTenBacSi || !idKhoa) {
		return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
	}

	const sql = `
        UPDATE bacsi
        SET hoTenBacSi = ?, hocVi = ?, idKhoa = ?
        WHERE idBacSi = ?
    `;
	db.query(sql, [hoTenBacSi, hocVi || "", idKhoa, id], (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi cập nhật bác sĩ:", err);
			return res.status(500).json({ message: "Cập nhật bác sĩ thất bại!" });
		}
		if (result.affectedRows === 0) {
			return res.status(404).json({ message: "Không tìm thấy bác sĩ!" });
		}
		logActivity(
			"CẬP NHẬT BÁC SĨ",
			`Admin cập nhật bác sĩ ID ${id}: ${hoTenBacSi}`,
		);

		res.json({ success: true, message: "Cập nhật bác sĩ thành công!" });
	});
});

app.delete("/api/admin/bacsi/:id", (req, res) => {
	const { id } = req.params;
	const { force } = req.query;  

	const checkBacSi = "SELECT * FROM bacsi WHERE idBacSi = ?";
	db.query(checkBacSi, [id], (err, bsResult) => {
		if (err) return res.status(500).json({ message: "Lỗi kiểm tra bác sĩ!" });
		if (bsResult.length === 0)
			return res.status(404).json({ message: "Không tìm thấy bác sĩ!" });

		const sqlCheck = `
      SELECT 
        (SELECT COUNT(*) FROM lichsukhambenh WHERE idBacSi = ?) AS lichsuCount,
        (SELECT COUNT(*) FROM lichkham WHERE idBacSi = ?) AS lichCount
    `;
		db.query(sqlCheck, [id, id], (err2, countResult) => {
			if (err2) {
				console.error("❌ Lỗi kiểm tra ràng buộc bác sĩ:", err2);
				return res
					.status(500)
					.json({ message: "Lỗi khi kiểm tra dữ liệu liên quan!" });
			}

			const { lichsuCount, lichCount } = countResult[0];

			if ((lichsuCount > 0 || lichCount > 0) && force !== "true") {
				return res.json({
					requireConfirm: true,
					message: `⚠️ Bác sĩ này có ${lichCount} lịch khám và ${lichsuCount} lịch sử khám. Bạn có muốn xóa toàn bộ không?`,
				});
			}

			const delLich = "DELETE FROM lichkham WHERE idBacSi = ?";
			db.query(delLich, [id], (err3) => {
				if (err3) {
					console.error("❌ Lỗi xóa lịch khám:", err3);
					return res
						.status(500)
						.json({ message: "Lỗi khi xóa lịch khám liên quan!" });
				}

				const delLichSu = "DELETE FROM lichsukhambenh WHERE idBacSi = ?";
				db.query(delLichSu, [id], (err4) => {
					if (err4) {
						console.error("❌ Lỗi xóa lịch sử khám:", err4);
						return res
							.status(500)
							.json({ message: "Lỗi khi xóa lịch sử khám liên quan!" });
					}

					const delBacSi = "DELETE FROM bacsi WHERE idBacSi = ?";
					db.query(delBacSi, [id], (err5, result) => {
						if (err5) {
							console.error("❌ Lỗi khi xóa bác sĩ:", err5);
							return res.status(500).json({ message: "Xóa bác sĩ thất bại!" });
						}
						if (result.affectedRows === 0)
							return res
								.status(404)
								.json({ message: "Không tìm thấy bác sĩ để xóa!" });
						logActivity(
							"XÓA BÁC SĨ",
							`Admin xóa bác sĩ ID: ${id}` +
								(lichsuCount > 0 || lichCount > 0
									? ` (cùng ${lichCount} lịch khám và ${lichsuCount} lịch sử khám)`
									: ""),
						);
						res.json({
							success: true,
							message:
								lichsuCount > 0 || lichCount > 0
									? "🗑️ Đã xóa bác sĩ và toàn bộ lịch khám, lịch sử khám liên quan!"
									: "🗑️ Đã xóa bác sĩ thành công!",
						});
					});
				});
			});
		});
	});
});


app.get("/hosoyte/:idKH", ...security.requireOwner, (req, res) => {
	const idKH = req.auth.id;

	const khSql = "SELECT idKH, hoTen, sdt, gioiTinh, ngayThangNamSinh, CCCD, diaChi FROM khachhang WHERE idKH = ?";
	db.query(khSql, [idKH], (err, khResults) => {
		if (err) return res.status(500).json({ message: "Lỗi server!" });
		if (khResults.length === 0) return res.json({ benhnhan: null, lichsu: [] });

		const benhnhan = khResults[0];

		const hsSql = "SELECT * FROM hosoyte WHERE idKH = ?";
		db.query(hsSql, [idKH], (err2, hsResults) => {
			if (err2) return res.status(500).json({ message: "Lỗi server!" });
			if (hsResults.length === 0) return res.json({ benhnhan, lichsu: [] });

			const hoSoYTe = hsResults[0];

			const lsSql = `
                SELECT l.ngayKham, b.hoTenBacSi AS bacSi, k.tenKhoa AS khoa, l.ketLuan, l.chiTiet
                FROM lichsukhambenh l
                JOIN bacsi b ON l.idBacSi = b.idBacSi
                JOIN khoa k ON l.idKhoa = k.idKhoa
                WHERE l.idHoSoYTe = ?
                ORDER BY l.ngayKham DESC
            `;
			db.query(lsSql, [hoSoYTe.idHoSoYTe], (err3, lsResults) => {
				if (err3) return res.status(500).json({ message: "Lỗi server!" });
				res.json({ benhnhan, lichsu: lsResults });
			});
		});
	});
});

// Lịch khám của khách hàng.

app.get("/api/lich-user/:idKH", ...security.requireOwner, (req, res) => {
	const idKH = req.auth.id;
	const sql = `
    SELECT l.idLichKham, l.hoTen, l.lyDo, l.ngayKham, l.gioKham,
           l.idBacSi, l.idKhoa,
           b.hoTenBacSi AS tenBacSi,
           k.tenKhoa AS tenKhoa,
           l.trangThai
    FROM lichkham l
    JOIN bacsi b ON l.idBacSi = b.idBacSi
    JOIN khoa k ON l.idKhoa = k.idKhoa
    WHERE l.idKH = ?
    ORDER BY l.ngayKham DESC
  `;
	db.query(sql, [idKH], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy lịch khám:", err);
			return res.status(500).json({ message: "Lỗi máy chủ!" });
		}
		res.json(results);
	});
});

// Hủy lịch khám.
app.post("/api/huy-lich", ...security.requireRole("customer"), (req, res) => {
	const { idLichKham } = req.body;
	if (!idLichKham) {
		return res
			.status(400)
			.json({ success: false, message: "Thiếu idLichKham!" });
	}

	const sqlGetInfo = `
		SELECT lk.idLichKham, lk.idKH, lk.trangThai, kh.hoTen
		FROM lichkham lk
		JOIN khachhang kh ON lk.idKH = kh.idKH
		WHERE lk.idLichKham = ? AND lk.idKH = ?
		LIMIT 1
	`;

	db.query(sqlGetInfo, [idLichKham, req.auth.id], (err, results) => {
		if (err) {
			console.error("❌ Lỗi truy vấn thông tin hủy lịch:", err);
			return res
				.status(500)
				.json({ success: false, message: "Lỗi máy chủ khi hủy lịch!" });
		}

		if (results.length === 0) {
			return res
				.status(404)
				.json({ success: false, message: "Không tìm thấy lịch khám!" });
		}

		const appointment = results[0];
		const currentStatus = String(appointment.trangThai || "")
			.trim()
			.toLowerCase();

		if (currentStatus === "đã hủy") {
			return res.status(409).json({
				success: false,
				code: "ALREADY_CANCELLED",
				message: "Lịch khám này đã được bạn hủy trước đó.",
			});
		}

		if (!isActiveAppointmentStatus(currentStatus)) {
			return res.status(409).json({
				success: false,
				code: "CANNOT_CANCEL_STATUS",
				message: "Lịch khám ở trạng thái này không thể hủy.",
			});
		}

		const sqlUpdate = `
			UPDATE lichkham
			SET trangThai = 'đã hủy'
			WHERE idLichKham = ? AND idKH = ?
			  AND LOWER(TRIM(trangThai)) IN ('chờ xác nhận', 'chưa xác nhận', 'đã xác nhận', 'xác nhận')
		`;

		db.query(sqlUpdate, [idLichKham, req.auth.id], (errUpdate, result) => {
			if (errUpdate) {
				console.error("❌ Lỗi cập nhật hủy lịch:", errUpdate);
				return res
					.status(500)
					.json({ success: false, message: "Hủy lịch thất bại!" });
			}

			if (result.affectedRows === 0) {
				return res.status(409).json({
					success: false,
					message: "Trạng thái lịch vừa thay đổi. Vui lòng tải lại và thử lại.",
				});
			}

			logActivity(
				"HỦY LỊCH",
				`Bệnh nhân ${appointment.hoTen} hủy lịch khám #${idLichKham}`,
				appointment.idKH,
			);

			return res.json({
				success: true,
				message: "✅ Hủy lịch thành công!",
				trangThai: "đã hủy",
			});
		});
	});
});

// Quản lý chuyên khoa.


app.post("/api/khoa", (req, res) => {
	const { tenKhoa } = req.body;
	if (!tenKhoa || !tenKhoa.trim()) {
		return res.status(400).json({ message: "Tên khoa không được để trống!" });
	}

	const sql = "INSERT INTO khoa (tenKhoa) VALUES (?)";
	db.query(sql, [tenKhoa.trim()], (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi thêm khoa:", err);
			return res.status(500).json({ message: "Thêm khoa thất bại!" });
		}

		logActivity("THÊM KHOA", `Admin thêm khoa mới: ${tenKhoa.trim()}`);

		res.json({
			success: true,
			message: "✅ Thêm khoa thành công!",
			id: result.insertId,
		});
	});
});

app.put("/api/khoa/:id", (req, res) => {
	const { id } = req.params;
	const { tenKhoa } = req.body;
	if (!tenKhoa || !tenKhoa.trim()) {
		return res.status(400).json({ message: "Tên khoa không được để trống!" });
	}

	const sql = "UPDATE khoa SET tenKhoa = ? WHERE idKhoa = ?";
	db.query(sql, [tenKhoa.trim(), id], (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi cập nhật khoa:", err);
			return res.status(500).json({ message: "Cập nhật khoa thất bại!" });
		}
		if (result.affectedRows === 0) {
			return res.status(404).json({ message: "Không tìm thấy khoa!" });
		}

		logActivity(
			"CẬP NHẬT KHOA",
			`Admin cập nhật khoa ID: ${id} thành "${tenKhoa.trim()}"`,
		);

		res.json({ success: true, message: "✅ Cập nhật khoa thành công!" });
	});
});

app.delete("/api/khoa/:id", (req, res) => {
	const { id } = req.params;
	const { force } = req.query;

	const sqlCheck = `
    SELECT b.idBacSi, b.hoTenBacSi,
      (SELECT COUNT(*) FROM lichkham WHERE idBacSi = b.idBacSi) AS lichCount,
      (SELECT COUNT(*) FROM lichsukhambenh WHERE idBacSi = b.idBacSi) AS lichsuCount
    FROM bacsi b
    WHERE b.idKhoa = ?
  `;
	db.query(sqlCheck, [id], (err, bacsi) => {
		if (err) {
			console.error("❌ Lỗi khi kiểm tra bác sĩ:", err);
			return res.status(500).json({ message: "Lỗi khi kiểm tra dữ liệu!" });
		}

		if (bacsi.length > 0 && force !== "true") {
			const totalLich = bacsi.reduce((a, b) => a + b.lichCount, 0);
			const totalLS = bacsi.reduce((a, b) => a + b.lichsuCount, 0);
			let msg = `⚠️ Khoa này có ${bacsi.length} bác sĩ.`;
			msg += totalLich > 0 ? `\n- Tổng ${totalLich} lịch khám.` : "";
			msg += totalLS > 0 ? `\n- Tổng ${totalLS} lịch sử khám bệnh.` : "";
			msg += "\n\nBạn có muốn xóa toàn bộ không?";

			return res.json({
				needConfirm: true,
				message: msg,
				doctors: bacsi,
			});
		}

		const delLichSu = `
      DELETE lsu FROM lichsukhambenh lsu
      JOIN bacsi b ON lsu.idBacSi = b.idBacSi
      WHERE b.idKhoa = ?;
    `;
		const delLich = `
      DELETE l FROM lichkham l
      JOIN bacsi b ON l.idBacSi = b.idBacSi
      WHERE b.idKhoa = ?;
    `;
		const delBacSi = "DELETE FROM bacsi WHERE idKhoa = ?";
		const delKhoa = "DELETE FROM khoa WHERE idKhoa = ?";

		db.query(delLichSu, [id], () => {
			db.query(delLich, [id], () => {
				db.query(delBacSi, [id], () => {
					db.query(delKhoa, [id], (err2) => {
						if (err2) {
							console.error("❌ Lỗi khi xóa khoa:", err2);
							return res.status(500).json({ message: "Xóa khoa thất bại!" });
						}
						const logMsg =
							bacsi.length > 0
								? `Admin xóa khoa ID: ${id} cùng ${bacsi.length} bác sĩ và dữ liệu liên quan`
								: `Admin xóa khoa ID: ${id}`;
						logActivity("XÓA KHOA", logMsg);

						res.json({
							success: true,
							message:
								"🗑️ Đã xóa khoa và toàn bộ bác sĩ, lịch khám, lịch sử khám liên quan!",
						});
					});
				});
			});
		});
	});
});

// Quản lý tài khoản.

app.get("/api/taikhoan", (req, res) => {
	const sql =
		"SELECT idKH, hoTen, gioiTinh, sdt FROM khachhang ORDER BY idKH DESC";
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách tài khoản:", err);
			return res
				.status(500)
				.json({ message: "Lỗi khi lấy danh sách tài khoản!" });
		}

		res.json(results);
	});
});

app.delete("/api/taikhoan/:idKH", (req, res) => {
	const { idKH } = req.params;
	const { force } = req.query;  

	const sqlKH = "SELECT idKH, hoTen, sdt, gioiTinh, ngayThangNamSinh, CCCD, diaChi FROM khachhang WHERE idKH = ?";
	db.query(sqlKH, [idKH], (err, khRes) => {
		if (err)
			return res.status(500).json({ message: "Lỗi khi kiểm tra khách hàng!" });
		if (khRes.length === 0)
			return res
				.status(404)
				.json({ message: "Không tìm thấy tài khoản khách hàng!" });

		const sqlCheck = `
      SELECT 
        (SELECT COUNT(*) FROM lichsukhambenh lsu 
          JOIN hosoyte h ON lsu.idHoSoYTe = h.idHoSoYTe 
          WHERE h.idKH = ?) AS lichsuCount,
        (SELECT COUNT(*) FROM lichkham WHERE idKH = ?) AS lichCount,
        (SELECT COUNT(*) FROM hosoyte WHERE idKH = ?) AS hosoCount
    `;
		db.query(sqlCheck, [idKH, idKH, idKH], (err2, checkRes) => {
			if (err2)
				return res
					.status(500)
					.json({ message: "Lỗi khi kiểm tra dữ liệu liên quan!" });
			const { lichsuCount, lichCount, hosoCount } = checkRes[0];

			if (
				(lichsuCount > 0 || lichCount > 0 || hosoCount > 0) &&
				force !== "true"
			) {
				let msg = `⚠️ Tài khoản ID ${idKH} có dữ liệu liên kết:\n`;
				if (hosoCount > 0) msg += `- ${hosoCount} hồ sơ y tế\n`;
				if (lichsuCount > 0) msg += `- ${lichsuCount} lịch sử khám bệnh\n`;
				if (lichCount > 0) msg += `- ${lichCount} lịch khám\n`;
				msg += "\nBạn có muốn xóa toàn bộ dữ liệu này không?";
				return res.json({
					requireConfirm: true,
					message: msg,
					details: { lichsuCount, lichCount, hosoCount },
				});
			}

			const delLichSu = `
        DELETE lsu FROM lichsukhambenh lsu
        JOIN hosoyte h ON lsu.idHoSoYTe = h.idHoSoYTe
        WHERE h.idKH = ?`;
			const delLichKham = `DELETE FROM lichkham WHERE idKH = ?`;
			const delHoSo = `DELETE FROM hosoyte WHERE idKH = ?`;
			const delKH = `DELETE FROM khachhang WHERE idKH = ?`;

			db.query(delLichSu, [idKH], () => {
				db.query(delLichKham, [idKH], () => {
					db.query(delHoSo, [idKH], () => {
						db.query(delKH, [idKH], (err5) => {
							if (err5) {
								console.error("❌ Lỗi khi xóa khách hàng:", err5);
								return res
									.status(500)
									.json({ message: "Lỗi khi xóa khách hàng!" });
							}

							logActivity("Xóa tài khoản", `Admin xóa tài khoản: ${idKH}`);
							res.json({
								success: true,
								message: "🗑️ Đã xóa tài khoản và toàn bộ dữ liệu liên quan!",
							});
						});
					});
				});
			});
		});
	});
});

// Quản lý lịch khám.
app.get("/api/admin/khachhang/:id", (req, res) => {
	const { id } = req.params;
	const sql = "SELECT idKH FROM khachhang WHERE idKH = ?";
	db.query(sql, [id], (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi kiểm tra khách hàng:", err);
			return res
				.status(500)
				.json({ exists: false, message: "Lỗi khi kiểm tra khách hàng!" });
		}
		res.json({ exists: result.length > 0 });
	});
});

app.get("/api/admin/lichkham", (req, res) => {
	const sql = `
    SELECT l.idLichKham, l.idKH, l.hoTen, l.lyDo, l.ngayKham, l.gioKham, l.trangThai,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa
    FROM lichkham l
    JOIN bacsi b ON l.idBacSi = b.idBacSi
    JOIN khoa k ON l.idKhoa = k.idKhoa
    ORDER BY l.ngayKham DESC, l.gioKham ASC
  `;
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách lịch khám:", err);
			return res
				.status(500)
				.json({ message: "Lỗi máy chủ khi lấy lịch khám!" });
		}
		res.json(results);
	});
});

app.post("/api/admin/lichkham", (req, res) => {
	const { idKH, hoTen, lyDo, ngayKham, gioKham, idBacSi } = req.body;

	if (!idKH || !hoTen || !ngayKham || !gioKham || !idBacSi) {
		return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
	}

	const formattedNgay = normalizeBookingDate(ngayKham);
	const formattedGio = normalizeBookingTime(gioKham);
	if (!formattedNgay || !formattedGio || !isAllowedBookingTime(formattedGio)) {
		return res.status(400).json({
			message: "Ngày hoặc khung giờ khám không hợp lệ!",
		});
	}

	const checkKH = "SELECT idKH FROM khachhang WHERE idKH = ? LIMIT 1";
	db.query(checkKH, [idKH], (err, khRows) => {
		if (err)
			return res.status(500).json({ message: "Lỗi kiểm tra khách hàng!" });
		if (khRows.length === 0) {
			return res
				.status(400)
				.json({ message: "❌ ID khách hàng không tồn tại!" });
		}

		const doctorSql =
			"SELECT idBacSi, idKhoa, hoTenBacSi FROM bacsi WHERE idBacSi = ? LIMIT 1";
		db.query(doctorSql, [idBacSi], (doctorErr, doctorRows) => {
			if (doctorErr) {
				return res.status(500).json({ message: "Lỗi kiểm tra bác sĩ!" });
			}
			if (doctorRows.length === 0) {
				return res.status(400).json({ message: "❌ Bác sĩ không tồn tại!" });
			}

			const doctor = doctorRows[0];
			const sql = `
				INSERT INTO lichkham
					(hoTen, lyDo, ngayKham, gioKham, idKH, idBacSi, idKhoa, trangThai)
				SELECT ?, ?, ?, ?, ?, ?, ?, 'chờ xác nhận'
				FROM DUAL
				WHERE NOT EXISTS (
					SELECT 1
					FROM lichkham
					WHERE idBacSi = ?
					  AND ngayKham = ?
					  AND gioKham = ?
					  AND LOWER(TRIM(trangThai)) IN ('chờ xác nhận', 'chưa xác nhận', 'đã xác nhận', 'xác nhận')
					LIMIT 1
				)
			`;

			const values = [
				hoTen.trim(),
				(typeof lyDo === "string" ? lyDo.trim() : "") || null,
				formattedNgay,
				formattedGio,
				idKH,
				idBacSi,
				doctor.idKhoa,
				idBacSi,
				formattedNgay,
				formattedGio,
			];

			db.query(sql, values, (err2, result) => {
				if (err2) {
					console.error("❌ Lỗi khi thêm lịch khám:", err2);
					return res.status(500).json({ message: "Thêm lịch khám thất bại!" });
				}

				if (result.affectedRows === 0) {
					return res.status(409).json({
						success: false,
						code: "SLOT_ALREADY_BOOKED",
						message:
							"Khung giờ này đã có lịch với bác sĩ. Vui lòng chọn giờ khác!",
					});
				}

				logActivity(
					"THÊM LỊCH (ADMIN)",
					`Admin đặt lịch khám cho ${hoTen} với ${doctor.hoTenBacSi}`,
				);

				return res.status(201).json({
					success: true,
					message: "✅ Thêm lịch khám thành công!",
				});
			});
		});
	});
});

app.put("/api/admin/lichkham/:id", (req, res) => {
	const { id } = req.params;
	let { trangThai } = req.body;

	const requested = String(trangThai || "")
		.trim()
		.toLowerCase();
	const statusMap = {
		"chưa xác nhận": "chờ xác nhận",
		"chờ xác nhận": "chờ xác nhận",
		"xác nhận": "đã xác nhận",
		"đã xác nhận": "đã xác nhận",
		"từ chối": "từ chối",
	};

	trangThai = statusMap[requested];
	if (!trangThai) {
		return res.status(400).json({
			message:
				"Trạng thái không hợp lệ. Admin chỉ được chọn Chưa xác nhận, Xác nhận hoặc Từ chối!",
		});
	}

	const getSql = `
		SELECT l.idLichKham, l.trangThai, kh.hoTen
		FROM lichkham l
		JOIN khachhang kh ON l.idKH = kh.idKH
		WHERE l.idLichKham = ?
		LIMIT 1
	`;

	db.query(getSql, [id], (getErr, rows) => {
		if (getErr) {
			console.error("❌ Lỗi kiểm tra trạng thái lịch khám:", getErr);
			return res.status(500).json({ message: "Lỗi máy chủ!" });
		}

		if (rows.length === 0) {
			return res.status(404).json({ message: "Không tìm thấy lịch khám!" });
		}

		const currentStatus = String(rows[0].trangThai || "")
			.trim()
			.toLowerCase();
		if (currentStatus === "đã hủy") {
			return res.status(409).json({
				success: false,
				code: "CANCELLED_BY_CUSTOMER",
				message:
					"Khách hàng đã hủy lịch này. Admin không thể thay đổi trạng thái nữa!",
			});
		}

		const updateSql = `
			UPDATE lichkham
			SET trangThai = ?
			WHERE idLichKham = ?
			  AND LOWER(TRIM(trangThai)) <> 'đã hủy'
		`;

		db.query(updateSql, [trangThai, id], (err, result) => {
			if (err) {
				console.error("❌ Lỗi khi cập nhật lịch khám:", err);
				return res.status(500).json({ message: "Cập nhật thất bại!" });
			}

			if (result.affectedRows === 0) {
				return res.status(409).json({
					message:
						"Lịch này vừa được khách hàng hủy. Không thể cập nhật trạng thái!",
				});
			}

			logActivity(
				"CẬP NHẬT LỊCH",
				`Admin cập nhật lịch khám ${rows[0].hoTen} → ${trangThai}`,
			);

			return res.json({
				success: true,
				message: "✅ Cập nhật trạng thái thành công!",
				trangThai,
			});
		});
	});
});

app.delete("/api/admin/lichkham/:id", (req, res) => {
	const { id } = req.params;
	const sqlHoTen = `
      SELECT KH.hoTen 
      FROM lichkham LK
      JOIN khachhang KH ON LK.idKH = KH.idKH
      WHERE LK.idLichKham = ?
    `;

	db.query(sqlHoTen, [id], (err1, rows) => {
		let hoTen = "Không rõ";

		if (!err1 && rows.length > 0) {
			hoTen = rows[0].hoTen;
		}

		const sql = "DELETE FROM lichkham WHERE idLichKham = ?";

		db.query(sql, [id], (err, result) => {
			if (err) {
				console.error("❌ Lỗi khi xóa lịch khám:", err);
				return res.status(500).json({ message: "Xóa lịch khám thất bại!" });
			}
			if (result.affectedRows === 0) {
				return res.status(404).json({ message: "Không tìm thấy lịch khám!" });
			}

			logActivity("XÓA LỊCH KHÁM", `Admin xóa lịch khám của: ${hoTen}`);

			res.json({ success: true, message: "🗑️ Xóa lịch khám thành công!" });
		});
	});
});

// Quản lý hồ sơ y tế.

app.get("/api/admin/hosoyte", (req, res) => {
	const sql = `
    SELECT h.idHoSoYTe, k.idKH
    FROM hosoyte h
    JOIN khachhang k ON h.idKH = k.idKH
    ORDER BY h.idHoSoYTe DESC
  `;
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách hồ sơ:", err);
			return res
				.status(500)
				.json({ message: "Lỗi khi lấy danh sách hồ sơ y tế!" });
		}
		res.json(results);
	});
});

app.post("/api/admin/hosoyte", (req, res) => {
	const { idKH } = req.body;
	if (!idKH)
		return res.status(400).json({ message: "Vui lòng nhập ID khách hàng!" });

	const checkKH = "SELECT idKH, hoTen, sdt, gioiTinh, ngayThangNamSinh, CCCD, diaChi FROM khachhang WHERE idKH = ?";
	db.query(checkKH, [idKH], (err, khResults) => {
		if (err) return res.status(500).json({ message: "Lỗi máy chủ!" });
		if (khResults.length === 0)
			return res.status(400).json({ message: "❌ Khách hàng không tồn tại!" });

		const checkHS = "SELECT * FROM hosoyte WHERE idKH = ?";
		db.query(checkHS, [idKH], (err2, hsResults) => {
			if (err2) return res.status(500).json({ message: "Lỗi kiểm tra hồ sơ!" });
			if (hsResults.length > 0)
				return res
					.status(400)
					.json({ message: "⚠️ Khách hàng này đã có hồ sơ y tế!" });

			const insertSql = "INSERT INTO hosoyte (idKH) VALUES (?)";
			db.query(insertSql, [idKH], (err3) => {
				if (err3) {
					console.error("❌ Lỗi khi thêm hồ sơ:", err3);
					return res.status(500).json({ message: "Thêm hồ sơ thất bại!" });
				}

				logActivity("THÊM HỒ SƠ", `Admin tạo hồ sơ y tế cho: ID: ${idKH}`);

				res.json({ success: true, message: "✅ Thêm hồ sơ y tế thành công!" });
			});
		});
	});
});

app.get("/api/admin/hosoyte/:id", (req, res) => {
	const { id } = req.params;
	const sql = `
    SELECT h.idHoSoYTe, k.idKH, k.hoTen, k.gioiTinh, k.sdt, k.ngayThangNamSinh, k.diaChi
    FROM hosoyte h
    JOIN khachhang k ON h.idKH = k.idKH
    WHERE h.idHoSoYTe = ?
  `;
	db.query(sql, [id], (err, results) => {
		if (err) return res.status(500).json({ message: "Lỗi khi xem hồ sơ!" });
		if (results.length === 0)
			return res.status(404).json({ message: "Không tìm thấy hồ sơ!" });
		res.json(results[0]);
	});
});

app.delete("/api/admin/hosoyte/:id", (req, res) => {
	const { id } = req.params;  
	const { force } = req.query;

	const getHoSo = "SELECT idHoSoYTe FROM hosoyte WHERE idHoSoYTe = ?";
	db.query(getHoSo, [id], (err, hsResults) => {
		if (err) return res.status(500).json({ message: "Lỗi kiểm tra hồ sơ!" });
		if (hsResults.length === 0)
			return res.status(404).json({ message: "Không tìm thấy hồ sơ y tế!" });

		const checkLichSu =
			"SELECT COUNT(*) AS count FROM lichsukhambenh WHERE idHoSoYTe = ?";
		db.query(checkLichSu, [id], (err2, lsResults) => {
			if (err2)
				return res.status(500).json({ message: "Lỗi kiểm tra lịch sử khám!" });

			const count = lsResults[0].count;
			if (count > 0 && force !== "true") {
				return res.json({
					requireConfirm: true,
					message: `⚠️ Hồ sơ này có ${count} bản ghi lịch sử khám. Bạn có muốn xóa tất cả không?`,
				});
			}

			const delLichSu = "DELETE FROM lichsukhambenh WHERE idHoSoYTe = ?";
			db.query(delLichSu, [id], (err3) => {
				if (err3) {
					console.error("❌ Lỗi khi xóa lịch sử khám:", err3);
					return res.status(500).json({ message: "Lỗi khi xóa lịch sử khám!" });
				}

				const delHS = "DELETE FROM hosoyte WHERE idHoSoYTe = ?";
				db.query(delHS, [id], (err4, result) => {
					if (err4) {
						console.error("❌ Lỗi khi xóa hồ sơ:", err4);
						return res.status(500).json({ message: "Lỗi khi xóa hồ sơ y tế!" });
					}

					if (result.affectedRows === 0) {
						return res
							.status(404)
							.json({ message: "Không tìm thấy hồ sơ để xóa!" });
					}

					const logMsg =
						count > 0
							? `Admin xóa hồ sơ y tế #${id} cùng ${count} lịch sử khám bệnh`
							: `Admin xóa hồ sơ y tế #${id}`;

					logActivity("XÓA HỒ SƠ", logMsg);

					res.json({
						success: true,
						message:
							count > 0
								? "🗑️ Đã xóa hồ sơ y tế và toàn bộ lịch sử khám liên quan!"
								: "🗑️ Đã xóa hồ sơ y tế thành công!",
					});
				});
			});
		});
	});
});

// Quản lý lịch sử khám.
// Dữ liệu hỗ trợ lịch sử khám.

app.get("/api/bacsi", (req, res) => {
	const sql = "SELECT idBacSi, hoTenBacSi FROM bacsi";
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
			return res.status(500).json({ message: "Lỗi khi lấy danh sách bác sĩ!" });
		}
		res.json(results);
	});
});

app.get("/api/bacsi/khoa/:idKhoa", (req, res) => {
	const { idKhoa } = req.params;
	const sql = "SELECT idBacSi, hoTenBacSi FROM bacsi WHERE idKhoa = ?";
	db.query(sql, [idKhoa], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy bác sĩ theo khoa:", err);
			return res.status(500).json({ message: "Lỗi khi lấy bác sĩ theo khoa!" });
		}
		res.json(results);
	});
});

app.get("/api/admin/lichsu", (req, res) => {
	const sql = `
    SELECT ls.idLS, ls.ngayKham, ls.ketLuan, ls.chiTiet,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa, h.idHoSoYTe
    FROM lichsukhambenh ls
    JOIN bacsi b ON ls.idBacSi = b.idBacSi
    JOIN khoa k ON ls.idKhoa = k.idKhoa
    JOIN hosoyte h ON ls.idHoSoYTe = h.idHoSoYTe
    ORDER BY ls.ngayKham DESC;
  `;
	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy lịch sử khám:", err);
			return res
				.status(500)
				.json({ message: "Lỗi khi lấy danh sách lịch sử khám!" });
		}
		res.json(results);
	});
});
app.get("/api/admin/lichsu/:id", (req, res) => {
	const { id } = req.params;
	const sql = `
    SELECT ls.idLS, ls.ngayKham, ls.ketLuan, ls.chiTiet,
           ls.idBacSi, ls.idKhoa, ls.idHoSoYTe,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa
    FROM lichsukhambenh ls
    JOIN bacsi b ON ls.idBacSi = b.idBacSi
    JOIN khoa k ON ls.idKhoa = k.idKhoa
    JOIN hosoyte h ON ls.idHoSoYTe = h.idHoSoYTe
    WHERE ls.idLS = ?
    LIMIT 1
  `;
	db.query(sql, [id], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy chi tiết lịch sử:", err);
			return res
				.status(500)
				.json({ message: "Lỗi khi lấy chi tiết lịch sử khám!" });
		}
		if (results.length === 0)
			return res.status(404).json({ message: "Không tìm thấy bản ghi!" });
		res.json(results[0]);
	});
});

app.post("/api/admin/lichsu", (req, res) => {
	const { ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe } = req.body;
	if (!ngayKham || !ketLuan || !idBacSi || !idKhoa || !idHoSoYTe)
		return res.status(400).json({ message: "⚠️ Thiếu thông tin bắt buộc!" });

	const sql = `
    INSERT INTO lichsukhambenh (ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
	db.query(
		sql,
		[ngayKham, ketLuan, chiTiet || "", idBacSi, idKhoa, idHoSoYTe],
		(err) => {
			if (err) {
				console.error("❌ Lỗi khi thêm lịch sử khám:", err);
				return res
					.status(500)
					.json({ message: "Không thể thêm lịch sử khám!" });
			}

			logActivity(
				"THÊM LỊCH SỬ KHÁM",
				`Admin thêm lịch sử khám bệnh (Hồ sơ #${idHoSoYTe}): ${ketLuan}`,
			);

			res.json({ success: true, message: "✅ Thêm lịch sử khám thành công!" });
		},
	);
});

app.put("/api/admin/lichsu/:id", (req, res) => {
	const { id } = req.params;
	const { ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe } = req.body;
	if (!ngayKham || !ketLuan || !idBacSi || !idKhoa || !idHoSoYTe)
		return res.status(400).json({ message: "⚠️ Thiếu thông tin cập nhật!" });

	const sql = `
    UPDATE lichsukhambenh 
    SET ngayKham=?, ketLuan=?, chiTiet=?, idBacSi=?, idKhoa=?, idHoSoYTe=? 
    WHERE idLS=?`;
	db.query(
		sql,
		[ngayKham, ketLuan, chiTiet || "", idBacSi, idKhoa, idHoSoYTe, id],
		(err) => {
			if (err) {
				console.error("❌ Lỗi khi cập nhật lịch sử:", err);
				return res
					.status(500)
					.json({ message: "Không thể cập nhật lịch sử khám!" });
			}

			logActivity(
				"CẬP NHẬT LỊCH SỬ",
				`Admin cập nhật lịch sử khám #${idHoSoYTe}`,
			);

			res.json({
				success: true,
				message: "✅ Cập nhật lịch sử khám thành công!",
			});
		},
	);
});

app.delete("/api/admin/lichsu/:id", (req, res) => {
	const { id } = req.params;

	const hsql = `
    select ls.idHoSoYTe from lichsukhambenh ls
    WHERE ls.idLS=?`;

	db.query(hsql, [id], (err1, rows) => {
		let idHoSoYTe = "Không rõ";

		if (!err1 && rows.length > 0) {
			idHoSoYTe = rows[0].idHoSoYTe;
		}

		const sql = "DELETE FROM lichsukhambenh WHERE idLS = ?";
		db.query(sql, [id], (err, result) => {
			if (err) {
				console.error("❌ Lỗi khi xóa lịch sử:", err);
				return res.status(500).json({ message: "Không thể xóa lịch sử khám!" });
			}
			if (result.affectedRows === 0) {
				return res
					.status(404)
					.json({ message: "Không tìm thấy bản ghi cần xóa!" });
			}

			logActivity("XÓA LỊCH SỬ KHÁM", `Admin xóa lịch sử khám #${idHoSoYTe}`);
			res.json({ success: true, message: "🗑️ Xóa lịch sử khám thành công!" });
		});
	});
});

// Thống kê tổng quan.
app.get("/api/dashboard", (req, res) => {
	const countHoSo = "SELECT COUNT(*) AS total FROM hosoyte";

	const countBacSi = "SELECT COUNT(*) AS total FROM bacsi";

	const countLichToday = `
    SELECT COUNT(*) AS total 
    FROM lichkham 
    WHERE DATE(ngayKham) = CURDATE()
  `;

	const countLichMoi = `
    SELECT COUNT(*) AS total 
    FROM lichkham 
    WHERE trangThai = 'Chờ xác nhận'
  `;

	db.query(countHoSo, (err1, hosoResult) => {
		if (err1) {
			console.error("❌ Lỗi đếm hồ sơ:", err1);
			return res.status(500).json({ error: "Lỗi khi đếm hồ sơ" });
		}

		db.query(countBacSi, (err2, bacsiResult) => {
			if (err2) {
				console.error("❌ Lỗi đếm bác sĩ:", err2);
				return res.status(500).json({ error: "Lỗi khi đếm bác sĩ" });
			}

			db.query(countLichToday, (err3, todayResult) => {
				if (err3) {
					console.error("❌ Lỗi đếm lịch hôm nay:", err3);
					return res.status(500).json({ error: "Lỗi khi đếm lịch hôm nay" });
				}

				db.query(countLichMoi, (err4, moiResult) => {
					if (err4) {
						console.error("❌ Lỗi đếm lịch mới:", err4);
						return res.status(500).json({ error: "Lỗi khi đếm lịch mới" });
					}

					res.json({
						totalRecords: hosoResult[0].total || 0,
						totalDoctors: bacsiResult[0].total || 0,
						todayAppointments: todayResult[0].total || 0,
						newContacts: moiResult[0].total || 0,
					});
				});
			});
		});
	});
});

app.get("/api/dashboard/daily-appointments", (req, res) => {
	const sql = `
    SELECT 
        DATE(ngayKham) AS date,
        COUNT(*) AS count
    FROM 
        lichkham
    WHERE 
        ngayKham >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) 
    GROUP BY 
        DATE(ngayKham)
    ORDER BY 
        DATE(ngayKham) ASC
  `;

	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy dữ liệu biểu đồ lịch khám:", err);
			return res
				.status(500)
				.json({ message: "Lỗi máy chủ khi lấy dữ liệu biểu đồ!" });
		}

		const dataMap = new Map();
		results.forEach((row) => {
			const dateStr = new Date(row.date).toISOString().split("T")[0];
			dataMap.set(dateStr, row.count);
		});

		const allDays = [];
		const today = new Date();
		for (let i = 29; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(today.getDate() - i);
			const dateStr = d.toISOString().split("T")[0];

			allDays.push({
				date: dateStr,
				count: dataMap.get(dateStr) || 0,
			});
		}

		res.json(allDays);
	});
});

// Hoạt động gần đây.
app.get("/api/hoatdong", (req, res) => {
	const sql = `
    SELECT loaiHoatDong, moTa, thoiGian 
    FROM hoatdong 
    ORDER BY thoiGian DESC 
    LIMIT 10
  `;

	db.query(sql, (err, results) => {
		if (err) {
			console.error("❌ Lỗi lấy hoạt động:", err);
			return res
				.status(500)
				.json({ message: "Lỗi khi lấy hoạt động gần đây!" });
		}

		const activities = results.map((item) => ({
			loaiHoatDong: item.loaiHoatDong,
			moTa: item.moTa,
			thoiGian: formatTime(item.thoiGian),
		}));

		res.json(activities);
	});
});

function formatTime(date) {
	if (!date) return "";
	const d = new Date(date);
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}

// Ghi hoạt động hệ thống.
function logActivity(loaiHoatDong, moTa, idNguoiThucHien = null) {
	const sql =
		"INSERT INTO hoatdong (loaiHoatDong, moTa, idNguoiThucHien) VALUES (?, ?, ?)";
	db.query(sql, [loaiHoatDong, moTa, idNguoiThucHien], (err) => {
		if (err) console.error("❌ Lỗi ghi log hoạt động:", err);
	});
}


// Đọc hồ sơ cá nhân.
app.get("/api/khachhang/:idKH", ...security.requireOwner, (req, res) => {
	const idKH = req.auth.id;
	const sql = `
    SELECT idKH, hoTen, sdt, gioitinh, ngayThangNamSinh, cccd, diachi, email, emailVerifiedAt
    FROM khachhang
    WHERE idKH = ?
  `;

	db.query(sql, [idKH], (err, results) => {
		if (err) {
			console.error("❌ Lỗi khi lấy thông tin khách hàng:", err);
			return res
				.status(500)
				.json({ message: "Lỗi máy chủ khi lấy thông tin!" });
		}
		if (results.length === 0) {
			return res.status(404).json({ message: "Không tìm thấy khách hàng!" });
		}
		res.json(results[0]);
	});
});



// Cập nhật hồ sơ cá nhân.
app.put("/api/khachhang/:idKH", ...security.requireOwner, (req, res) => {
	const idKH = req.auth.id;
	if (Object.keys(req.body).some(key => !['hoTen', 'gioitinh', 'ngayThangNamSinh', 'cccd', 'diachi'].includes(key))) {
		return res.status(400).json({ message: "Không được sửa trường tài khoản ngoài hồ sơ." });
	}
	const { hoTen, gioitinh, ngayThangNamSinh, cccd, diachi } = req.body;

	if (typeof hoTen !== "string" || !hoTen.trim() || hoTen.length > 255) {
		return res.status(400).json({ message: "Họ tên không hợp lệ!" });
	}

	let formattedNgaySinh = ngayThangNamSinh;
	if (typeof formattedNgaySinh === "string" && formattedNgaySinh.includes("/")) {
		const parts = formattedNgaySinh.split("/");
		if (parts.length === 3) {
			formattedNgaySinh = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
		}
	}

	const sql = `
    UPDATE khachhang
    SET hoTen = ?, gioitinh = ?, ngayThangNamSinh = ?, cccd = ?, diachi = ?
    WHERE idKH = ?
  `;
	const values = [
		hoTen,
		gioitinh || null,  
		formattedNgaySinh || null,  
		cccd || null,
		diachi || null,
		idKH,
	];

	db.query(sql, values, (err, result) => {
		if (err) {
			console.error("❌ Lỗi khi cập nhật khách hàng:", err);
			return res.status(500).json({ message: "Cập nhật thông tin thất bại!" });
		}

		if (result.affectedRows === 0) {
			return res
				.status(404)
				.json({ message: "Không tìm thấy khách hàng để cập nhật!" });
		}

		logActivity("CẬP NHẬT HỒ SƠ", `Khách hàng ID ${idKH} cập nhật hồ sơ`);

		res.json({ success: true, message: "Cập nhật thông tin thành công!" });
	});
});

// Phục vụ giao diện.
const legacyPages = {
  "/assets/images/logo-ta.svg": "/assets/images/icare-clinic.svg",
  "/assets/images/logo-ta-white.svg": "/assets/images/icare-clinic-white.svg",
  "/Khách hàng/trangchupre/trangchu1.html": "/khach-hang/dang-nhap.html",
  "/Khách hàng/trangchupre/script1.js": "/khach-hang/dang-nhap.js",
  "/Khách hàng/trangchupre/style.css": "/khach-hang/dang-nhap.css",
  "/Khách hàng/trangchu/trangchu1.html": "/khach-hang/trang-chu.html",
  "/Khách hàng/trangchu/trangchu1.js": "/khach-hang/trang-chu.js",
  "/Khách hàng/trangchu/trangchu.css": "/khach-hang/trang-chu.css",
  "/Khách hàng/trangchu/account.html": "/khach-hang/ho-so.html",
  "/Khách hàng/trangchu/account.js": "/khach-hang/ho-so.js",
  "/Khách hàng/trangchu/account.css": "/khach-hang/ho-so.css",
  "/Khách hàng/datlichkham/order1.html": "/khach-hang/dat-lich.html",
  "/Khách hàng/datlichkham/order1.js": "/khach-hang/dat-lich.js",
  "/Khách hàng/datlichkham/order1.css": "/khach-hang/dat-lich.css",
  "/Khách hàng/datlichkham/lichUser.html": "/khach-hang/lich-kham.html",
  "/Khách hàng/datlichkham/lichUser1.js": "/khach-hang/lich-kham.js",
  "/Khách hàng/datlichkham/lichUser.css": "/khach-hang/lich-kham.css",
  "/Khách hàng/hosoyte/hosoyte.html": "/khach-hang/ho-so-y-te.html",
  "/Khách hàng/hosoyte/hosoyte.js": "/khach-hang/ho-so-y-te.js",
  "/Khách hàng/hosoyte/hosoyte.css": "/khach-hang/ho-so-y-te.css",
  "/Quản trị viên/admin.html": "/quan-tri/index.html",
  "/assets/auth-client.js": "/assets/js/phien-dang-nhap.js",
  "/assets/account-email.js": "/assets/js/email-tai-khoan.js",
  "/assets/account-email.css": "/assets/css/email-tai-khoan.css",
  "/assets/auth-pages.css": "/assets/css/xac-thuc.css",
  "/assets/account-email.html": "/tai-khoan/email.html",
  "/assets/forgot-password.html": "/tai-khoan/quen-mat-khau.html",
  "/assets/forgot-password.js": "/tai-khoan/quen-mat-khau.js",
  "/assets/verify-email.html": "/tai-khoan/xac-minh-email.html",
  "/assets/verify-email.js": "/tai-khoan/xac-minh-email.js",
  "/assets/reset-password.html": "/tai-khoan/dat-lai-mat-khau.html",
  "/assets/reset-password.js": "/tai-khoan/dat-lai-mat-khau.js",
  "/Khách hàng/Picture/doctor.png": "/assets/images/doctor.png",
  "/Khách hàng/Picture/feature-booking.svg": "/assets/images/feature-booking.svg",
  "/Khách hàng/Picture/feature-record.svg": "/assets/images/feature-record.svg",
  "/Khách hàng/Picture/hero-support.png": "/assets/images/hero-support.png",
  "/Khách hàng/Picture/icon.png": "/assets/images/icon.png",
  "/Khách hàng/Picture/logo-ta-white.svg": "/assets/images/icare-clinic-white.svg",
  "/Khách hàng/Picture/logo-ta.svg": "/assets/images/icare-clinic.svg"
};
app.use((req, res, next) => {
  let pathname;
  try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
  const destination = legacyPages[pathname];
  if (!destination) return next();
  const queryString = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(302, destination + queryString);
});
app.get('/', (req, res) => res.redirect('/khach-hang/dang-nhap.html'));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: false }));
app.use((req, res) => res.status(404).json({ message: 'Không tìm thấy tài nguyên.' }));
app.use((err, req, res, next) => {
  console.error('Lỗi xử lý yêu cầu', err);
  if (res.headersSent) return next(err);
  const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500;
  res.status(status).json({ message: status === 500 ? 'Lỗi máy chủ. Vui lòng thử lại.' : 'Dữ liệu yêu cầu không hợp lệ.' });
});
return app;
}
async function start() {
  const config = loadConfig();
  const db = mysql.createPool(config.db);
  try {
    const [rows] = await db.promise().query('SELECT DATABASE() AS databaseName, @@hostname AS databaseHost, @@port AS databasePort');
    await db.promise().query('SELECT session_id FROM app_sessions LIMIT 0');
    await db.promise().query('SELECT selector FROM account_email_tokens LIMIT 0');
    console.log(`Đã kết nối database MySQL thành công: ${rows[0].databaseName}`);
    console.log(JSON.stringify({ event: 'startup', entrypoint: __filename, pid: process.pid, ...rows[0], authVersion: 'argon2id-session-v1', emailFlowVersion: 'email-links-v1', emailSMTPConfigured: Boolean(config.smtp.user && config.smtp.password) }));
    const app = createApp({ db, config });
    const server = app.listen(config.port, () => console.log(`Server: http://localhost:${config.port}`));
    server.on('error', err => { safeLogger().error('Không thể mở cổng HTTP', err); db.end(); process.exitCode = 1; });
    return { server, db };
  } catch (err) { db.end(); throw err; }
}
if (require.main === module) start().catch(err => {
  safeLogger().error('Không thể khởi động. Kiểm tra .env, MySQL và migration session/email.', err);
  process.exitCode = 1;
});
module.exports = { createApp, start };
