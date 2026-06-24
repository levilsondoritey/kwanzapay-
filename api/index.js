// ============================================================
// KwanzaPay v2.0 — Backend Completo e Seguro
// api/index.js — PARTE 1/3
// ============================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// SEGURANÇA — Pacotes de proteção
// ============================================================
let helmet, rateLimit, mongoSanitize, hpp;
try { helmet = require('helmet'); } catch(e) { helmet = null; }
try { rateLimit = require('express-rate-limit'); } catch(e) { rateLimit = null; }
try { mongoSanitize = require('express-mongo-sanitize'); } catch(e) { mongoSanitize = null; }
try { hpp = require('hpp'); } catch(e) { hpp = null; }

const app = express();

// ============================================================
// SEGURANÇA — Configurações
// ============================================================

// Helmet — Headers de segurança HTTP
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
}

// CORS — Restringir origens
const allowedOrigins = [
  process.env.SITE_URL || 'http://localhost:5000',
  'http://localhost:5000',
  'http://localhost:3000'
];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true); // Em produção, pode restringir mais
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser com limite
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Sanitização contra NoSQL Injection
if (mongoSanitize) app.use(mongoSanitize({ replaceWith: '_' }));

// Proteção contra HTTP Parameter Pollution
if (hpp) app.use(hpp());

// Rate Limiting — Anti brute force
if (rateLimit) {
  // Limite global: 200 req/min por IP
  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { success: false, message: 'Muitas requisições. Aguarde 1 minuto.' },
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Limite para login/register: 10 req/15min por IP
  app.use('/api/auth/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Muitas tentativas. Aguarde 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
  }));

  // Limite para saques: 5 req/15min por IP
  app.use('/api/withdraw/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Limite de saques atingido. Aguarde.' },
    standardHeaders: true,
    legacyHeaders: false
  }));
}

// Header de segurança customizado
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
});

// ============================================================
// MONGODB — Conexão
// ============================================================
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  })
  .then(() => { console.log('✅ MongoDB conectado'); setTimeout(seedData, 2000); })
  .catch(err => console.error('❌ MongoDB:', err.message));
}

// ============================================================
// UPLOAD — Configuração segura
// ============================================================
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      if (!allowed.includes(ext)) return cb(new Error('Tipo de arquivo não permitido'));
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'), false);
  }
});

// ============================================================
// HELPERS — Sanitização de input
// ============================================================
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>\"\'&]/g, c => ({
    '<': '&lt;', '>': '&gt;', '"': '&quot;',
    "'": '&#x27;', '&': '&amp;'
  }[c] || c)).trim();
}

function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') clean[k] = sanitize(v);
    else if (typeof v === 'object' && v !== null && !Array.isArray(v)) clean[k] = sanitizeObj(v);
    else clean[k] = v;
  }
  return clean;
}

// ============================================================
// MODELS — Schemas do MongoDB
// ============================================================

const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true, maxlength: 50 },
  phone: { type: String, required: true, unique: true, maxlength: 20 },
  password: { type: String, required: true, minlength: 6 },
  withdrawPassword: String,
  inviteCode: { type: String, unique: true, uppercase: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  depositWallet: { type: Number, default: 0 },
  withdrawWallet: { type: Number, default: 0 },
  totalAssets: { type: Number, default: 0 },
  totalDeposited: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  vipLevel: { type: Number, default: 0 },
  vipPurchaseDate: Date,
  tasksCompletedToday: { type: Number, default: 0 },
  lastTaskReset: Date,
  hasEverDeposited: { type: Boolean, default: false },
  bankInfo: {
    bank: { type: String, maxlength: 50 },
    iban: { type: String, maxlength: 50 },
    accountName: { type: String, maxlength: 100 }
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  createdAt: { type: Date, default: Date.now }
});

// Índices para performance
userSchema.index({ phone: 1 });
userSchema.index({ inviteCode: 1 });
userSchema.index({ invitedBy: 1 });
userSchema.index({ role: 1, status: 1 });

// Pre-save: hash de senhas + geração de código de convite
userSchema.pre('save', async function(next) {
  if (!this.inviteCode) {
    let code;
    do { code = Math.random().toString(36).substring(2, 8).toUpperCase(); }
    while (await mongoose.models.User?.findOne({ inviteCode: code }));
    this.inviteCode = code;
  }
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
  if (this.isModified('withdrawPassword') && this.withdrawPassword) {
    this.withdrawPassword = await bcrypt.hash(this.withdrawPassword, 12);
  }
  next();
});

userSchema.methods.matchPassword = function(pw) { return bcrypt.compare(pw, this.password); };
userSchema.methods.matchWithdrawPassword = function(pw) {
  return this.withdrawPassword ? bcrypt.compare(pw, this.withdrawPassword) : false;
};

// Proteção contra brute force no login
userSchema.methods.incLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 }; // 30 min lock
  }
  return this.updateOne(updates);
};

const vipPlanSchema = new mongoose.Schema({
  level: { type: Number, required: true, unique: true },
  name: { type: String, maxlength: 50 },
  price: Number,
  tasksPerDay: Number,
  rewardPerTask: Number,
  dailyProfit: Number,
  active: { type: Boolean, default: true }
});
vipPlanSchema.index({ level: 1 });

const taskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  taskNumber: Number,
  reward: Number,
  completedAt: { type: Date, default: Date.now }
});

const depositSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['bank', 'entity', 'kwik'], default: 'bank' },
  proof: String,
  orderId: { type: String, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  adminNote: String,
  paymentInfo: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  processedAt: Date
});
depositSchema.pre('save', function(next) {
  if (!this.orderId) this.orderId = 'DEP' + Date.now() + Math.floor(Math.random() * 1000);
  next();
});

const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: Number,
  fee: Number,
  netAmount: Number,
  bank: String,
  iban: String,
  accountName: String,
  orderId: { type: String, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  adminNote: String,
  createdAt: { type: Date, default: Date.now },
  processedAt: Date
});
withdrawalSchema.pre('save', function(next) {
  if (!this.orderId) this.orderId = 'WTH' + Date.now() + Math.floor(Math.random() * 1000);
  next();
});

