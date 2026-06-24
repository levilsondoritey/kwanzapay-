// ============================================================
// KwanzaPay v2.0 — Frontend SPA Completo
// public/script.js — PARTE 1/2
// ============================================================

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
  if (!isLoggedIn()) { navigate('login'); return false; }
  return true;
}

function logout() { removeToken(); navigate('login'); }

// ============ API CALL ============
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
      toast('Sessão expirada. Faça login novamente.', 'error');
      setTimeout(() => navigate('login'), 1000);
    }
    return data;
  } catch (e) {
    toast('Erro de conexão com o servidor', 'error');
    return { success: false, message: e.message };
  } finally {
    showLoading(false);
  }
}

// ============ UI HELPERS ============
function toast(message, type = 'info', duration = 3000) {
  const existing = document.querySelectorAll('.toast');
  existing.forEach(t => t.remove());
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
  closeModal();
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
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Copiado!', 'success')).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Copiado!', 'success'); } catch { toast('Erro ao copiar', 'error'); }
  document.body.removeChild(ta);
}

// ============ SETTINGS ============
let APP_SETTINGS = null;
async function loadSettings() {
  if (APP_SETTINGS) return APP_SETTINGS;
  const data = await api('/settings');
  if (data.success) APP_SETTINGS = data.settings;
  return APP_SETTINGS;
}

// ============ SPA NAVIGATION ============
let currentPage = 'home';
const PAGE_LOADERS = {
  home: loadHomePage,
  login: loadLoginPage,
  register: loadRegisterPage,
  deposit: loadDepositPage,
  withdraw: loadWithdrawPage,
  history: loadHistoryPage,
  tasks: loadTasksPage,
  vip: loadVipPage,
  team: loadTeamPage,
  profile: loadProfilePage,
  blog: loadBlogPage,
  about: loadAboutPage
};

const AUTH_REQUIRED = ['deposit', 'withdraw', 'history', 'tasks', 'vip', 'team', 'profile'];
const NO_BOTTOM_NAV = ['login', 'register'];
const BOTTOM_NAV_MAP = { home: 'home', tasks: 'tasks', vip: 'vip', team: 'team', profile: 'profile', deposit: 'home', withdraw: 'home', history: 'profile', blog: 'home', about: 'home' };

function navigate(page) {
  if (AUTH_REQUIRED.includes(page) && !isLoggedIn()) { page = 'login'; }

  // Esconder todas as páginas
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });

  // Remover bottom nav existente
  document.querySelectorAll('.bottom-nav').forEach(n => n.remove());

  // Mostrar página
  const el = document.getElementById('page-' + page);
  if (el) { el.style.display = 'block'; el.classList.add('active'); }

  currentPage = page;
  window.scrollTo(0, 0);

  // Carregar dados da página
  if (PAGE_LOADERS[page]) PAGE_LOADERS[page]();

  // Bottom nav
  if (!NO_BOTTOM_NAV.includes(page)) {
    renderBottomNav(BOTTOM_NAV_MAP[page] || 'home');
  }

  // Atualizar URL sem recarregar
  const url = page === 'home' ? '/' : `/#/${page}`;
  history.pushState({ page }, '', url);
}

// Lidar com botão voltar do browser
window.addEventListener('popstate', (e) => {
  if (e.state?.page) navigate(e.state.page);
  else navigate('home');
});

