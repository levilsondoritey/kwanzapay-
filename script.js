// ============ CONFIG ============
const API = '/api';
const TOKEN_KEY = 'kwanzapay_token';
const USER_KEY = 'kwanzapay_user';

// ============ AUTH HELPERS ============
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const removeToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };
const getUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
const setUser = (u) => localStorage.setItem(USER_KEY, JSON.stringify(u));
const isLoggedIn = () => !!getToken();

function requireAuth() {
  if (!isLoggedIn()) { window.location.href = '/login.html'; return false; }
  return true;
}

function logout() { removeToken(); window.location.href = '/login.html'; }

// ============ API ============
async function api(endpoint, options = {}) {
  showLoading(true);
  try {
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + endpoint, { ...options, headers });
    const data = await res.json();
    if (res.status === 401 && isLoggedIn()) {
      removeToken();
      toast('Sessão expirada', 'error');
      setTimeout(() => window.location.href = '/login.html', 1000);
    }
    return data;
  } catch (e) {
    toast('Erro de conexão', 'error');
    return { success: false, message: e.message };
  } finally {
    showLoading(false);
  }
}

// ============ UI HELPERS ============
function toast(message, type = 'info', duration = 3000) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function showLoading(show) {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('show', show);
}

function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
}

function formatKz(value) {
  return Number(value || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
}

function formatDate(date) {
  return new Date(date).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' });
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copiado!', 'success'));
}

// ============ BOTTOM NAV ============
function renderBottomNav(active = 'home') {
  const items = [
    { id: 'home', icon: '🏠', label: 'Início', href: '/index.html' },
    { id: 'tasks', icon: '📋', label: 'Tarefas', href: '/tasks.html' },
    { id: 'vip', icon: '👑', label: 'VIP', href: '/vip.html' },
    { id: 'team', icon: '👥', label: 'Equipa', href: '/team.html' },
    { id: 'profile', icon: '👤', label: 'Eu', href: '/profile.html' }
  ];
  const html = `<nav class="bottom-nav">${items.map(i => `
    <a href="${i.href}" class="nav-item ${i.id === active ? 'active' : ''}">
      <span class="nav-icon">${i.icon}</span>
      <span class="nav-label">${i.label}</span>
    </a>`).join('')}</nav>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ============ SETTINGS ============
let APP_SETTINGS = null;
async function loadSettings() {
  if (APP_SETTINGS) return APP_SETTINGS;
  const data = await api('/settings');
  if (data.success) APP_SETTINGS = data.settings;
  return APP_SETTINGS;
}

// ============ GLOBAL STYLE INJECTION ============
const GLOBAL_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
body { background: #f0f4f8; color: #1a1a1a; min-height: 100vh; padding-bottom: 80px; overflow-x: hidden; }
a { text-decoration: none; color: inherit; }
button { cursor: pointer; border: none; font-family: inherit; }
input, select, textarea { font-family: inherit; outline: none; }
img { max-width: 100%; display: block; }

:root {
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --secondary: #8b5cf6;
  --accent: #ec4899;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --info: #06b6d4;
  --gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  --gradient-2: linear-gradient(135deg, #ec4899 0%, #f59e0b 100%);
  --gradient-3: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  --gradient-4: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  --bg: #f0f4f8;
  --card: #ffffff;
  --text: #1e293b;
  --text-light: #64748b;
  --border: #e2e8f0;
  --shadow: 0 4px 20px rgba(99,102,241,0.08);
  --shadow-lg: 0 10px 40px rgba(99,102,241,0.2);
}

.container { max-width: 480px; margin: 0 auto; padding: 16px; }

/* HEADER */
.header {
  background: var(--gradient);
  color: white; padding: 20px 16px;
  position: relative;
  border-radius: 0 0 32px 32px;
  box-shadow: var(--shadow-lg);
}
.header h1 { font-size: 22px; font-weight: 800; text-align: center; }
.header-back {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);
  border-radius: 50%; width: 38px; height: 38px;
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 20px;
}

/* CARDS */
.card {
  background: var(--card);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}
.card-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--text); }

/* BUTTONS */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 14px 24px; border-radius: 16px;
  font-size: 15px; font-weight: 700;
  transition: all 0.2s; width: 100%; gap: 8px;
}
.btn-primary {
  background: var(--gradient); color: white;
  box-shadow: 0 4px 20px rgba(99,102,241,0.4);
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(99,102,241,0.5); }
.btn-success { background: var(--gradient-3); color: white; }
.btn-danger { background: var(--gradient-4); color: white; }
.btn-secondary { background: #f1f5f9; color: var(--text); }
.btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
.btn-sm { padding: 8px 16px; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }

/* INPUTS */
.input-group { margin-bottom: 16px; }
.input-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
.input {
  width: 100%; padding: 14px 18px;
  border: 2px solid var(--border);
  border-radius: 14px;
  font-size: 15px; background: white;
  transition: all 0.2s;
}
.input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.input-icon { position: relative; }
.input-icon i, .input-icon .icon {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  color: var(--text-light); font-size: 18px;
}
.input-icon input { padding-left: 48px; }
.input-prefix { position: relative; }
.input-prefix .prefix {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
  color: var(--text-light); font-weight: 600;
}
.input-prefix input { padding-left: 60px; }
.textarea {
  width: 100%; padding: 14px 18px;
  border: 2px solid var(--border);
  border-radius: 14px;
  font-size: 15px; resize: vertical; min-height: 100px;
}

/* BOTTOM NAV */
.bottom-nav {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: white;
  padding: 10px 0 12px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
  display: flex; justify-content: space-around;
  z-index: 100;
  max-width: 480px; margin: 0 auto;
  border-radius: 24px 24px 0 0;
}
.nav-item {
  flex: 1; display: flex; flex-direction: column;
  align-items: center;
  padding: 6px;
  color: var(--text-light);
  font-size: 11px; gap: 2px;
  transition: all 0.2s;
}
.nav-item.active { color: var(--primary); }
.nav-item.active .nav-icon { transform: scale(1.2); }
.nav-icon { font-size: 22px; transition: transform 0.2s; }
.nav-label { font-weight: 600; }

/* TOAST */
.toast {
  position: fixed; top: 20px; left: 50%;
  transform: translateX(-50%);
  background: var(--text); color: white;
  padding: 14px 24px; border-radius: 16px;
  z-index: 10000;
  box-shadow: var(--shadow-lg);
  animation: slideDown 0.3s ease;
  max-width: 90%; font-weight: 600;
}
.toast.success { background: var(--gradient-3); }
.toast.error { background: var(--gradient-4); }
.toast.warning { background: var(--gradient-2); }
@keyframes slideDown {
  from { transform: translate(-50%, -100px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}

/* LOADING */
.spinner {
  width: 50px; height: 50px;
  border: 4px solid #e2e8f0;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 20px auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: none; align-items: center; justify-content: center;
  z-index: 9999;
}
.loading-overlay.show { display: flex; }

/* MODAL */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(8px);
  display: none; align-items: center; justify-content: center;
  z-index: 9000; padding: 16px;
}
.modal-overlay.show { display: flex; }
.modal {
  background: white; border-radius: 24px;
  padding: 24px;
  max-width: 420px; width: 100%;
  max-height: 90vh; overflow-y: auto;
  animation: scaleIn 0.2s;
}
@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-title { font-size: 20px; font-weight: 800; margin-bottom: 16px; color: var(--text); }

/* BADGES */
.badge {
  display: inline-block; padding: 4px 12px;
  border-radius: 12px; font-size: 11px; font-weight: 700;
}
.badge-pending { background: #fef3c7; color: #d97706; }
.badge-approved { background: #d1fae5; color: #059669; }
.badge-rejected { background: #fee2e2; color: #dc2626; }

/* UTILITIES */
.text-center { text-align: center; }
.text-primary { color: var(--primary); }
.text-success { color: var(--success); }
.text-danger { color: var(--danger); }
.text-muted { color: var(--text-light); }
.font-bold { font-weight: 700; }
.fs-12 { font-size: 12px; }
.fs-14 { font-size: 14px; }
.fs-16 { font-size: 16px; }
.fs-20 { font-size: 20px; }
.fs-24 { font-size: 24px; }
.fs-32 { font-size: 32px; }
.mt-8 { margin-top: 8px; }
.mt-16 { margin-top: 16px; }
.mt-24 { margin-top: 24px; }
.mb-8 { margin-bottom: 8px; }
.mb-16 { margin-bottom: 16px; }
.flex { display: flex; }
.flex-1 { flex: 1; }
.gap-8 { gap: 8px; }
.gap-12 { gap: 12px; }
.gap-16 { gap: 16px; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }
.w-full { width: 100%; }
.hidden { display: none !important; }
`;

// Injetar CSS no head
if (!document.getElementById('kwanzapay-css')) {
  const style = document.createElement('style');
  style.id = 'kwanzapay-css';
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

// Auto-load settings
document.addEventListener('DOMContentLoaded', () => loadSettings());