const blogSchema = new mongoose.Schema({
  author: { type: String, maxlength: 50 },
  message: { type: String, maxlength: 2000 },
  image: String,
  reward: { type: Number, default: 0 },
  approved: { type: Boolean, default: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, index: true },
  amount: Number,
  balanceBefore: Number,
  balanceAfter: Number,
  description: { type: String, maxlength: 200 },
  reference: String,
  createdAt: { type: Date, default: Date.now }
});
transactionSchema.index({ user: 1, createdAt: -1 });

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  title: { type: String, maxlength: 100 },
  message: { type: String, maxlength: 500 },
  read: { type: Boolean, default: false },
  forAdmin: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'KwanzaPay' },
  minDeposit: { type: Number, default: 5000 },
  maxDeposit: { type: Number, default: 2000000 },
  minWithdraw: { type: Number, default: 1200 },
  maxWithdraw: { type: Number, default: 2000000 },
  withdrawFee: { type: Number, default: 8 },
  paymentMethods: {
    bankTransfer: { type: Boolean, default: true },
    entityReference: { type: Boolean, default: true },
    kwik: { type: Boolean, default: true }
  },
  banks: [{
    bankCode: String, bankName: String, logo: String,
    active: { type: Boolean, default: true },
    ibans: [{
      iban: String, accountName: String, accountNumber: String,
      active: { type: Boolean, default: true }
    }]
  }],
  entityReference: {
    entity: { type: String, default: '11333' },
    references: [{ reference: String, active: { type: Boolean, default: true } }],
    instructionImage: String, instructions: String
  },
  kwik: {
    numbers: [{ number: String, name: String, active: { type: Boolean, default: true } }],
    instructionImage: String, instructions: String
  },
  withdrawBanks: [{ code: String, name: String, active: { type: Boolean, default: true } }],
  commissionLevel1: { type: Number, default: 30 },
  commissionLevel2: { type: Number, default: 2 },
  commissionLevel3: { type: Number, default: 1 },
  socialLinks: {
    telegramGroup: String, telegramSupport: String,
    whatsappGroup: String, whatsappSupport: String
  },
  aboutUs: { type: String, default: '' }
});