// ============ BOTTOM NAV ============
function renderBottomNav(active = 'home') {
  document.querySelectorAll('.bottom-nav').forEach(n => n.remove());
  const items = [
    { id: 'home', icon: '🏠', label: 'Início' },
    { id: 'tasks', icon: '📋', label: 'Tarefas' },
    { id: 'vip', icon: '👑', label: 'VIP' },
    { id: 'team', icon: '👥', label: 'Equipa' },
    { id: 'profile', icon: '👤', label: 'Eu' }
  ];
  const html = `<nav class="bottom-nav">${items.map(i => `
    <a onclick="navigate('${i.id}')" class="nav-item ${i.id === active ? 'active' : ''}" style="cursor:pointer;">
      <span class="nav-icon">${i.icon}</span>
      <span class="nav-label">${i.label}</span>
    </a>`).join('')}</nav>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ============ PAGE: HOME ============
async function loadHomePage() {
  await loadSettings();
  if (APP_SETTINGS) {
    if (APP_SETTINGS.socialLinks?.whatsappSupport) document.getElementById('homeWaSupport').href = APP_SETTINGS.socialLinks.whatsappSupport;
    if (APP_SETTINGS.socialLinks?.telegramSupport) document.getElementById('homeTgSupport').href = APP_SETTINGS.socialLinks.telegramSupport;
    if (APP_SETTINGS.aboutUs) document.getElementById('homeAboutPreview').textContent = APP_SETTINGS.aboutUs.substring(0, 250) + '...';
  }

  if (isLoggedIn()) {
    const d = await api('/user/dashboard');
    if (d.success) {
      document.getElementById('homeUserName').textContent = d.data.nickname;
      document.getElementById('homeTotalAssets').textContent = formatKz(d.data.totalAssets);
      document.getElementById('homeDepW').textContent = formatKz(d.data.depositWallet);
      document.getElementById('homeWitW').textContent = formatKz(d.data.withdrawWallet);
      if (!d.data.hasEverDeposited) {
        document.getElementById('homeTasksStatus').textContent = 'Faça um Depósito';
        document.getElementById('homeTasksReward').textContent = 'Para desbloquear as tarefas';
      } else if (d.data.vipLevel === 0) {
        document.getElementById('homeTasksStatus').textContent = 'Compre um VIP';
        document.getElementById('homeTasksReward').textContent = 'Para começar a ganhar';
      } else {
        document.getElementById('homeTasksStatus').textContent = `${d.data.tasksRemaining}/${d.data.tasksPerDay} restantes`;
        document.getElementById('homeTasksReward').textContent = `${d.data.rewardPerTask} Kz por tarefa`;
      }
    }
  } else {
    document.getElementById('homeUserName').textContent = 'Faça login';
    document.getElementById('homeTasksStatus').textContent = 'Faça Login';
    document.getElementById('homeTasksReward').textContent = 'Para começar a ganhar';
  }
}

// ============ PAGE: LOGIN ============
function loadLoginPage() {
  const form = document.getElementById('loginForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!phone || !password) return toast('Preencha todos os campos', 'error');

    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '244' + phone, password }) });
    if (r.success) {
      setToken(r.token); setUser(r.user);
      toast('Login realizado! 🎉', 'success');
      setTimeout(() => navigate('home'), 800);
    } else toast(r.message, 'error');
  };
}

// ============ PAGE: REGISTER ============
function loadRegisterPage() {
  // Preencher código de convite da URL
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
  const refCode = urlParams.get('ref') || urlParams.get('inviteCode');
  if (refCode) document.getElementById('regInviteCode').value = refCode.toUpperCase();

  const form = document.getElementById('registerForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      nickname: document.getElementById('regNickname').value.trim(),
      phone: '244' + document.getElementById('regPhone').value.trim(),
      password: document.getElementById('regPassword').value,
      inviteCode: document.getElementById('regInviteCode').value.trim().toUpperCase()
    };
    if (!data.nickname || !data.phone || !data.password) return toast('Preencha todos os campos', 'error');

    const r = await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    if (r.success) {
      setToken(r.token); setUser(r.user);
      toast('Cadastro realizado! 🎉', 'success');
      setTimeout(() => navigate('home'), 800);
    } else toast(r.message, 'error');
  };
}

// ============ PAGE: DEPOSIT ============
let selectedDepositMethod = 'bank';

async function loadDepositPage() {
  if (!requireAuth()) return;
  const d = await api('/user/dashboard');
  if (d.success) document.getElementById('depBalance').textContent = formatKz(d.data.depositWallet);

  await loadSettings();
  if (APP_SETTINGS) {
    document.getElementById('depMinDep').textContent = formatKz(APP_SETTINGS.minDeposit);
    document.getElementById('depMaxDep').textContent = formatKz(APP_SETTINGS.maxDeposit);
    renderDepositMethods();
  }
}

function renderDepositMethods() {
  const pm = APP_SETTINGS?.paymentMethods || {};
  const methods = [];
  if (pm.bankTransfer) methods.push({ id: 'bank', icon: '🏦', name: 'Transferência Bancária', desc: 'BFA, BAI, BIC, ATL, BCI' });
  if (pm.entityReference) methods.push({ id: 'entity', icon: '📲', name: 'Entidade / Referência', desc: 'Multicaixa Express ou ATM' });
  if (pm.kwik) methods.push({ id: 'kwik', icon: '💸', name: 'KWIK', desc: 'Transferência via KWIK' });

  document.getElementById('depMethodsList').innerHTML = methods.map((m, i) => `
    <div style="border:2px solid ${i === 0 ? '#6366f1' : '#e2e8f0'};border-radius:16px;padding:16px;display:flex;align-items:center;gap:14px;cursor:pointer;margin-bottom:10px;transition:all 0.2s;${i === 0 ? 'background:#eef2ff;' : ''}" onclick="selectDepositMethod(this,'${m.id}')" class="dep-method-card">
      <span style="font-size:28px;">${m.icon}</span>
      <div style="flex:1;">
        <div style="font-size:15px;font-weight:700;">${m.name}</div>
        <div style="font-size:12px;color:#64748b;">${m.desc}</div>
      </div>
    </div>
  `).join('');
}

function selectDepositMethod(el, id) {
  document.querySelectorAll('.dep-method-card').forEach(c => { c.style.borderColor = '#e2e8f0'; c.style.background = 'transparent'; });
  el.style.borderColor = '#6366f1';
  el.style.background = '#eef2ff';
  selectedDepositMethod = id;
}

async function createDeposit() {
  const amount = parseFloat(document.getElementById('depAmount').value);
  if (!amount || amount < (APP_SETTINGS?.minDeposit || 3000))
    return toast(`Valor mínimo: ${formatKz(APP_SETTINGS?.minDeposit || 3000)}`, 'error');

  if (selectedDepositMethod === 'bank') {
    const r = await api('/deposit/payment-info/bank');
    if (!r.success || !r.banks?.length) return toast('Sem bancos disponíveis', 'error');
    showModal(`
      <h3 class="modal-title">🏦 Selecione o Banco</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${r.banks.map(b => `
          <div style="border:2px solid #e2e8f0;border-radius:16px;padding:16px;text-align:center;cursor:pointer;" onclick="confirmBankDeposit('${b._id}',${amount})">
            <div style="font-size:32px;margin-bottom:8px;">${b.logo ? `<img src="${b.logo}" style="width:40px;height:40px;object-fit:contain;margin:0 auto;">` : '🏦'}</div>
            <div style="font-size:14px;font-weight:700;">${b.bankName}</div>
          </div>
        `).join('')}
      </div>
    `);
  } else if (selectedDepositMethod === 'entity') {
    const r = await api('/deposit/create', { method: 'POST', body: JSON.stringify({ amount, method: 'entity' }) });
    if (r.success) showDepositInfoModal(r.deposit, r.deposit.paymentInfo, amount, 'entity');
    else toast(r.message, 'error');
  } else if (selectedDepositMethod === 'kwik') {
    const r = await api('/deposit/create', { method: 'POST', body: JSON.stringify({ amount, method: 'kwik' }) });
    if (r.success) showDepositInfoModal(r.deposit, r.deposit.paymentInfo, amount, 'kwik');
    else toast(r.message, 'error');
  }
}

async function confirmBankDeposit(bankId, amount) {
  closeModal();
  const r = await api('/deposit/create', { method: 'POST', body: JSON.stringify({ amount, method: 'bank', bankId }) });
  if (r.success) showDepositInfoModal(r.deposit, r.deposit.paymentInfo, amount, 'bank');
  else toast(r.message, 'error');
}

function showDepositInfoModal(deposit, info, amount, method) {
  let fields = '';
  if (method === 'bank') {
    fields = `
      <div class="input-group"><label class="input-label">Banco</label><input class="input" value="${info.bank}" readonly></div>
      <div class="input-group"><label class="input-label">Titular</label><div style="display:flex;gap:8px;"><input class="input" value="${info.accountName}" readonly style="flex:1;"><button class="copy-btn" onclick="copyText('${info.accountName}')">📋</button></div></div>
      <div class="input-group"><label class="input-label">IBAN</label><div style="display:flex;gap:8px;"><input class="input" value="${info.iban}" readonly style="flex:1;"><button class="copy-btn" onclick="copyText('${info.iban}')">📋</button></div></div>
    `;
  } else if (method === 'entity') {
    fields = `
      <div class="input-group"><label class="input-label">Entidade</label><div style="display:flex;gap:8px;"><input class="input" value="${info.entity}" readonly style="flex:1;"><button class="copy-btn" onclick="copyText('${info.entity}')">📋</button></div></div>
      <div class="input-group"><label class="input-label">Referência</label><div style="display:flex;gap:8px;"><input class="input" value="${info.reference}" readonly style="flex:1;"><button class="copy-btn" onclick="copyText('${info.reference}')">📋</button></div></div>
      <div style="background:#eef2ff;padding:14px;border-radius:12px;font-size:13px;color:#4f46e5;margin-bottom:16px;">💡 Multicaixa Express ou ATM → Pagamentos → Outros Serviços</div>
    `;
  } else if (method === 'kwik') {
    fields = `
      <div class="input-group"><label class="input-label">Número KWIK</label><div style="display:flex;gap:8px;"><input class="input" value="${info.kwikNumber}" readonly style="flex:1;"><button class="copy-btn" onclick="copyText('${info.kwikNumber}')">📋</button></div></div>
      <div class="input-group"><label class="input-label">Nome</label><input class="input" value="${info.kwikName}" readonly></div>
    `;
  }

  const title = method === 'bank' ? '🏦 Transferência Bancária' : method === 'entity' ? '📲 Entidade / Referência' : '💸 KWIK';

  showModal(`
    <h3 class="modal-title">${title}</h3>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:32px;font-weight:900;color:#6366f1;">${formatKz(amount)}</div>
      <div class="badge badge-pending" style="margin-top:8px;">⏱ Tempo: 30 min</div>
    </div>
    ${fields}
    <div style="margin-top:16px;">
      <label class="input-label">📷 Comprovante</label>
      <label style="border:2px dashed #c7d2fe;padding:24px;border-radius:14px;display:block;text-align:center;cursor:pointer;">
        <div style="font-size:36px;">📤</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">Toque para enviar comprovante</div>
        <input type="file" id="proofFileInput" accept="image/*" style="display:none;" onchange="uploadDepositProof('${deposit._id}',this)">
      </label>
      <img id="proofPreviewImg" style="display:none;width:100%;border-radius:12px;margin-top:12px;">
    </div>
    <button class="btn btn-primary mt-16" onclick="markDepositPaid('${deposit._id}')">✅ Eu já paguei</button>
  `);

  // Fix: trigger file input
  setTimeout(() => {
    const label = document.querySelector('.modal label[style*="dashed"]');
    if (label) label.onclick = () => document.getElementById('proofFileInput')?.click();
  }, 100);
}

async function uploadDepositProof(depositId, input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('proofPreviewImg');
  if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
  const fd = new FormData();
  fd.append('proof', file);
  fd.append('depositId', depositId);
  const r = await api('/deposit/upload-proof', { method: 'POST', body: fd });
  if (r.success) toast(r.message, 'success');
  else toast(r.message, 'error');
}

async function markDepositPaid(depositId) {
  const r = await api('/deposit/mark-paid', { method: 'POST', body: JSON.stringify({ depositId }) });
  if (r.success) { toast(r.message, 'success'); closeModal(); }
  else toast(r.message, 'error');
}

// ============ PAGE: WITHDRAW ============
async function loadWithdrawPage() {
  if (!requireAuth()) return;
  const d = await api('/user/dashboard');
  if (d.success) {
    document.getElementById('witBalance').textContent = formatKz(d.data.withdrawWallet);
    if (!d.data.hasWithdrawPassword) toast('Defina sua senha de retirada no perfil primeiro!', 'warning');
    const p = await api('/user/profile');
    if (p.success && p.user.bankInfo) {
      document.getElementById('witAccountName').value = p.user.bankInfo.accountName || '';
      document.getElementById('witIban').value = p.user.bankInfo.iban || '';
      document.getElementById('witBank').value = p.user.bankInfo.bank || '';
    }
  }

  await loadSettings();
  if (APP_SETTINGS) {
    document.getElementById('witMaxW').textContent = formatKz(APP_SETTINGS.maxWithdraw);
    document.getElementById('witFeeDisplay').textContent = APP_SETTINGS.withdrawFee + '%';
    const sel = document.getElementById('witBank');
    sel.innerHTML = '<option value="">Selecione</option>';
    (APP_SETTINGS.withdrawBanks || []).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.code; opt.textContent = b.name;
      sel.appendChild(opt);
    });
  }
}

async function submitWithdraw() {
  const data = {
    amount: parseFloat(document.getElementById('witAmount').value),
    accountName: document.getElementById('witAccountName').value.trim(),
    iban: document.getElementById('witIban').value.trim(),
    bank: document.getElementById('witBank').value,
    withdrawPassword: document.getElementById('witPassword').value
  };

  if (!data.amount || !data.accountName || !data.iban || !data.bank || !data.withdrawPassword)
    return toast('Preencha todos os campos (Nome Completo, IBAN, Banco e Senha)', 'error');

  if (data.amount < (APP_SETTINGS?.minWithdraw || 1200))
    return toast(`Mínimo: ${formatKz(APP_SETTINGS?.minWithdraw || 1200)}`, 'error');

  const feePercent = APP_SETTINGS?.withdrawFee || 8;
  const fee = Math.round(data.amount * feePercent / 100);
  const net = data.amount - fee;

  if (!confirm(`Confirmar saque?\n\nSolicitado: ${formatKz(data.amount)}\nTaxa (${feePercent}%): -${formatKz(fee)}\nReceberá: ${formatKz(net)}`)) return;

  const r = await api('/withdraw/create', { method: 'POST', body: JSON.stringify(data) });
  if (r.success) {
    toast('🎉 ' + r.message, 'success');
    setTimeout(() => navigate('history'), 1500);
  } else toast(r.message, 'error');
}

// >>> CONTINUA NA PARTE 8 (History, Tasks, VIP, Team, Profile, Blog, About, Init) >>>
// ============ PAGE: HISTORY ============
let ALL_TRANSACTIONS = [];
const typeConfig = {
  deposit: { icon: '💰', bg: '#d1fae5', label: 'Depósito' },
  task_reward: { icon: '📋', bg: '#eef2ff', label: 'Tarefa' },
  withdraw: { icon: '🏦', bg: '#fee2e2', label: 'Saque' },
  withdraw_refund: { icon: '↩️', bg: '#fef3c7', label: 'Reembolso' },
  commission: { icon: '🤝', bg: '#e0e7ff', label: 'Comissão' },
  vip_purchase: { icon: '👑', bg: '#fce7f3', label: 'VIP' },
  admin_add: { icon: '⚙️', bg: '#d1fae5', label: 'Admin +' },
  admin_remove: { icon: '⚙️', bg: '#fee2e2', label: 'Admin -' }
};

async function loadHistoryPage() {
  if (!requireAuth()) return;
  const r = await api('/user/wallet-history');
  if (r.success) {
    ALL_TRANSACTIONS = r.transactions;
    renderHistoryList(ALL_TRANSACTIONS);
  }
  // Reset filter tabs
  document.querySelectorAll('#historyFilters .filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('#historyFilters .filter-tab')?.classList.add('active');
}

function filterHistory(type, el) {
  document.querySelectorAll('#historyFilters .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const filtered = type === 'all' ? ALL_TRANSACTIONS : ALL_TRANSACTIONS.filter(t => t.type === type || t.type === type + '_refund');
  renderHistoryList(filtered);
}

function renderHistoryList(transactions) {
  if (!transactions.length) {
    document.getElementById('historyList').innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">📭</div>
        <h3 style="color:#64748b;">Sem transações</h3>
      </div>`;
    return;
  }
  document.getElementById('historyList').innerHTML = transactions.map(t => {
    const config = typeConfig[t.type] || { icon: '💸', bg: '#f1f5f9', label: t.type };
    const isIncome = t.amount > 0;
    return `
      <div class="history-item">
        <div class="history-icon" style="background:${config.bg};">${config.icon}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;">${config.label}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${t.description || ''}</div>
          <div style="font-size:12px;color:#64748b;">${formatDate(t.createdAt)}</div>
        </div>
        <div class="history-amount ${isIncome ? 'income' : 'expense'}">
          ${isIncome ? '+' : ''}${formatKz(Math.abs(t.amount))}
        </div>
      </div>`;
  }).join('');
}