// ============================================================
// REGISTRAR MODELS
// ============================================================
const User = mongoose.model('User', userSchema);
const VipPlan = mongoose.model('VipPlan', vipPlanSchema);
const Task = mongoose.model('Task', taskSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const Blog = mongoose.model('Blog', blogSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// ============================================================
// AUTH — JWT + Middlewares de proteção
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'kwanzapay_2026_fallback_secret';
const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ success: false, message: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password -withdrawPassword');
    if (!req.user) return res.status(401).json({ success: false, message: 'Utilizador não encontrado' });
    if (req.user.status === 'banned') return res.status(403).json({ success: false, message: 'Conta suspensa' });
    next();
  } catch(e) {
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso restrito ao administrador' });
  next();
};

// Comissões multinível
async function payCommissions(user, amount) {
  try {
    const s = await Settings.findOne() || {};
    const levels = [s.commissionLevel1 || 30, s.commissionLevel2 || 2, s.commissionLevel3 || 1];
    let current = user;
    for (let i = 0; i < 3; i++) {
      if (!current.invitedBy) break;
      const ref = await User.findById(current.invitedBy);
      if (!ref) break;
      const c = Math.round((amount * levels[i]) / 100);
      if (c <= 0) { current = ref; continue; }
      const before = ref.withdrawWallet;
      ref.withdrawWallet += c;
      ref.totalEarned += c;
      ref.totalAssets = ref.depositWallet + ref.withdrawWallet;
      await ref.save();
      await Transaction.create({
        user: ref._id, type: 'commission', amount: c,
        balanceBefore: before, balanceAfter: ref.withdrawWallet,
        description: `Comissão nível ${i + 1} de ${sanitize(user.nickname)}`
      });
      current = ref;
    }
  } catch (e) { console.error('Erro comissões:', e.message); }
}

// >>> CONTINUA NA PARTE 3 (Rotas Auth, User, VIP, Tasks, Deposits, Withdraw, Admin, Seed) >>>
// ============================================================
// ROTAS — AUTH (Login, Register, Admin Login)
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nickname, phone, password, inviteCode } = sanitizeObj(req.body);
    if (!nickname || !phone || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ success: false, message: 'Senha mín. 6 caracteres' });
    if (typeof phone !== 'string' || phone.length < 9 || phone.length > 20) return res.status(400).json({ success: false, message: 'Telefone inválido' });
    if (await User.findOne({ phone })) return res.status(400).json({ success: false, message: 'Telefone já cadastrado' });

    let invitedBy = null;
    if (inviteCode) {
      const inviter = await User.findOne({ inviteCode: inviteCode.toUpperCase() });
      if (!inviter) return res.status(400).json({ success: false, message: 'Código de convite inválido' });
      invitedBy = inviter._id;
    }

    const user = await User.create({ nickname: nickname.substring(0, 50), phone, password, invitedBy });
    await Notification.create({ type: 'system', title: 'Novo Utilizador', message: `${sanitize(nickname)} (${phone})`, forAdmin: true });

    res.json({ success: true, token: generateToken(user._id), user: { id: user._id, nickname: user.nickname, phone, inviteCode: user.inviteCode } });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'Telefone já cadastrado' });
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = sanitizeObj(req.body);
    if (!phone || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });

    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });

    // Verificar lock de brute force
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Conta bloqueada. Tente em ${mins} minutos.` });
    }

    if (user.status === 'banned') return res.status(403).json({ success: false, message: 'Conta suspensa pelo administrador' });

    if (!await user.matchPassword(password)) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    // Reset login attempts on success
    if (user.loginAttempts > 0) {
      await user.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
    }

    user.lastLogin = new Date();
    await user.save();

    res.json({ success: true, token: generateToken(user._id), user: { id: user._id, nickname: user.nickname, phone, role: user.role, inviteCode: user.inviteCode } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = sanitizeObj(req.body);
    if (!email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@kwanzapay.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@2026';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    let admin = await User.findOne({ role: 'admin', phone: 'admin' });
    if (!admin) admin = await User.create({ nickname: 'Admin', phone: 'admin', password: adminPassword, role: 'admin' });

    return res.json({ success: true, token: generateToken(admin._id), user: { id: admin._id, nickname: 'Admin', role: 'admin' } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// ============================================================
// ROTAS — USER (Dashboard, Profile, Passwords, Bank Info)
// ============================================================

app.get('/api/user/dashboard', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const vipPlan = user.vipLevel > 0 ? await VipPlan.findOne({ level: user.vipLevel }) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
    if (lastReset) lastReset.setHours(0, 0, 0, 0);
    if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); await user.save(); }

    res.json({ success: true, data: {
      nickname: user.nickname,
      userId: user._id.toString().slice(-6).toUpperCase(),
      phone: user.phone,
      totalAssets: user.totalAssets,
      depositWallet: user.depositWallet,
      withdrawWallet: user.withdrawWallet,
      vipLevel: user.vipLevel,
      vipName: vipPlan?.name || 'Sem VIP',
      tasksPerDay: vipPlan?.tasksPerDay || 0,
      tasksCompletedToday: user.tasksCompletedToday,
      tasksRemaining: vipPlan ? Math.max(0, vipPlan.tasksPerDay - user.tasksCompletedToday) : 0,
      rewardPerTask: vipPlan?.rewardPerTask || 0,
      dailyProfit: vipPlan?.dailyProfit || 0,
      totalEarned: user.totalEarned,
      totalDeposited: user.totalDeposited,
      hasEverDeposited: user.hasEverDeposited,
      hasWithdrawPassword: !!user.withdrawPassword,
      inviteCode: user.inviteCode
    }});
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/user/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -withdrawPassword');
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/user/change-password', protect, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
    if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ success: false, message: 'Nova senha mín. 6 caracteres' });
    const user = await User.findById(req.user._id);
    if (!await user.matchPassword(oldPassword)) return res.status(400).json({ success: false, message: 'Senha atual incorreta' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/user/withdraw-password', protect, async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'Senhas não coincidem' });
    if (!/^\d{6}$/.test(newPassword)) return res.status(400).json({ success: false, message: 'A senha deve ter exactamente 6 dígitos numéricos' });
    const user = await User.findById(req.user._id);
    user.withdrawPassword = newPassword;
    await user.save();
    res.json({ success: true, message: 'Senha de retirada definida com sucesso' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/user/bank-info', protect, async (req, res) => {
  try {
    const { bank, iban, accountName } = sanitizeObj(req.body);
    if (!bank || !iban || !accountName) return res.status(400).json({ success: false, message: 'Preencha Nome Completo, IBAN e Nome do Banco' });
    const user = await User.findById(req.user._id);
    user.bankInfo = { bank: bank.substring(0, 50), iban: iban.substring(0, 50), accountName: accountName.substring(0, 100) };
    await user.save();
    res.json({ success: true, message: 'Dados bancários salvos com sucesso' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/user/wallet-history', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, transactions });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — VIP (Planos + Subscrição)
// ============================================================

app.get('/api/vip/plans', async (req, res) => {
  try {
    const plans = await VipPlan.find({ active: true }).sort({ level: 1 });
    res.json({ success: true, plans });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/vip/subscribe', protect, async (req, res) => {
  try {
    const { level } = req.body;
    if (!level || typeof level !== 'number') return res.status(400).json({ success: false, message: 'Nível inválido' });

    const plan = await VipPlan.findOne({ level, active: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plano não encontrado' });

    const user = await User.findById(req.user._id);
    if (!user.hasEverDeposited) return res.status(400).json({ success: false, message: 'Faça um depósito primeiro' });
    if (user.depositWallet < plan.price) return res.status(400).json({ success: false, message: 'Saldo insuficiente na carteira de depósito' });
    if (user.vipLevel >= level) return res.status(400).json({ success: false, message: 'Já possui este VIP ou superior' });

    const before = user.depositWallet;
    user.depositWallet -= plan.price;
    user.vipLevel = level;
    user.vipPurchaseDate = new Date();
    user.tasksCompletedToday = 0;
    user.lastTaskReset = new Date();
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();

    await Transaction.create({ user: user._id, type: 'vip_purchase', amount: -plan.price, balanceBefore: before, balanceAfter: user.depositWallet, description: `Compra ${plan.name}` });
    await payCommissions(user, plan.price);

    res.json({ success: true, message: `${plan.name} ativado com sucesso!`, plan });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — TASKS (Tarefas diárias)
// ============================================================

app.get('/api/tasks/today', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.hasEverDeposited) return res.json({ success: false, requireDeposit: true, message: 'Faça um depósito primeiro' });
    if (user.vipLevel === 0) return res.json({ success: false, requireVip: true, message: 'Compre um plano VIP' });

    const plan = await VipPlan.findOne({ level: user.vipLevel });
    if (!plan) return res.json({ success: false, message: 'Plano VIP não encontrado' });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
    if (lastReset) lastReset.setHours(0, 0, 0, 0);
    if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); await user.save(); }

    const tasks = [];
    for (let i = 1; i <= plan.tasksPerDay; i++) {
      tasks.push({ number: i, reward: plan.rewardPerTask, completed: i <= user.tasksCompletedToday });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const secondsUntilReset = Math.floor((tomorrow - new Date()) / 1000);

    res.json({ success: true, tasks, completed: user.tasksCompletedToday, total: plan.tasksPerDay, rewardPerTask: plan.rewardPerTask, dailyProfit: plan.dailyProfit, vipName: plan.name, secondsUntilReset });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/tasks/complete', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.hasEverDeposited) return res.status(400).json({ success: false, message: 'Faça um depósito primeiro' });
    if (user.vipLevel === 0) return res.status(400).json({ success: false, message: 'Compre um plano VIP' });

    const plan = await VipPlan.findOne({ level: user.vipLevel });
    if (!plan) return res.status(400).json({ success: false, message: 'Plano não encontrado' });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
    if (lastReset) lastReset.setHours(0, 0, 0, 0);
    if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); }
    if (user.tasksCompletedToday >= plan.tasksPerDay) return res.status(400).json({ success: false, message: 'Todas as tarefas de hoje foram concluídas. Volte amanhã!' });

    user.tasksCompletedToday += 1;
    const before = user.withdrawWallet;
    user.withdrawWallet += plan.rewardPerTask;
    user.totalEarned += plan.rewardPerTask;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();

    await Task.create({ user: user._id, taskNumber: user.tasksCompletedToday, reward: plan.rewardPerTask });
    await Transaction.create({ user: user._id, type: 'task_reward', amount: plan.rewardPerTask, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Tarefa ${user.tasksCompletedToday}/${plan.tasksPerDay}` });

    res.json({ success: true, message: `+${plan.rewardPerTask} Kz`, reward: plan.rewardPerTask, completed: user.tasksCompletedToday, total: plan.tasksPerDay, remaining: plan.tasksPerDay - user.tasksCompletedToday });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — DEPOSITS (Depósito)
// ============================================================

app.get('/api/deposit/payment-info/:method', protect, async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return res.status(400).json({ success: false });
    const { method } = req.params;

    if (method === 'bank') {
      const banks = (settings.banks || []).filter(b => b.active && b.ibans.some(i => i.active));
      return res.json({ success: true, banks });
    }
    if (method === 'entity') {
      return res.json({ success: true, entity: settings.entityReference?.entity, references: (settings.entityReference?.references || []).filter(r => r.active), instructionImage: settings.entityReference?.instructionImage, instructions: settings.entityReference?.instructions });
    }
    if (method === 'kwik') {
      return res.json({ success: true, numbers: (settings.kwik?.numbers || []).filter(n => n.active), instructionImage: settings.kwik?.instructionImage, instructions: settings.kwik?.instructions });
    }
    res.status(400).json({ success: false, message: 'Método inválido' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/deposit/create', protect, async (req, res) => {
  try {
    const { amount, method, bankId } = req.body;
    const settings = await Settings.findOne();
    if (!settings) return res.status(400).json({ success: false, message: 'Configurações não encontradas' });
    if (!amount || amount < settings.minDeposit || amount > settings.maxDeposit) return res.status(400).json({ success: false, message: `Valor entre ${settings.minDeposit} e ${settings.maxDeposit} Kz` });

    let paymentInfo = {};
    if (method === 'bank') {
      const bank = settings.banks.id(bankId);
      if (!bank) return res.status(400).json({ success: false, message: 'Banco não encontrado' });
      const ibans = bank.ibans.filter(i => i.active);
      if (!ibans.length) return res.status(400).json({ success: false, message: 'Sem IBANs disponíveis' });
      const sel = ibans[Math.floor(Math.random() * ibans.length)];
      paymentInfo = { bank: bank.bankName, accountName: sel.accountName, accountNumber: sel.accountNumber, iban: sel.iban };
    } else if (method === 'entity') {
      const refs = (settings.entityReference?.references || []).filter(r => r.active);
      if (!refs.length) return res.status(400).json({ success: false, message: 'Sem referências disponíveis' });
      const r = refs[Math.floor(Math.random() * refs.length)];
      paymentInfo = { entity: settings.entityReference.entity, reference: r.reference };
    } else if (method === 'kwik') {
      const nums = (settings.kwik?.numbers || []).filter(n => n.active);
      if (!nums.length) return res.status(400).json({ success: false, message: 'Sem números KWIK disponíveis' });
      const n = nums[Math.floor(Math.random() * nums.length)];
      paymentInfo = { kwikNumber: n.number, kwikName: n.name };
    } else {
      return res.status(400).json({ success: false, message: 'Método de pagamento inválido' });
    }

    const deposit = await Deposit.create({ user: req.user._id, amount, method, paymentInfo });
    res.json({ success: true, deposit, countdown: 30 * 60 });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/deposit/upload-proof', protect, upload.single('proof'), async (req, res) => {
  try {
    const { depositId } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'Envie uma imagem' });
    const deposit = await Deposit.findOne({ _id: depositId, user: req.user._id });
    if (!deposit) return res.status(404).json({ success: false, message: 'Depósito não encontrado' });
    deposit.proof = `/uploads/${req.file.filename}`;
    await deposit.save();
    await Notification.create({ type: 'deposit', title: 'Comprovante Recebido', message: `${req.user.nickname}: ${deposit.amount} Kz`, forAdmin: true });
    res.json({ success: true, message: 'Comprovante enviado com sucesso' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/deposit/mark-paid', protect, async (req, res) => {
  try {
    const deposit = await Deposit.findOne({ _id: req.body.depositId, user: req.user._id });
    if (!deposit) return res.status(404).json({ success: false, message: 'Depósito não encontrado' });
    await Notification.create({ type: 'deposit', title: 'Pagamento Informado', message: `${req.user.nickname}: ${deposit.amount} Kz — Aguardando confirmação`, forAdmin: true });
    res.json({ success: true, message: 'Pagamento informado. Aguarde aprovação do administrador.' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/deposit/my', protect, async (req, res) => {
  try {
    const deposits = await Deposit.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, deposits });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — WITHDRAW (Saque)
// ============================================================

app.post('/api/withdraw/create', protect, async (req, res) => {
  try {
    const { amount, bank, iban, accountName, withdrawPassword } = sanitizeObj(req.body);
    const settings = await Settings.findOne();
    if (!settings) return res.status(400).json({ success: false, message: 'Configurações não encontradas' });

    if (!amount || !bank || !iban || !accountName || !withdrawPassword) return res.status(400).json({ success: false, message: 'Preencha todos os campos obrigatórios (Nome Completo, IBAN, Banco e Senha)' });
    if (amount < settings.minWithdraw || amount > settings.maxWithdraw) return res.status(400).json({ success: false, message: `Valor entre ${settings.minWithdraw} e ${settings.maxWithdraw} Kz` });

    const user = await User.findById(req.user._id);
    if (!user.withdrawPassword) return res.status(400).json({ success: false, message: 'Defina sua senha de retirada no perfil primeiro' });
    if (!await user.matchWithdrawPassword(withdrawPassword)) return res.status(401).json({ success: false, message: 'Senha de retirada incorreta' });
    if (user.withdrawWallet < amount) return res.status(400).json({ success: false, message: 'Saldo insuficiente na carteira de retirada' });

    const fee = Math.round((amount * settings.withdrawFee) / 100);
    const netAmount = amount - fee;
    const before = user.withdrawWallet;
    user.withdrawWallet -= amount;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();

    const w = await Withdrawal.create({ user: user._id, amount, fee, netAmount, bank: bank.substring(0, 50), iban: iban.substring(0, 50), accountName: accountName.substring(0, 100) });
    await Transaction.create({ user: user._id, type: 'withdraw', amount: -amount, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Saque ${w.orderId}` });
    await Notification.create({ type: 'withdraw', title: 'Novo Saque', message: `${user.nickname}: ${amount} Kz → ${bank} ${iban}`, forAdmin: true });

    res.json({ success: true, message: 'Saque solicitado com sucesso. Será processado em até 24h.', withdrawal: w });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/withdraw/my', protect, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/withdraw/banks', protect, async (req, res) => {
  try {
    const s = await Settings.findOne();
    res.json({ success: true, banks: (s?.withdrawBanks || []).filter(b => b.active) });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — TEAM (Equipe e Comissões)
// ============================================================

app.get('/api/team/info', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const s = await Settings.findOne() || {};

    const commissions = await Transaction.aggregate([{ $match: { user: user._id, type: 'commission' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const l1 = await User.find({ invitedBy: user._id });
    const l1Active = l1.filter(u => u.vipLevel > 0).length;
    const l1Ids = l1.map(u => u._id);
    const l2 = await User.find({ invitedBy: { $in: l1Ids } });
    const l2Active = l2.filter(u => u.vipLevel > 0).length;
    const l2Ids = l2.map(u => u._id);
    const l3 = await User.find({ invitedBy: { $in: l2Ids } });
    const l3Active = l3.filter(u => u.vipLevel > 0).length;

    res.json({ success: true, data: {
      inviteCode: user.inviteCode,
      inviteLink: `${process.env.SITE_URL || 'http://localhost:5000'}/#/register?ref=${user.inviteCode}`,
      totalCommission: commissions[0]?.total || 0,
      totalRegistered: l1.length + l2.length + l3.length,
      totalActive: l1Active + l2Active + l3Active,
      levels: [
        { level: 1, registered: l1.length, active: l1Active, commission: s.commissionLevel1 || 30 },
        { level: 2, registered: l2.length, active: l2Active, commission: s.commissionLevel2 || 2 },
        { level: 3, registered: l3.length, active: l3Active, commission: s.commissionLevel3 || 1 }
      ]
    }});
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — BLOG
// ============================================================

app.get('/api/blog', async (req, res) => {
  try {
    const blogs = await Blog.find({ approved: true }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, blogs });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/blog/create', protect, upload.single('image'), async (req, res) => {
  try {
    const message = sanitize(req.body.message || '');
    if (!message || message.length < 2) return res.status(400).json({ success: false, message: 'Escreva uma mensagem' });
    const blog = await Blog.create({ author: req.user.nickname, message: message.substring(0, 2000), image: req.file ? `/uploads/${req.file.filename}` : null, user: req.user._id, approved: false });
    res.json({ success: true, blog, message: 'Post enviado para aprovação' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — SETTINGS PÚBLICO
// ============================================================

app.get('/api/settings', async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json({ success: true, settings: {
      siteName: s.siteName, socialLinks: s.socialLinks, aboutUs: s.aboutUs,
      minDeposit: s.minDeposit, maxDeposit: s.maxDeposit,
      minWithdraw: s.minWithdraw, maxWithdraw: s.maxWithdraw,
      withdrawFee: s.withdrawFee, paymentMethods: s.paymentMethods,
      withdrawBanks: (s.withdrawBanks || []).filter(b => b.active)
    }});
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// >>> CONTINUA NA PARTE 4 (Rotas Admin completas + Seed Data) >>>
// ============================================================
// ROTAS — ADMIN DASHBOARD
// ============================================================

app.get('/api/admin/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsers = await User.countDocuments({ role: 'user', status: 'active' });
    const bannedUsers = await User.countDocuments({ status: 'banned' });
    const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
    const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });

    const [td, tw] = await Promise.all([
      Deposit.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Withdrawal.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayUsers = await User.countDocuments({ createdAt: { $gte: todayStart } });
    const todayDeposits = await Deposit.countDocuments({ createdAt: { $gte: todayStart }, status: 'approved' });
    const todayWithdrawals = await Withdrawal.countDocuments({ createdAt: { $gte: todayStart }, status: 'approved' });

    res.json({ success: true, stats: {
      totalUsers, activeUsers, bannedUsers, pendingDeposits, pendingWithdrawals,
      totalDeposited: td[0]?.total || 0, totalWithdrawn: tw[0]?.total || 0,
      profit: (td[0]?.total || 0) - (tw[0]?.total || 0),
      todayUsers, todayDeposits, todayWithdrawals
    }});
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN USERS
// ============================================================

app.get('/api/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const filter = { role: 'user' };
    if (search) {
      const s = sanitize(search);
      filter.$or = [
        { nickname: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { inviteCode: { $regex: s.toUpperCase(), $options: 'i' } }
      ];
    }
    if (status) filter.status = status;
    const users = await User.find(filter).select('-password -withdrawPassword').populate('invitedBy', 'nickname phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await User.countDocuments(filter);
    res.json({ success: true, users, total });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -withdrawPassword').populate('invitedBy', 'nickname phone');
    if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
    const deposits = await Deposit.find({ user: user._id }).sort({ createdAt: -1 }).limit(10);
    const withdrawals = await Withdrawal.find({ user: user._id }).sort({ createdAt: -1 }).limit(10);
    const referrals = await User.find({ invitedBy: user._id }).select('nickname phone vipLevel createdAt');
    res.json({ success: true, user, deposits, withdrawals, referrals });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
    const { nickname, phone, vipLevel, depositWallet, withdrawWallet, hasEverDeposited } = req.body;
    if (nickname !== undefined) user.nickname = sanitize(String(nickname)).substring(0, 50);
    if (phone !== undefined) user.phone = sanitize(String(phone)).substring(0, 20);
    if (vipLevel !== undefined) user.vipLevel = Math.max(0, Math.min(10, parseInt(vipLevel) || 0));
    if (depositWallet !== undefined) user.depositWallet = Math.max(0, parseFloat(depositWallet) || 0);
    if (withdrawWallet !== undefined) user.withdrawWallet = Math.max(0, parseFloat(withdrawWallet) || 0);
    if (hasEverDeposited !== undefined) user.hasEverDeposited = !!hasEverDeposited;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/users/:id/adjust', protect, adminOnly, async (req, res) => {
  try {
    const { type, wallet, amount, note } = req.body;
    if (!type || !wallet || !amount) return res.status(400).json({ success: false, message: 'Dados incompletos' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
    const field = wallet === 'deposit' ? 'depositWallet' : 'withdrawWallet';
    const before = user[field];
    const val = Math.abs(parseFloat(amount) || 0);
    if (type === 'add') { user[field] += val; }
    else { if (user[field] < val) return res.status(400).json({ success: false, message: 'Saldo insuficiente' }); user[field] -= val; }
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    await Transaction.create({ user: user._id, type: type === 'add' ? 'admin_add' : 'admin_remove', amount: type === 'add' ? val : -val, balanceBefore: before, balanceAfter: user[field], description: sanitize(note || 'Ajuste administrativo').substring(0, 200) });
    res.json({ success: true, message: 'Saldo ajustado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/users/:id/ban', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false });
    user.status = user.status === 'banned' ? 'active' : 'banned';
    await user.save();
    res.json({ success: true, message: user.status });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Não pode eliminar administrador' });
    await Promise.all([
      Deposit.deleteMany({ user: user._id }),
      Withdrawal.deleteMany({ user: user._id }),
      Transaction.deleteMany({ user: user._id }),
      Task.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id })
    ]);
    await user.deleteOne();
    res.json({ success: true, message: 'Utilizador eliminado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN DEPOSITS (Confirmar/Rejeitar)
// ============================================================

app.get('/api/admin/deposits', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const deposits = await Deposit.find(filter).populate('user', 'nickname phone bankInfo').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, deposits });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/deposits/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const d = await Deposit.findById(req.params.id).populate('user');
    if (!d || d.status !== 'pending') return res.status(400).json({ success: false, message: 'Depósito não encontrado ou já processado' });
    const user = d.user;
    const before = user.depositWallet;
    user.depositWallet += d.amount;
    user.totalDeposited += d.amount;
    user.hasEverDeposited = true;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    d.status = 'approved';
    d.processedAt = new Date();
    await d.save();
    await Transaction.create({ user: user._id, type: 'deposit', amount: d.amount, balanceBefore: before, balanceAfter: user.depositWallet, description: `Depósito ${d.orderId} aprovado` });
    await Notification.create({ user: user._id, type: 'deposit', title: '✅ Depósito Aprovado', message: `${d.amount} Kz creditado na sua conta` });
    res.json({ success: true, message: 'Depósito aprovado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/deposits/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const d = await Deposit.findById(req.params.id).populate('user');
    if (!d || d.status !== 'pending') return res.status(400).json({ success: false, message: 'Depósito não encontrado ou já processado' });
    d.status = 'rejected';
    d.processedAt = new Date();
    d.adminNote = sanitize(req.body.note || 'Rejeitado pelo administrador').substring(0, 200);
    await d.save();
    await Notification.create({ user: d.user._id, type: 'deposit', title: '❌ Depósito Rejeitado', message: d.adminNote });
    res.json({ success: true, message: 'Depósito rejeitado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN WITHDRAWALS (Confirmar/Rejeitar)
// ============================================================

app.get('/api/admin/withdrawals', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const withdrawals = await Withdrawal.find(filter).populate('user', 'nickname phone bankInfo').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, withdrawals });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/withdrawals/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const w = await Withdrawal.findById(req.params.id).populate('user');
    if (!w || w.status !== 'pending') return res.status(400).json({ success: false, message: 'Saque não encontrado ou já processado' });
    w.status = 'approved';
    w.processedAt = new Date();
    await w.save();
    w.user.totalWithdrawn += w.amount;
    await w.user.save();
    await Notification.create({ user: w.user._id, type: 'withdraw', title: '✅ Saque Aprovado', message: `${w.netAmount} Kz enviado para ${w.bank} — ${w.iban}` });
    res.json({ success: true, message: 'Saque aprovado e pago' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/withdrawals/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const w = await Withdrawal.findById(req.params.id).populate('user');
    if (!w || w.status !== 'pending') return res.status(400).json({ success: false, message: 'Saque não encontrado ou já processado' });
    const user = w.user;
    const before = user.withdrawWallet;
    user.withdrawWallet += w.amount;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    w.status = 'rejected';
    w.processedAt = new Date();
    w.adminNote = sanitize(req.body.note || 'Rejeitado pelo administrador').substring(0, 200);
    await w.save();
    await Transaction.create({ user: user._id, type: 'withdraw_refund', amount: w.amount, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Reembolso ${w.orderId}` });
    await Notification.create({ user: user._id, type: 'withdraw', title: '↩️ Saque Rejeitado', message: `${w.amount} Kz devolvido. Motivo: ${w.adminNote}` });
    res.json({ success: true, message: 'Saque rejeitado e valor devolvido' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN VIP PLANS (Gerenciar VIPs)
// ============================================================

app.get('/api/admin/vip-plans', protect, adminOnly, async (req, res) => {
  try {
    const plans = await VipPlan.find().sort({ level: 1 });
    res.json({ success: true, plans });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/vip-plans', protect, adminOnly, async (req, res) => {
  try {
    const { level, name, price, tasksPerDay, rewardPerTask, dailyProfit } = req.body;
    if (!level || !name || !price) return res.status(400).json({ success: false, message: 'Preencha nível, nome e preço' });
    if (await VipPlan.findOne({ level })) return res.status(400).json({ success: false, message: 'Este nível já existe' });
    const plan = await VipPlan.create({ level, name: sanitize(name).substring(0, 50), price, tasksPerDay: tasksPerDay || 1, rewardPerTask: rewardPerTask || 0, dailyProfit: dailyProfit || 0 });
    res.json({ success: true, plan });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/vip-plans/:id', protect, adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'price', 'tasksPerDay', 'rewardPerTask', 'dailyProfit', 'active'];
    const updates = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = key === 'name' ? sanitize(String(req.body[key])).substring(0, 50) : req.body[key]; }
    const plan = await VipPlan.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!plan) return res.status(404).json({ success: false });
    res.json({ success: true, plan });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/vip-plans/:id', protect, adminOnly, async (req, res) => {
  try {
    await VipPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Plano VIP eliminado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN SETTINGS
// ============================================================

app.get('/api/admin/settings', protect, adminOnly, async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    res.json({ success: true, settings: s });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/settings', protect, adminOnly, async (req, res) => {
  try {
    let s = await Settings.findOne();
    if (!s) s = new Settings({});
    const safe = ['siteName', 'minDeposit', 'maxDeposit', 'minWithdraw', 'maxWithdraw', 'withdrawFee', 'paymentMethods', 'socialLinks', 'commissionLevel1', 'commissionLevel2', 'commissionLevel3', 'aboutUs'];
    for (const key of safe) { if (req.body[key] !== undefined) s[key] = req.body[key]; }
    await s.save();
    res.json({ success: true, settings: s });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN BANKS / IBANs
// ============================================================

app.post('/api/admin/banks', protect, adminOnly, async (req, res) => {
  try {
    let s = await Settings.findOne(); if (!s) s = new Settings({});
    if (s.banks.find(b => b.bankCode === req.body.bankCode)) return res.status(400).json({ success: false, message: 'Banco já existe' });
    s.banks.push({ bankCode: sanitize(req.body.bankCode).toUpperCase(), bankName: sanitize(req.body.bankName), logo: req.body.logo || '', ibans: [], active: true });
    await s.save();
    res.json({ success: true, message: 'Banco adicionado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/banks/:bankId', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    const bank = s.banks.id(req.params.bankId);
    if (!bank) return res.status(404).json({ success: false });
    if (req.body.bankName) bank.bankName = sanitize(req.body.bankName);
    if (req.body.active !== undefined) bank.active = req.body.active;
    if (req.body.logo !== undefined) bank.logo = req.body.logo;
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/banks/:bankId', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.banks.id(req.params.bankId)?.deleteOne();
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/banks/:bankId/ibans', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    const bank = s.banks.id(req.params.bankId);
    if (!bank) return res.status(404).json({ success: false });
    if (bank.ibans.length >= 6) return res.status(400).json({ success: false, message: 'Máximo 6 IBANs por banco' });
    bank.ibans.push({ iban: sanitize(req.body.iban), accountName: sanitize(req.body.accountName), accountNumber: sanitize(req.body.accountNumber || ''), active: true });
    await s.save();
    res.json({ success: true, message: 'IBAN adicionado' });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/banks/:bankId/ibans/:ibanId', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    const iban = s.banks.id(req.params.bankId)?.ibans.id(req.params.ibanId);
    if (!iban) return res.status(404).json({ success: false });
    if (req.body.active !== undefined) iban.active = req.body.active;
    if (req.body.iban) iban.iban = sanitize(req.body.iban);
    if (req.body.accountName) iban.accountName = sanitize(req.body.accountName);
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/banks/:bankId/ibans/:ibanId', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.banks.id(req.params.bankId)?.ibans.id(req.params.ibanId)?.deleteOne();
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN ENTITY / KWIK
// ============================================================

app.put('/api/admin/entity-reference', protect, adminOnly, async (req, res) => {
  try {
    let s = await Settings.findOne(); if (!s) s = new Settings({});
    if (req.body.entity) s.entityReference.entity = sanitize(req.body.entity);
    if (req.body.instructionImage !== undefined) s.entityReference.instructionImage = req.body.instructionImage;
    if (req.body.instructions !== undefined) s.entityReference.instructions = req.body.instructions;
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/references', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.entityReference.references.push({ reference: sanitize(req.body.reference), active: true });
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/references/:id', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.entityReference.references.id(req.params.id)?.deleteOne();
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/kwik', protect, adminOnly, async (req, res) => {
  try {
    let s = await Settings.findOne(); if (!s) s = new Settings({});
    if (req.body.instructionImage !== undefined) s.kwik.instructionImage = req.body.instructionImage;
    if (req.body.instructions !== undefined) s.kwik.instructions = req.body.instructions;
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/kwik/numbers', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.kwik.numbers.push({ number: sanitize(req.body.number), name: sanitize(req.body.name), active: true });
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/kwik/numbers/:id', protect, adminOnly, async (req, res) => {
  try {
    const s = await Settings.findOne();
    s.kwik.numbers.id(req.params.id)?.deleteOne();
    await s.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// ROTAS — ADMIN NOTIFICATIONS / BROADCAST / BLOG
// ============================================================

app.get('/api/admin/notifications', protect, adminOnly, async (req, res) => {
  try {
    const notifications = await Notification.find({ forAdmin: true }).sort({ createdAt: -1 }).limit(50);
    const unread = await Notification.countDocuments({ forAdmin: true, read: false });
    res.json({ success: true, notifications, unread });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/notifications/:id/read', protect, adminOnly, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/broadcast', protect, adminOnly, async (req, res) => {
  try {
    const { title, message } = sanitizeObj(req.body);
    if (!title || !message) return res.status(400).json({ success: false, message: 'Preencha título e mensagem' });
    const users = await User.find({ role: 'user', status: 'active' }).select('_id');
    if (users.length > 0) {
      await Notification.insertMany(users.map(u => ({ user: u._id, type: 'system', title: title.substring(0, 100), message: message.substring(0, 500) })));
    }
    res.json({ success: true, message: `Enviado para ${users.length} utilizadores` });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.get('/api/admin/blogs', protect, adminOnly, async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, blogs });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/blogs', protect, adminOnly, async (req, res) => {
  try {
    const blog = await Blog.create({ author: sanitize(req.body.author || 'Admin').substring(0, 50), message: sanitize(req.body.message || '').substring(0, 2000), image: req.body.image || null, reward: parseFloat(req.body.reward) || 0, approved: true });
    res.json({ success: true, blog });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.put('/api/admin/blogs/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    await Blog.findByIdAndUpdate(req.params.id, { approved: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.delete('/api/admin/blogs/:id', protect, adminOnly, async (req, res) => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

app.post('/api/admin/upload', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
  } catch (e) { res.status(500).json({ success: false, message: 'Erro interno' }); }
});

// ============================================================
// SEED DATA — Dados iniciais
// ============================================================

async function seedData() {
  try {
    // Admin
    if (!await User.findOne({ role: 'admin' })) {
      await User.create({ nickname: 'Admin', phone: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@2026', role: 'admin' });
      console.log('✅ Admin criado');
    }

    // VIP Plans
    if (await VipPlan.countDocuments() === 0) {
      await VipPlan.insertMany([
        { level: 1, name: 'VIP 1', price: 5000, tasksPerDay: 1, rewardPerTask: 250, dailyProfit: 250 },
        { level: 2, name: 'VIP 2', price: 10000, tasksPerDay: 2, rewardPerTask: 250, dailyProfit: 500 },
        { level: 3, name: 'VIP 3', price: 25000, tasksPerDay: 3, rewardPerTask: 417, dailyProfit: 1250 },
        { level: 4, name: 'VIP 4', price: 50000, tasksPerDay: 4, rewardPerTask: 625, dailyProfit: 2500 },
        { level: 5, name: 'VIP 5', price: 100000, tasksPerDay: 5, rewardPerTask: 1000, dailyProfit: 5000 },
        { level: 6, name: 'VIP 6', price: 250000, tasksPerDay: 6, rewardPerTask: 2083, dailyProfit: 12500 },
        { level: 7, name: 'VIP 7', price: 500000, tasksPerDay: 7, rewardPerTask: 3571, dailyProfit: 25000 },
        { level: 8, name: 'VIP 8', price: 1000000, tasksPerDay: 8, rewardPerTask: 6250, dailyProfit: 50000 },
        { level: 9, name: 'VIP 9', price: 1500000, tasksPerDay: 9, rewardPerTask: 8333, dailyProfit: 75000 },
        { level: 10, name: 'VIP 10', price: 2000000, tasksPerDay: 10, rewardPerTask: 10000, dailyProfit: 100000 }
      ]);
      console.log('✅ Planos VIP criados');
    }

    // Settings
    if (!await Settings.findOne()) {
      await Settings.create({
        siteName: 'KwanzaPay',
        banks: [
          { bankCode: 'BFA', bankName: 'Banco BFA', ibans: [], active: true },
          { bankCode: 'BAI', bankName: 'Banco BAI', ibans: [], active: true },
          { bankCode: 'BIC', bankName: 'Banco BIC', ibans: [], active: true },
          { bankCode: 'ATL', bankName: 'Banco ATL', ibans: [], active: true },
          { bankCode: 'BCI', bankName: 'Banco BCI', ibans: [], active: true }
        ],
        withdrawBanks: [
          { code: 'BFA', name: 'BFA', active: true },
          { code: 'BAI', name: 'BAI', active: true },
          { code: 'BIC', name: 'BIC', active: true },
          { code: 'ATL', name: 'ATL', active: true },
          { code: 'BCI', name: 'BCI', active: true }
        ],
        entityReference: { entity: '11333', references: [] },
        kwik: { numbers: [] },
        aboutUs: '🌟 KwanzaPay — A Plataforma Líder em Angola 🌟\n\nTarefas diárias simples para ganhar dinheiro.\nSaques rápidos em 24h.\nSuporte 24/7.\nAté 30% de comissão por convites.\n\n🇦🇴 Plataforma para Angolanos. Feito para Si.'
      });
      console.log('✅ Configurações criadas');
    }

    console.log('🎉 Seed completo!');
  } catch (e) { console.error('Erro no seed:', e.message); }
}

// ============================================================
// TRATAMENTO GLOBAL DE ERROS
// ============================================================

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.message);
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'Ficheiro muito grande (máx. 5MB)' });
    return res.status(400).json({ success: false, message: 'Erro no upload do ficheiro' });
  }
  if (err.message === 'Tipo de arquivo não permitido' || err.message === 'Apenas imagens são permitidas') {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: 'Erro interno do servidor' });
});

// 404 para rotas API não encontradas
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// ============================================================
// EXPORTAR APP
// ============================================================
module.exports = app;