// ============ PAGE: TASKS ============
let TASKS_DATA = null;
let tasksCountdownInterval = null;

async function loadTasksPage() {
  if (!requireAuth()) return;
  if (tasksCountdownInterval) { clearInterval(tasksCountdownInterval); tasksCountdownInterval = null; }

  const r = await api('/tasks/today');
  if (!r.success) {
    document.getElementById('tasksVipInfo').style.display = 'none';
    document.getElementById('tasksCountdownCard').style.display = 'none';
    document.getElementById('tasksList').innerHTML = '';

    if (r.requireDeposit) {
      showTasksEmptyState('💰', 'Realize um Depósito', 'Para acessar as tarefas, faça seu primeiro depósito agora!', 'Depositar Agora', 'deposit');
    } else if (r.requireVip) {
      showTasksEmptyState('👑', 'Compre um Plano VIP', 'Para começar a realizar tarefas, escolha um plano VIP!', 'Ver Planos VIP', 'vip');
    } else {
      toast(r.message, 'error');
    }
    return;
  }

  TASKS_DATA = r;
  document.getElementById('tasksEmptyState').style.display = 'none';
  document.getElementById('tasksVipInfo').style.display = 'block';
  document.getElementById('tasksCountdownCard').style.display = 'block';
  document.getElementById('tasksVipName').textContent = r.vipName;
  document.getElementById('tasksDailyProfit').textContent = formatKz(r.dailyProfit);
  document.getElementById('tasksCounter').textContent = `${r.completed}/${r.total}`;

  // Renderizar lista de tarefas
  document.getElementById('tasksList').innerHTML = r.tasks.map(t => `
    <div class="task-card ${t.completed ? 'completed' : ''}" ${!t.completed ? `onclick="startTaskAnimation(${t.number})"` : ''} style="${t.completed ? 'cursor:default;' : ''}">
      <div class="task-icon">${t.completed ? '✅' : '#' + t.number}</div>
      <div class="task-info">
        <div class="task-name">Tarefa #${t.number}</div>
        <div class="task-reward">+${formatKz(t.reward)}</div>
      </div>
      <div class="task-status">${t.completed ? 'Concluída ✓' : 'Iniciar →'}</div>
    </div>
  `).join('');

  startTasksCountdown(r.secondsUntilReset);
}

function showTasksEmptyState(icon, title, desc, btnText, page) {
  document.getElementById('tasksEmptyState').style.display = 'block';
  document.getElementById('tasksEmptyState').innerHTML = `
    <div class="card" style="text-align:center;padding:40px 20px;">
      <div style="font-size:64px;margin-bottom:16px;">${icon}</div>
      <h3 style="font-size:20px;font-weight:800;margin-bottom:8px;">${title}</h3>
      <p style="color:#64748b;margin-bottom:20px;">${desc}</p>
      <a onclick="navigate('${page}')" class="btn btn-primary" style="cursor:pointer;">${btnText}</a>
    </div>`;
}

function startTasksCountdown(seconds) {
  if (tasksCountdownInterval) clearInterval(tasksCountdownInterval);
  let s = seconds;
  function update() {
    if (s <= 0) {
      clearInterval(tasksCountdownInterval);
      document.getElementById('tasksCountdown').textContent = '00:00:00';
      toast('🎉 Novas tarefas disponíveis!', 'success');
      setTimeout(() => loadTasksPage(), 1000);
      return;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    document.getElementById('tasksCountdown').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    s--;
  }
  update();
  tasksCountdownInterval = setInterval(update, 1000);
}

// Animação profissional de 5 segundos
function startTaskAnimation(taskNum) {
  if (!TASKS_DATA) return;

  showModal(`
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:18px;font-weight:800;margin-bottom:4px;">📋 Tarefa #${taskNum}</div>
      <div style="color:#64748b;margin-bottom:8px;">Processando tarefa...</div>
      <div class="progress-circle">
        <svg width="120" height="120">
          <circle cx="60" cy="60" r="54" class="progress-bg"/>
          <circle cx="60" cy="60" r="54" class="progress-fg" id="taskProgressCircle"/>
        </svg>
        <div class="progress-text" id="taskProgressText">5</div>
      </div>
      <div style="margin-top:16px;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:12px;border-radius:12px;font-weight:700;font-size:14px;">
          🔄 Analisando dados...
        </div>
      </div>
      <div style="margin-top:12px;background:linear-gradient(135deg,#10b981,#06b6d4);color:white;padding:14px;border-radius:14px;font-weight:700;">
        💰 Recompensa: +${formatKz(TASKS_DATA.rewardPerTask)}
      </div>
    </div>
  `);

  // Animação suave de 5 segundos
  const totalCircumference = 339.292;
  const duration = 5000;
  const interval = 50;
  const steps = duration / interval;
  let currentStep = 0;

  const statusMessages = [
    '🔄 Analisando dados...',
    '📊 Verificando conta...',
    '⚡ Processando tarefa...',
    '🔐 Validando segurança...',
    '✨ Quase pronto...'
  ];

  const timer = setInterval(() => {
    currentStep++;
    const progress = currentStep / steps;
    const offset = totalCircumference * (1 - progress);

    const circle = document.getElementById('taskProgressCircle');
    const text = document.getElementById('taskProgressText');
    if (circle) circle.style.strokeDashoffset = offset;

    const secondsLeft = Math.ceil(5 - (currentStep * interval / 1000));
    if (text) text.textContent = secondsLeft > 0 ? secondsLeft : '✓';

    // Atualizar mensagem de status
    const msgIndex = Math.min(Math.floor(progress * statusMessages.length), statusMessages.length - 1);
    const statusEl = document.querySelector('.modal div[style*="Analisando"], .modal div[style*="Verificando"], .modal div[style*="Processando"], .modal div[style*="Validando"], .modal div[style*="Quase"]');

    if (currentStep >= steps) {
      clearInterval(timer);
      completeTaskRequest();
    }
  }, interval);
}

async function completeTaskRequest() {
  const r = await api('/tasks/complete', { method: 'POST' });
  closeModal();

  if (r.success) {
    // Modal de sucesso com animação
    showModal(`
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:64px;animation:scaleIn 0.5s ease;">🎉</div>
        <div style="font-size:24px;font-weight:800;margin:12px 0;color:#10b981;">Parabéns!</div>
        <div style="font-size:32px;font-weight:900;color:#6366f1;margin:16px 0;">+${formatKz(r.reward)}</div>
        <div style="color:#64748b;margin-bottom:20px;">
          ${r.remaining > 0
            ? `Você ainda tem <strong>${r.remaining}</strong> tarefa${r.remaining > 1 ? 's' : ''} hoje!`
            : 'Todas as tarefas de hoje concluídas! 🎊'}
        </div>
        <div style="background:#f0fdf4;padding:14px;border-radius:12px;margin-bottom:16px;">
          <div style="font-size:13px;color:#059669;font-weight:600;">
            ✅ ${r.completed}/${r.total} tarefas concluídas
          </div>
        </div>
        <button class="btn btn-primary" onclick="closeModal();loadTasksPage();">Continuar</button>
      </div>
    `);
    setTimeout(() => { closeModal(); loadTasksPage(); }, 4000);
  } else {
    toast(r.message, 'error');
    loadTasksPage();
  }
}

// ============ PAGE: VIP ============
async function loadVipPage() {
  if (!requireAuth()) return;
  await loadSettings();

  const [plansRes, dashRes] = await Promise.all([api('/vip/plans'), api('/user/dashboard')]);
  const currentLevel = dashRes.data?.vipLevel || 0;

  if (dashRes.success && currentLevel > 0) {
    document.getElementById('vipCurrentTag').style.display = 'block';
    document.getElementById('vipCurrentName').textContent = dashRes.data.vipName;
  } else {
    document.getElementById('vipCurrentTag').style.display = 'none';
  }

  // Atualizar valores dinâmicos das regras
  if (APP_SETTINGS) {
    document.getElementById('vipMinW').textContent = formatKz(APP_SETTINGS.minWithdraw);
    document.getElementById('vipFeeW').textContent = APP_SETTINGS.withdrawFee + '%';
    const fee = APP_SETTINGS.withdrawFee || 8;
    document.getElementById('vipFeeExample').textContent = fee;
    document.getElementById('vipFeeValue').textContent = `-${formatKz(10000 * fee / 100)}`;
    document.getElementById('vipNetValue').textContent = formatKz(10000 - (10000 * fee / 100));
  }

  if (!plansRes.success) return;

  document.getElementById('vipPlansList').innerHTML = plansRes.plans.map(p => {
    const colorClass = `v${Math.min(p.level, 10)}`;
    const isCurrent = p.level === currentLevel;
    const isHigher = p.level > currentLevel;

    let actionBtn = '';
    if (isCurrent) {
      actionBtn = '<button class="btn btn-secondary mt-16" disabled>✅ VIP Atual</button>';
    } else if (isHigher) {
      if (!dashRes.data?.hasEverDeposited) {
        actionBtn = `<a onclick="navigate('deposit')" class="btn btn-primary mt-16" style="cursor:pointer;">💰 Faça um Depósito Primeiro</a>`;
      } else {
        actionBtn = `<button class="btn btn-primary mt-16" onclick="subscribeVIP(${p.level},'${p.name}',${p.price})">🚀 Ativar ${p.name} — ${p.price.toLocaleString()} Kz</button>`;
      }
    } else {
      actionBtn = '<button class="btn btn-secondary mt-16" disabled>Plano Inferior</button>';
    }

    return `
      <div class="vip-card ${isCurrent ? 'active-vip' : ''}">
        <div class="vip-card-header ${colorClass}">
          ${isCurrent ? '<div class="vip-badge current">Seu Atual</div>' : ''}
          <div style="font-size:20px;font-weight:800;">${p.name}</div>
          <div style="font-size:28px;font-weight:900;margin:8px 0;">${p.price.toLocaleString()} Kz</div>
          <div style="font-size:13px;opacity:0.9;">${p.tasksPerDay} tarefa${p.tasksPerDay > 1 ? 's' : ''} por dia</div>
        </div>
        <div class="vip-card-body">
          <div class="vip-info-row"><span class="vip-info-label">Tarefas por dia</span><span class="vip-info-value">${p.tasksPerDay}</span></div>
          <div class="vip-info-row"><span class="vip-info-label">Recompensa por tarefa</span><span class="vip-info-value">${p.rewardPerTask.toLocaleString()} Kz</span></div>
          <div class="vip-info-row"><span class="vip-info-label">Lucro diário</span><span class="vip-info-value" style="color:#10b981;">${p.dailyProfit.toLocaleString()} Kz</span></div>
          <div class="vip-info-row"><span class="vip-info-label">Lucro mensal (aprox.)</span><span class="vip-info-value" style="color:#10b981;">${(p.dailyProfit * 30).toLocaleString()} Kz</span></div>
          ${actionBtn}
        </div>
      </div>`;
  }).join('');
}

async function subscribeVIP(level, name, price) {
  if (!confirm(`Ativar ${name} por ${price.toLocaleString()} Kz?\n\nO valor será descontado da sua carteira de depósito.`)) return;
  const r = await api('/vip/subscribe', { method: 'POST', body: JSON.stringify({ level }) });
  if (r.success) {
    toast(`🎉 ${name} ativado com sucesso!`, 'success');
    setTimeout(() => loadVipPage(), 1500);
  } else toast(r.message, 'error');
}

// ============ PAGE: TEAM ============
async function loadTeamPage() {
  if (!requireAuth()) return;
  const r = await api('/team/info');
  if (!r.success) return;
  const d = r.data;
  const levelColors = ['#6366f1', '#8b5cf6', '#ec4899'];

  document.getElementById('teamTotalCommission').textContent = formatKz(d.totalCommission);
  document.getElementById('teamTotalReg').textContent = d.totalRegistered;
  document.getElementById('teamTotalAct').textContent = d.totalActive;
  document.getElementById('teamInviteCode').value = d.inviteCode;
  document.getElementById('teamInviteLink').value = d.inviteLink;

  document.getElementById('teamLevelsList').innerHTML = d.levels.map((l, i) => `
    <div class="level-card">
      <div class="level-badge" style="background:${levelColors[i] || '#94a3b8'};">L${l.level}</div>
      <div style="flex:1;">
        <strong>Nível ${l.level}</strong>
        <div style="font-size:12px;color:#64748b;">Registados: ${l.registered} · VIPs: ${l.active}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:800;color:${levelColors[i]}">${l.commission}%</div>
      </div>
    </div>
  `).join('');
}

// ============ PAGE: PROFILE ============
async function loadProfilePage() {
  if (!requireAuth()) return;
  const r = await api('/user/dashboard');
  if (!r.success) return;
  const d = r.data;

  document.getElementById('profileUserName').textContent = d.nickname;
  document.getElementById('profileUserId').textContent = d.userId;
  document.getElementById('profileUserPhone').textContent = d.phone;
  document.getElementById('profileAvatar').textContent = d.nickname.charAt(0).toUpperCase();
  document.getElementById('profileTotalAssets').textContent = formatKz(d.totalAssets);
  document.getElementById('profileDepW').textContent = formatKz(d.depositWallet);
  document.getElementById('profileWitW').textContent = formatKz(d.withdrawWallet);
  document.getElementById('profileVipLevel').textContent = d.vipLevel;
  document.getElementById('profileNextVip').textContent = Math.min(d.vipLevel + 1, 10);
  document.getElementById('profileVipBar').style.width = Math.min(100, (d.vipLevel / 10) * 100) + '%';
}

// Profile Modals
function showChangePasswordModal() {
  showModal(`
    <h3 class="modal-title">🔒 Alterar Senha</h3>
    <div class="input-group"><label class="input-label">Senha Atual</label><input id="cpOldPw" type="password" class="input" required></div>
    <div class="input-group"><label class="input-label">Nova Senha (mín. 6 caracteres)</label><input id="cpNewPw" type="password" class="input" required minlength="6"></div>
    <button class="btn btn-primary" onclick="doChangePassword()">Salvar</button>
  `);
}

async function doChangePassword() {
  const oldPassword = document.getElementById('cpOldPw').value;
  const newPassword = document.getElementById('cpNewPw').value;
  if (!oldPassword || !newPassword) return toast('Preencha todos os campos', 'error');
  const r = await api('/user/change-password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) });
  if (r.success) { toast(r.message, 'success'); closeModal(); }
  else toast(r.message, 'error');
}

function showWithdrawPasswordModal() {
  showModal(`
    <h3 class="modal-title">🔐 Senha de Retirada</h3>
    <div class="input-group"><label class="input-label">Nova Senha (6 dígitos)</label><input id="wpNew" type="password" class="input" maxlength="6" placeholder="Ex: 123456" required></div>
    <div class="input-group"><label class="input-label">Confirmar Senha</label><input id="wpConf" type="password" class="input" maxlength="6" required></div>
    <button class="btn btn-primary" onclick="doWithdrawPassword()">Definir</button>
  `);
}

async function doWithdrawPassword() {
  const newPassword = document.getElementById('wpNew').value;
  const confirmPassword = document.getElementById('wpConf').value;
  if (!newPassword || !confirmPassword) return toast('Preencha todos os campos', 'error');
  const r = await api('/user/withdraw-password', { method: 'PUT', body: JSON.stringify({ newPassword, confirmPassword }) });
  if (r.success) { toast(r.message, 'success'); closeModal(); }
  else toast(r.message, 'error');
}

function showBankInfoModal() {
  showModal(`
    <h3 class="modal-title">🏦 Dados Bancários</h3>
    <div class="input-group"><label class="input-label">Nome Completo *</label><input id="biName" class="input" maxlength="100"></div>
    <div class="input-group"><label class="input-label">IBAN *</label><input id="biIban" class="input" placeholder="AO06..." maxlength="50"></div>
    <div class="input-group">
      <label class="input-label">Nome do Banco *</label>
      <select id="biBank" class="input">
        <option value="">Selecione</option>
        <option value="BFA">BFA</option>
        <option value="BAI">BAI</option>
        <option value="BIC">BIC</option>
        <option value="ATL">ATL</option>
        <option value="BCI">BCI</option>
      </select>
    </div>
    <button class="btn btn-primary" onclick="doBankInfo()">Salvar</button>
  `);

  // Preencher dados existentes
  api('/user/profile').then(r => {
    if (r.success && r.user.bankInfo) {
      const bi = r.user.bankInfo;
      if (bi.accountName) document.getElementById('biName').value = bi.accountName;
      if (bi.iban) document.getElementById('biIban').value = bi.iban;
      if (bi.bank) document.getElementById('biBank').value = bi.bank;
    }
  });
}

async function doBankInfo() {
  const accountName = document.getElementById('biName').value.trim();
  const iban = document.getElementById('biIban').value.trim();
  const bank = document.getElementById('biBank').value;
  if (!accountName || !iban || !bank) return toast('Preencha Nome Completo, IBAN e Nome do Banco', 'error');
  const r = await api('/user/bank-info', { method: 'PUT', body: JSON.stringify({ bank, iban, accountName }) });
  if (r.success) { toast(r.message, 'success'); closeModal(); }
  else toast(r.message, 'error');
}

// ============ PAGE: BLOG ============
async function loadBlogPage() {
  const r = await api('/blog');
  if (!r.success) return;

  document.getElementById('blogPostsList').innerHTML = r.blogs.length ? r.blogs.map(b => `
    <div class="blog-post">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div class="blog-avatar">${b.author.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-weight:700;font-size:15px;">${b.author}</div>
          <div style="font-size:12px;color:#94a3b8;">${formatDate(b.createdAt)}</div>
        </div>
      </div>
      <div style="font-size:14px;line-height:1.6;color:#334155;">${b.message}</div>
      ${b.image ? `<img src="${b.image}" style="width:100%;border-radius:14px;margin-top:12px;">` : ''}
      ${b.reward ? `<div style="color:#10b981;font-weight:800;margin-top:10px;">💰 Recompensa: ${formatKz(b.reward)}</div>` : ''}
    </div>
  `).join('') : `
    <div style="text-align:center;padding:40px;">
      <div style="font-size:48px;">📝</div>
      <p style="color:#64748b;margin-top:12px;">Nenhum post ainda</p>
    </div>`;
}

function openCreateBlogPost() {
  if (!requireAuth()) return;
  showModal(`
    <h3 class="modal-title">✏️ Criar Post</h3>
    <div class="input-group"><textarea id="blogPostMsg" class="textarea" placeholder="O que deseja compartilhar?" rows="4" maxlength="2000"></textarea></div>
    <div class="input-group"><input type="file" id="blogPostImg" accept="image/*" class="input"></div>
    <button class="btn btn-primary" onclick="submitBlogPost()">Publicar</button>
  `);
}

async function submitBlogPost() {
  const msg = document.getElementById('blogPostMsg').value;
  if (!msg.trim()) return toast('Escreva algo', 'error');
  const fd = new FormData();
  fd.append('message', msg);
  const img = document.getElementById('blogPostImg')?.files[0];
  if (img) fd.append('image', img);
  const r = await api('/blog/create', { method: 'POST', body: fd });
  if (r.success) { toast('Post enviado para aprovação!', 'success'); closeModal(); loadBlogPage(); }
  else toast(r.message, 'error');
}

// ============ PAGE: ABOUT ============
async function loadAboutPage() {
  await loadSettings();
  if (APP_SETTINGS) {
    document.getElementById('aboutContent').textContent = APP_SETTINGS.aboutUs || 'Informação em breve...';
    if (APP_SETTINGS.socialLinks?.whatsappSupport) document.getElementById('aboutWaLink').href = APP_SETTINGS.socialLinks.whatsappSupport;
    if (APP_SETTINGS.socialLinks?.telegramSupport) document.getElementById('aboutTgLink').href = APP_SETTINGS.socialLinks.telegramSupport;
  }
}

// ============================================================
// GLOBAL CSS INJECTION
// ============================================================
const GLOBAL_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
body { background: #f0f4f8; color: #1a1a1a; min-height: 100vh; padding-bottom: 80px; overflow-x: hidden; }
a { text-decoration: none; color: inherit; }
button { cursor: pointer; border: none; font-family: inherit; }
input, select, textarea { font-family: inherit; outline: none; }
img { max-width: 100%; display: block; }

:root {
  --primary: #6366f1; --primary-dark: #4f46e5; --secondary: #8b5cf6; --accent: #ec4899;
  --success: #10b981; --danger: #ef4444; --warning: #f59e0b; --info: #06b6d4;
  --gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  --bg: #f0f4f8; --card: #ffffff; --text: #1e293b; --text-light: #64748b; --border: #e2e8f0;
  --shadow: 0 4px 20px rgba(99,102,241,0.08); --shadow-lg: 0 10px 40px rgba(99,102,241,0.2);
}

.container { max-width: 480px; margin: 0 auto; padding: 16px; }
.header { background: var(--gradient); color: white; padding: 20px 16px; position: relative; border-radius: 0 0 32px 32px; box-shadow: var(--shadow-lg); }
.header h1 { font-size: 22px; font-weight: 800; text-align: center; }
.header-back { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; }

.card { background: var(--card); border-radius: 20px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
.card-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: var(--text); }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: 14px 24px; border-radius: 16px; font-size: 15px; font-weight: 700; transition: all 0.2s; width: 100%; gap: 8px; }
.btn-primary { background: var(--gradient); color: white; box-shadow: 0 4px 20px rgba(99,102,241,0.4); }
.btn-primary:hover { transform: translateY(-2px); }
.btn-success { background: linear-gradient(135deg, #10b981, #06b6d4); color: white; }
.btn-danger { background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; }
.btn-secondary { background: #f1f5f9; color: var(--text); }
.btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
.btn-sm { padding: 8px 16px; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.input-group { margin-bottom: 16px; }
.input-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
.input { width: 100%; padding: 14px 18px; border: 2px solid var(--border); border-radius: 14px; font-size: 15px; background: white; transition: all 0.2s; }
.input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.input-icon { position: relative; }
.input-icon .icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 18px; }
.input-icon input { padding-left: 48px; }
.input-prefix { position: relative; }
.input-prefix .prefix { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-light); font-weight: 600; }
.input-prefix input { padding-left: 60px; }
.textarea { width: 100%; padding: 14px 18px; border: 2px solid var(--border); border-radius: 14px; font-size: 15px; resize: vertical; min-height: 100px; }

.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; padding: 10px 0 12px; box-shadow: 0 -4px 20px rgba(0,0,0,0.08); display: flex; justify-content: space-around; z-index: 100; max-width: 480px; margin: 0 auto; border-radius: 24px 24px 0 0; }
.nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 6px; color: var(--text-light); font-size: 11px; gap: 2px; transition: all 0.2s; }
.nav-item.active { color: var(--primary); }
.nav-item.active .nav-icon { transform: scale(1.2); }
.nav-icon { font-size: 22px; transition: transform 0.2s; }
.nav-label { font-weight: 600; }

.toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--text); color: white; padding: 14px 24px; border-radius: 16px; z-index: 10000; box-shadow: var(--shadow-lg); animation: slideDown 0.3s ease; max-width: 90%; font-weight: 600; text-align: center; }
.toast.success { background: linear-gradient(135deg, #10b981, #06b6d4); }
.toast.error { background: linear-gradient(135deg, #f59e0b, #ef4444); }
.toast.warning { background: linear-gradient(135deg, #ec4899, #f59e0b); }
@keyframes slideDown { from { transform: translate(-50%, -100px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.spinner { width: 50px; height: 50px; border: 4px solid #e2e8f0; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 20px auto; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 9999; }
.loading-overlay.show { display: flex; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 9000; padding: 16px; }
.modal-overlay.show { display: flex; }
.modal { background: white; border-radius: 24px; padding: 24px; max-width: 420px; width: 100%; max-height: 90vh; overflow-y: auto; animation: scaleIn 0.2s; }
.modal-title { font-size: 20px; font-weight: 800; margin-bottom: 16px; color: var(--text); }

.badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; }
.badge-pending { background: #fef3c7; color: #d97706; }
.badge-approved { background: #d1fae5; color: #059669; }
.badge-rejected { background: #fee2e2; color: #dc2626; }

.mt-8 { margin-top: 8px; } .mt-16 { margin-top: 16px; } .mt-24 { margin-top: 24px; }
`;

// Injetar CSS
if (!document.getElementById('kwanzapay-css')) {
  const style = document.createElement('style');
  style.id = 'kwanzapay-css';
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

// ============================================================
// INICIALIZAÇÃO DA APP
// ============================================================
(function initApp() {
  // Determinar página inicial baseada na URL
  const hash = window.location.hash.replace('#/', '').split('?')[0];
  const validPages = Object.keys(PAGE_LOADERS);

  let startPage = 'home';
  if (hash && validPages.includes(hash)) {
    startPage = hash;
  }

  // Se precisa auth e não está logado, ir para login
  if (AUTH_REQUIRED.includes(startPage) && !isLoggedIn()) {
    startPage = 'login';
  }

  // Se está logado e tenta acessar login/register, ir para home
  if ((startPage === 'login' || startPage === 'register') && isLoggedIn()) {
    startPage = 'home';
  }

  navigate(startPage);
})();
