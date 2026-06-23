require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== MONGODB =====
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => { console.log('✅ MongoDB conectado'); setTimeout(seedData, 2000); })
    .catch(err => console.error('❌ MongoDB:', err.message));
}

// ===== UPLOAD =====
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ===== MODELS =====
const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
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
  bankInfo: { bank: String, iban: String, accountName: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now }
});
userSchema.pre('save', async function(next) {
  if (!this.inviteCode) this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
  if (this.isModified('withdrawPassword') && this.withdrawPassword) this.withdrawPassword = await bcrypt.hash(this.withdrawPassword, 12);
  next();
});
userSchema.methods.matchPassword = function(pw) { return bcrypt.compare(pw, this.password); };
userSchema.methods.matchWithdrawPassword = function(pw) { return this.withdrawPassword ? bcrypt.compare(pw, this.withdrawPassword) : false; };

const vipPlanSchema = new mongoose.Schema({
  level: { type: Number, required: true, unique: true }, name: String, price: Number,
  tasksPerDay: Number, rewardPerTask: Number, dailyProfit: Number,
  active: { type: Boolean, default: true }
});
const taskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  taskNumber: Number, reward: Number, completedAt: { type: Date, default: Date.now }
});
const depositSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['bank', 'entity', 'kwik'], default: 'bank' },
  proof: String, orderId: { type: String, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote: String, paymentInfo: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }, processedAt: Date
});
depositSchema.pre('save', function(next) { if (!this.orderId) this.orderId = 'DEP' + Date.now() + Math.floor(Math.random() * 1000); next(); });

const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: Number, fee: Number, netAmount: Number,
  bank: String, iban: String, accountName: String,
  orderId: { type: String, unique: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote: String, createdAt: { type: Date, default: Date.now }, processedAt: Date
});
withdrawalSchema.pre('save', function(next) { if (!this.orderId) this.orderId = 'WTH' + Date.now() + Math.floor(Math.random() * 1000); next(); });

const blogSchema = new mongoose.Schema({
  author: String, message: String, image: String, reward: { type: Number, default: 0 },
  approved: { type: Boolean, default: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, amount: Number, balanceBefore: Number, balanceAfter: Number,
  description: String, reference: String, createdAt: { type: Date, default: Date.now }
});
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, title: String, message: String,
  read: { type: Boolean, default: false }, forAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const settingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'KwanzaPay' },
  minDeposit: { type: Number, default: 5000 }, maxDeposit: { type: Number, default: 2000000 },
  minWithdraw: { type: Number, default: 1200 }, maxWithdraw: { type: Number, default: 2000000 },
  withdrawFee: { type: Number, default: 8 },
  paymentMethods: {
    bankTransfer: { type: Boolean, default: true },
    entityReference: { type: Boolean, default: true },
    kwik: { type: Boolean, default: true }
  },
  banks: [{ bankCode: String, bankName: String, logo: String, active: { type: Boolean, default: true },
    ibans: [{ iban: String, accountName: String, accountNumber: String, active: { type: Boolean, default: true } }]
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
  commissionLevel1: { type: Number, default: 30 }, commissionLevel2: { type: Number, default: 2 },
  commissionLevel3: { type: Number, default: 1 },
  socialLinks: { telegramGroup: String, telegramSupport: String, whatsappGroup: String, whatsappSupport: String },
  aboutUs: { type: String, default: '' }
});

const User = mongoose.model('User', userSchema);
const VipPlan = mongoose.model('VipPlan', vipPlanSchema);
const Task = mongoose.model('Task', taskSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const Blog = mongoose.model('Blog', blogSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// ===== AUTH =====
const JWT_SECRET = process.env.JWT_SECRET || 'kwanzapay_2026';
const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) token = req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Não autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ success: false, message: 'Não encontrado' });
    if (req.user.status === 'banned') return res.status(403).json({ success: false, message: 'Conta banida' });
    next();
  } catch { return res.status(401).json({ success: false, message: 'Token inválido' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin apenas' });
  next();
};

async function payCommissions(user, amount) {
  try {
    const s = await Settings.findOne() || {};
    const levels = [s.commissionLevel1 || 30, s.commissionLevel2 || 2, s.commissionLevel3 || 1];
    let current = user;
    for (let i = 0; i < 3; i++) {
      if (!current.invitedBy) break;
      const ref = await User.findById(current.invitedBy);
      if (!ref) break;
      const c = (amount * levels[i]) / 100;
      const before = ref.withdrawWallet;
      ref.withdrawWallet += c; ref.totalEarned += c;
      ref.totalAssets = ref.depositWallet + ref.withdrawWallet;
      await ref.save();
      await Transaction.create({ user: ref._id, type: 'commission', amount: c, balanceBefore: before, balanceAfter: ref.withdrawWallet, description: `Comissão nível ${i + 1} de ${user.nickname}` });
      current = ref;
    }
  } catch (e) { console.error(e); }
}

// ===== AUTH ROUTES =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nickname, phone, password, inviteCode } = req.body;
    if (!nickname || !phone || !password) return res.status(400).json({ success: false, message: 'Preencha tudo' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Senha mín. 6 caracteres' });
    if (await User.findOne({ phone })) return res.status(400).json({ success: false, message: 'Telefone já cadastrado' });
    let invitedBy = null;
    if (inviteCode) { const inviter = await User.findOne({ inviteCode: inviteCode.toUpperCase() }); if (!inviter) return res.status(400).json({ success: false, message: 'Código inválido' }); invitedBy = inviter._id; }
    const user = await User.create({ nickname, phone, password, invitedBy });
    await Notification.create({ type: 'system', title: 'Novo Usuário', message: `${nickname} (${phone})`, forAdmin: true });
    res.json({ success: true, token: generateToken(user._id), user: { id: user._id, nickname, phone, inviteCode: user.inviteCode } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    if (user.status === 'banned') return res.status(403).json({ success: false, message: 'Conta banida' });
    if (!await user.matchPassword(password)) return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    user.lastLogin = new Date(); await user.save();
    res.json({ success: true, token: generateToken(user._id), user: { id: user._id, nickname: user.nickname, phone, role: user.role, inviteCode: user.inviteCode } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === (process.env.ADMIN_EMAIL || 'admin@kwanzapay.com') && password === (process.env.ADMIN_PASSWORD || 'Admin@2026')) {
      let admin = await User.findOne({ role: 'admin', phone: 'admin' });
      if (!admin) admin = await User.create({ nickname: 'Admin', phone: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@2026', role: 'admin' });
      return res.json({ success: true, token: generateToken(admin._id), user: { id: admin._id, nickname: 'Admin', role: 'admin' } });
    }
    res.status(401).json({ success: false, message: 'Credenciais inválidas' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== USER =====
app.get('/api/user/dashboard', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  const vipPlan = user.vipLevel > 0 ? await VipPlan.findOne({ level: user.vipLevel }) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
  if (lastReset) lastReset.setHours(0, 0, 0, 0);
  if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); await user.save(); }
  res.json({ success: true, data: { nickname: user.nickname, userId: user._id.toString().slice(-6).toUpperCase(), phone: user.phone, totalAssets: user.totalAssets, depositWallet: user.depositWallet, withdrawWallet: user.withdrawWallet, vipLevel: user.vipLevel, vipName: vipPlan?.name || 'Sem VIP', tasksPerDay: vipPlan?.tasksPerDay || 0, tasksCompletedToday: user.tasksCompletedToday, tasksRemaining: vipPlan ? Math.max(0, vipPlan.tasksPerDay - user.tasksCompletedToday) : 0, rewardPerTask: vipPlan?.rewardPerTask || 0, dailyProfit: vipPlan?.dailyProfit || 0, totalEarned: user.totalEarned, totalDeposited: user.totalDeposited, hasEverDeposited: user.hasEverDeposited, hasWithdrawPassword: !!user.withdrawPassword, inviteCode: user.inviteCode } });
});

app.get('/api/user/profile', protect, async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -withdrawPassword');
  res.json({ success: true, user });
});

app.put('/api/user/change-password', protect, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!await user.matchPassword(oldPassword)) return res.status(400).json({ success: false, message: 'Senha atual incorreta' });
  user.password = newPassword; await user.save();
  res.json({ success: true, message: 'Senha alterada' });
});

app.put('/api/user/withdraw-password', protect, async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'Senhas não coincidem' });
  if (!/^\d{6}$/.test(newPassword)) return res.status(400).json({ success: false, message: '6 dígitos numéricos' });
  const user = await User.findById(req.user._id); user.withdrawPassword = newPassword; await user.save();
  res.json({ success: true, message: 'Senha definida' });
});

app.put('/api/user/bank-info', protect, async (req, res) => {
  const user = await User.findById(req.user._id); user.bankInfo = req.body; await user.save();
  res.json({ success: true, message: 'Salvo' });
});

app.get('/api/user/wallet-history', protect, async (req, res) => {
  const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, transactions });
});

// ===== VIP =====
app.get('/api/vip/plans', async (req, res) => {
  const plans = await VipPlan.find({ active: true }).sort({ level: 1 });
  res.json({ success: true, plans });
});

app.post('/api/vip/subscribe', protect, async (req, res) => {
  try {
    const { level } = req.body;
    const plan = await VipPlan.findOne({ level });
    if (!plan) return res.status(404).json({ success: false, message: 'Não encontrado' });
    const user = await User.findById(req.user._id);
    if (!user.hasEverDeposited) return res.status(400).json({ success: false, message: 'Faça um depósito primeiro' });
    if (user.depositWallet < plan.price) return res.status(400).json({ success: false, message: 'Saldo insuficiente' });
    if (user.vipLevel >= level) return res.status(400).json({ success: false, message: 'Já tem este VIP ou superior' });
    const before = user.depositWallet;
    user.depositWallet -= plan.price; user.vipLevel = level; user.vipPurchaseDate = new Date();
    user.tasksCompletedToday = 0; user.lastTaskReset = new Date();
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    await Transaction.create({ user: user._id, type: 'vip_purchase', amount: -plan.price, balanceBefore: before, balanceAfter: user.depositWallet, description: `Compra ${plan.name}` });
    await payCommissions(user, plan.price);
    res.json({ success: true, message: `${plan.name} ativado!`, plan });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== TASKS =====
app.get('/api/tasks/today', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.hasEverDeposited) return res.json({ success: false, requireDeposit: true, message: 'Faça um depósito' });
  if (user.vipLevel === 0) return res.json({ success: false, requireVip: true, message: 'Compre um VIP' });
  const plan = await VipPlan.findOne({ level: user.vipLevel });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
  if (lastReset) lastReset.setHours(0, 0, 0, 0);
  if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); await user.save(); }
  const tasks = []; for (let i = 1; i <= plan.tasksPerDay; i++) tasks.push({ number: i, reward: plan.rewardPerTask, completed: i <= user.tasksCompletedToday });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  const secondsUntilReset = Math.floor((tomorrow - new Date()) / 1000);
  res.json({ success: true, tasks, completed: user.tasksCompletedToday, total: plan.tasksPerDay, rewardPerTask: plan.rewardPerTask, dailyProfit: plan.dailyProfit, vipName: plan.name, secondsUntilReset });
});

app.post('/api/tasks/complete', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.hasEverDeposited) return res.status(400).json({ success: false, message: 'Faça um depósito' });
    if (user.vipLevel === 0) return res.status(400).json({ success: false, message: 'Compre um VIP' });
    const plan = await VipPlan.findOne({ level: user.vipLevel });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastReset = user.lastTaskReset ? new Date(user.lastTaskReset) : null;
    if (lastReset) lastReset.setHours(0, 0, 0, 0);
    if (!lastReset || today > lastReset) { user.tasksCompletedToday = 0; user.lastTaskReset = new Date(); }
    if (user.tasksCompletedToday >= plan.tasksPerDay) return res.status(400).json({ success: false, message: 'Tarefas concluídas. Volte amanhã!' });
    user.tasksCompletedToday += 1;
    const before = user.withdrawWallet;
    user.withdrawWallet += plan.rewardPerTask; user.totalEarned += plan.rewardPerTask;
    user.totalAssets = user.depositWallet + user.withdrawWallet;
    await user.save();
    await Task.create({ user: user._id, taskNumber: user.tasksCompletedToday, reward: plan.rewardPerTask });
    await Transaction.create({ user: user._id, type: 'task_reward', amount: plan.rewardPerTask, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Tarefa ${user.tasksCompletedToday}/${plan.tasksPerDay}` });
    res.json({ success: true, message: `+${plan.rewardPerTask} Kz`, reward: plan.rewardPerTask, completed: user.tasksCompletedToday, total: plan.tasksPerDay, remaining: plan.tasksPerDay - user.tasksCompletedToday });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ===== DEPOSITS =====
app.get('/api/deposit/payment-info/:method', protect, async (req, res) => {
  const settings = await Settings.findOne();
  const { method } = req.params;
  if (method === 'bank') { const banks = settings.banks.filter(b => b.active && b.ibans.some(i => i.active)); return res.json({ success: true, banks }); }
  if (method === 'entity') return res.json({ success: true, entity: settings.entityReference.entity, references: settings.entityReference.references.filter(r => r.active), instructionImage: settings.entityReference.instructionImage, instructions: settings.entityReference.instructions });
  if (method === 'kwik') return res.json({ success: true, numbers: settings.kwik.numbers.filter(n => n.active), instructionImage: settings.kwik.instructionImage, instructions: settings.kwik.instructions });
  res.status(400).json({ success: false });
});

app.post('/api/deposit/create', protect, async (req, res) => {
  try {
    const { amount, method, bankId } = req.body;
    const settings = await Settings.findOne();
    if (amount < settings.minDeposit || amount > settings.maxDeposit) return res.status(400).json({ success: false, message: `Valor entre ${settings.minDeposit} e ${settings.maxDeposit}` });
    let paymentInfo = {};
    if (method === 'bank') { const bank = settings.banks.id(bankId); if (!bank) return res.status(400).json({ success: false }); const ibans = bank.ibans.filter(i => i.active); if (!ibans.length) return res.status(400).json({ success: false, message: 'Sem IBANs' }); const sel = ibans[Math.floor(Math.random() * ibans.length)]; paymentInfo = { bank: bank.bankName, accountName: sel.accountName, accountNumber: sel.accountNumber, iban: sel.iban }; }
    else if (method === 'entity') { const refs = settings.entityReference.references.filter(r => r.active); if (!refs.length) return res.status(400).json({ success: false }); const r = refs[Math.floor(Math.random() * refs.length)]; paymentInfo = { entity: settings.entityReference.entity, reference: r.reference }; }
    else if (method === 'kwik') { const nums = settings.kwik.numbers.filter(n => n.active); if (!nums.length) return res.status(400).json({ success: false }); const n = nums[Math.floor(Math.random() * nums.length)]; paymentInfo = { kwikNumber: n.number, kwikName: n.name }; }
    const deposit = await Deposit.create({ user: req.user._id, amount, method, paymentInfo });
    res.json({ success: true, deposit, countdown: 30 * 60 });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/deposit/upload-proof', protect, upload.single('proof'), async (req, res) => {
  try {
    const { depositId } = req.body;
    if (!req.file) return res.status(400).json({ success: false });
    const deposit = await Deposit.findOne({ _id: depositId, user: req.user._id });
    if (!deposit) return res.status(404).json({ success: false });
    deposit.proof = `/uploads/${req.file.filename}`; await deposit.save();
    await Notification.create({ type: 'deposit', title: 'Comprovante', message: `${req.user.nickname}: ${deposit.amount} Kz`, forAdmin: true });
    res.json({ success: true, message: 'Comprovante enviado' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/deposit/mark-paid', protect, async (req, res) => {
  const deposit = await Deposit.findOne({ _id: req.body.depositId, user: req.user._id });
  if (!deposit) return res.status(404).json({ success: false });
  await Notification.create({ type: 'deposit', title: 'Aguardando', message: `${req.user.nickname}: ${deposit.amount} Kz`, forAdmin: true });
  res.json({ success: true, message: 'Aguarde aprovação' });
});

app.get('/api/deposit/my', protect, async (req, res) => {
  const deposits = await Deposit.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, deposits });
});

// ===== WITHDRAW =====
app.post('/api/withdraw/create', protect, async (req, res) => {
  try {
    const { amount, bank, iban, accountName, withdrawPassword } = req.body;
    const settings = await Settings.findOne();
    if (!amount || !bank || !iban || !accountName || !withdrawPassword) return res.status(400).json({ success: false, message: 'Preencha tudo' });
    if (amount < settings.minWithdraw || amount > settings.maxWithdraw) return res.status(400).json({ success: false });
    const user = await User.findById(req.user._id);
    if (!user.withdrawPassword) return res.status(400).json({ success: false, message: 'Defina senha de retirada' });
    if (!await user.matchWithdrawPassword(withdrawPassword)) return res.status(401).json({ success: false, message: 'Senha incorreta' });
    if (user.withdrawWallet < amount) return res.status(400).json({ success: false, message: 'Saldo insuficiente' });
    const fee = (amount * settings.withdrawFee) / 100; const netAmount = amount - fee;
    const before = user.withdrawWallet; user.withdrawWallet -= amount;
    user.totalAssets = user.depositWallet + user.withdrawWallet; await user.save();
    const w = await Withdrawal.create({ user: user._id, amount, fee, netAmount, bank, iban, accountName });
    await Transaction.create({ user: user._id, type: 'withdraw', amount: -amount, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Saque ${w.orderId}` });
    await Notification.create({ type: 'withdraw', title: 'Novo Saque', message: `${user.nickname}: ${amount} Kz`, forAdmin: true });
    res.json({ success: true, message: 'Saque solicitado', withdrawal: w });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/withdraw/my', protect, async (req, res) => {
  const withdrawals = await Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, withdrawals });
});

app.get('/api/withdraw/banks', protect, async (req, res) => {
  const s = await Settings.findOne();
  res.json({ success: true, banks: s.withdrawBanks.filter(b => b.active) });
});

// ===== TEAM =====
app.get('/api/team/info', protect, async (req, res) => {
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
  res.json({ success: true, data: { inviteCode: user.inviteCode, inviteLink: `${process.env.SITE_URL || 'http://localhost:5000'}/register.html?ref=${user.inviteCode}`, totalCommission: commissions[0]?.total || 0, totalRegistered: l1.length + l2.length + l3.length, totalActive: l1Active + l2Active + l3Active, levels: [{ level: 1, registered: l1.length, active: l1Active, commission: s.commissionLevel1 || 30 }, { level: 2, registered: l2.length, active: l2Active, commission: s.commissionLevel2 || 2 }, { level: 3, registered: l3.length, active: l3Active, commission: s.commissionLevel3 || 1 }] } });
});

// ===== BLOG =====
app.get('/api/blog', async (req, res) => { const blogs = await Blog.find({ approved: true }).sort({ createdAt: -1 }).limit(50); res.json({ success: true, blogs }); });
app.post('/api/blog/create', protect, upload.single('image'), async (req, res) => { const blog = await Blog.create({ author: req.user.nickname, message: req.body.message, image: req.file ? `/uploads/${req.file.filename}` : null, user: req.user._id, approved: false }); res.json({ success: true, blog }); });

// ===== SETTINGS PUBLICO =====
app.get('/api/settings', async (req, res) => {
  let s = await Settings.findOne(); if (!s) s = await Settings.create({});
  res.json({ success: true, settings: { siteName: s.siteName, socialLinks: s.socialLinks, aboutUs: s.aboutUs, minDeposit: s.minDeposit, maxDeposit: s.maxDeposit, minWithdraw: s.minWithdraw, maxWithdraw: s.maxWithdraw, withdrawFee: s.withdrawFee, paymentMethods: s.paymentMethods, withdrawBanks: s.withdrawBanks?.filter(b => b.active) || [] } });
});

// ===== ADMIN =====
app.get('/api/admin/dashboard', protect, adminOnly, async (req, res) => {
  const totalUsers = await User.countDocuments({ role: 'user' });
  const activeUsers = await User.countDocuments({ role: 'user', status: 'active' });
  const bannedUsers = await User.countDocuments({ status: 'banned' });
  const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
  const pendingWithdrawals = await Withdrawal.countDocuments({ status: 'pending' });
  const [td, tw] = await Promise.all([Deposit.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]), Withdrawal.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])]);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayUsers = await User.countDocuments({ createdAt: { $gte: todayStart } });
  const todayDeposits = await Deposit.countDocuments({ createdAt: { $gte: todayStart }, status: 'approved' });
  const todayWithdrawals = await Withdrawal.countDocuments({ createdAt: { $gte: todayStart }, status: 'approved' });
  res.json({ success: true, stats: { totalUsers, activeUsers, bannedUsers, pendingDeposits, pendingWithdrawals, totalDeposited: td[0]?.total || 0, totalWithdrawn: tw[0]?.total || 0, profit: (td[0]?.total || 0) - (tw[0]?.total || 0), todayUsers, todayDeposits, todayWithdrawals } });
});

app.get('/api/admin/users', protect, adminOnly, async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const filter = { role: 'user' };
  if (search) filter.$or = [{ nickname: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }, { inviteCode: { $regex: search.toUpperCase(), $options: 'i' } }];
  if (status) filter.status = status;
  const users = await User.find(filter).select('-password -withdrawPassword').populate('invitedBy', 'nickname phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
  const total = await User.countDocuments(filter);
  res.json({ success: true, users, total });
});

app.get('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -withdrawPassword').populate('invitedBy', 'nickname phone');
  if (!user) return res.status(404).json({ success: false });
  const deposits = await Deposit.find({ user: user._id }).sort({ createdAt: -1 }).limit(10);
  const withdrawals = await Withdrawal.find({ user: user._id }).sort({ createdAt: -1 }).limit(10);
  const referrals = await User.find({ invitedBy: user._id }).select('nickname phone vipLevel createdAt');
  res.json({ success: true, user, deposits, withdrawals, referrals });
});

app.put('/api/admin/users/:id', protect, adminOnly, async (req, res) => {
  const user = await User.findById(req.params.id);
  const { nickname, phone, vipLevel, depositWallet, withdrawWallet, hasEverDeposited } = req.body;
  if (nickname !== undefined) user.nickname = nickname;
  if (phone !== undefined) user.phone = phone;
  if (vipLevel !== undefined) user.vipLevel = vipLevel;
  if (depositWallet !== undefined) user.depositWallet = depositWallet;
  if (withdrawWallet !== undefined) user.withdrawWallet = withdrawWallet;
  if (hasEverDeposited !== undefined) user.hasEverDeposited = hasEverDeposited;
  user.totalAssets = user.depositWallet + user.withdrawWallet; await user.save();
  res.json({ success: true, user });
});

app.post('/api/admin/users/:id/adjust', protect, adminOnly, async (req, res) => {
  const { type, wallet, amount, note } = req.body;
  const user = await User.findById(req.params.id);
  const field = wallet === 'deposit' ? 'depositWallet' : 'withdrawWallet';
  const before = user[field];
  if (type === 'add') user[field] += parseFloat(amount); else { if (user[field] < amount) return res.status(400).json({ success: false }); user[field] -= parseFloat(amount); }
  user.totalAssets = user.depositWallet + user.withdrawWallet; await user.save();
  await Transaction.create({ user: user._id, type: type === 'add' ? 'admin_add' : 'admin_remove', amount: type === 'add' ? amount : -amount, balanceBefore: before, balanceAfter: user[field], description: note || `Ajuste admin` });
  res.json({ success: true });
});

app.post('/api/admin/users/:id/ban', protect, adminOnly, async (req, res) => { const user = await User.findById(req.params.id); user.status = user.status === 'banned' ? 'active' : 'banned'; await user.save(); res.json({ success: true, message: user.status }); });
app.delete('/api/admin/users/:id', protect, adminOnly, async (req, res) => { const user = await User.findById(req.params.id); if (user.role === 'admin') return res.status(403).json({ success: false }); await Promise.all([Deposit.deleteMany({ user: user._id }), Withdrawal.deleteMany({ user: user._id }), Transaction.deleteMany({ user: user._id }), Task.deleteMany({ user: user._id })]); await user.deleteOne(); res.json({ success: true }); });

app.get('/api/admin/deposits', protect, adminOnly, async (req, res) => { const { status } = req.query; const filter = status ? { status } : {}; const deposits = await Deposit.find(filter).populate('user', 'nickname phone').sort({ createdAt: -1 }).limit(100); res.json({ success: true, deposits }); });
app.post('/api/admin/deposits/:id/approve', protect, adminOnly, async (req, res) => {
  const d = await Deposit.findById(req.params.id).populate('user'); if (!d || d.status !== 'pending') return res.status(400).json({ success: false });
  const user = d.user; const before = user.depositWallet;
  user.depositWallet += d.amount; user.totalDeposited += d.amount; user.hasEverDeposited = true;
  user.totalAssets = user.depositWallet + user.withdrawWallet; await user.save();
  d.status = 'approved'; d.processedAt = new Date(); await d.save();
  await Transaction.create({ user: user._id, type: 'deposit', amount: d.amount, balanceBefore: before, balanceAfter: user.depositWallet, description: `Depósito ${d.orderId}` });
  await Notification.create({ user: user._id, type: 'deposit', title: 'Depósito Aprovado', message: `${d.amount} Kz creditado` });
  res.json({ success: true });
});
app.post('/api/admin/deposits/:id/reject', protect, adminOnly, async (req, res) => { const d = await Deposit.findById(req.params.id).populate('user'); if (!d || d.status !== 'pending') return res.status(400).json({ success: false }); d.status = 'rejected'; d.processedAt = new Date(); d.adminNote = req.body.note || 'Rejeitado'; await d.save(); await Notification.create({ user: d.user._id, type: 'deposit', title: 'Depósito Rejeitado', message: d.adminNote }); res.json({ success: true }); });

app.get('/api/admin/withdrawals', protect, adminOnly, async (req, res) => { const { status } = req.query; const filter = status ? { status } : {}; const withdrawals = await Withdrawal.find(filter).populate('user', 'nickname phone').sort({ createdAt: -1 }).limit(100); res.json({ success: true, withdrawals }); });
app.post('/api/admin/withdrawals/:id/approve', protect, adminOnly, async (req, res) => { const w = await Withdrawal.findById(req.params.id).populate('user'); if (!w || w.status !== 'pending') return res.status(400).json({ success: false }); w.status = 'approved'; w.processedAt = new Date(); await w.save(); w.user.totalWithdrawn += w.amount; await w.user.save(); await Notification.create({ user: w.user._id, type: 'withdraw', title: 'Saque Pago', message: `${w.amount} Kz` }); res.json({ success: true }); });
app.post('/api/admin/withdrawals/:id/reject', protect, adminOnly, async (req, res) => { const w = await Withdrawal.findById(req.params.id).populate('user'); if (!w || w.status !== 'pending') return res.status(400).json({ success: false }); const user = w.user; const before = user.withdrawWallet; user.withdrawWallet += w.amount; user.totalAssets = user.depositWallet + user.withdrawWallet; await user.save(); w.status = 'rejected'; w.processedAt = new Date(); w.adminNote = req.body.note || 'Rejeitado'; await w.save(); await Transaction.create({ user: user._id, type: 'withdraw_refund', amount: w.amount, balanceBefore: before, balanceAfter: user.withdrawWallet, description: `Reembolso ${w.orderId}` }); res.json({ success: true }); });

app.get('/api/admin/vip-plans', protect, adminOnly, async (req, res) => { const plans = await VipPlan.find().sort({ level: 1 }); res.json({ success: true, plans }); });
app.put('/api/admin/vip-plans/:id', protect, adminOnly, async (req, res) => { const plan = await VipPlan.findByIdAndUpdate(req.params.id, req.body, { new: true }); res.json({ success: true, plan }); });
app.delete('/api/admin/vip-plans/:id', protect, adminOnly, async (req, res) => { await VipPlan.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/admin/settings', protect, adminOnly, async (req, res) => { let s = await Settings.findOne(); if (!s) s = await Settings.create({}); res.json({ success: true, settings: s }); });
app.put('/api/admin/settings', protect, adminOnly, async (req, res) => { let s = await Settings.findOne(); if (!s) s = new Settings({}); Object.assign(s, req.body); await s.save(); res.json({ success: true, settings: s }); });

app.post('/api/admin/banks', protect, adminOnly, async (req, res) => { let s = await Settings.findOne(); if (!s) s = new Settings({}); if (s.banks.find(b => b.bankCode === req.body.bankCode)) return res.status(400).json({ success: false, message: 'Já existe' }); s.banks.push({ ...req.body, ibans: [], active: true }); await s.save(); res.json({ success: true }); });
app.put('/api/admin/banks/:bankId', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); Object.assign(s.banks.id(req.params.bankId), req.body); await s.save(); res.json({ success: true }); });
app.delete('/api/admin/banks/:bankId', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.banks.id(req.params.bankId).deleteOne(); await s.save(); res.json({ success: true }); });
app.post('/api/admin/banks/:bankId/ibans', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); const bank = s.banks.id(req.params.bankId); if (bank.ibans.length >= 6) return res.status(400).json({ success: false, message: 'Máx 6' }); bank.ibans.push({ ...req.body, active: true }); await s.save(); res.json({ success: true }); });
app.put('/api/admin/banks/:bankId/ibans/:ibanId', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); Object.assign(s.banks.id(req.params.bankId).ibans.id(req.params.ibanId), req.body); await s.save(); res.json({ success: true }); });
app.delete('/api/admin/banks/:bankId/ibans/:ibanId', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.banks.id(req.params.bankId).ibans.id(req.params.ibanId).deleteOne(); await s.save(); res.json({ success: true }); });

app.put('/api/admin/entity-reference', protect, adminOnly, async (req, res) => { let s = await Settings.findOne(); if (!s) s = new Settings({}); Object.assign(s.entityReference, req.body); await s.save(); res.json({ success: true }); });
app.post('/api/admin/references', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.entityReference.references.push({ reference: req.body.reference, active: true }); await s.save(); res.json({ success: true }); });
app.delete('/api/admin/references/:id', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.entityReference.references.id(req.params.id).deleteOne(); await s.save(); res.json({ success: true }); });

app.put('/api/admin/kwik', protect, adminOnly, async (req, res) => { let s = await Settings.findOne(); if (!s) s = new Settings({}); Object.assign(s.kwik, req.body); await s.save(); res.json({ success: true }); });
app.post('/api/admin/kwik/numbers', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.kwik.numbers.push({ ...req.body, active: true }); await s.save(); res.json({ success: true }); });
app.delete('/api/admin/kwik/numbers/:id', protect, adminOnly, async (req, res) => { const s = await Settings.findOne(); s.kwik.numbers.id(req.params.id).deleteOne(); await s.save(); res.json({ success: true }); });

app.get('/api/admin/notifications', protect, adminOnly, async (req, res) => { const notifications = await Notification.find({ forAdmin: true }).sort({ createdAt: -1 }).limit(50); const unread = await Notification.countDocuments({ forAdmin: true, read: false }); res.json({ success: true, notifications, unread }); });
app.put('/api/admin/notifications/:id/read', protect, adminOnly, async (req, res) => { await Notification.findByIdAndUpdate(req.params.id, { read: true }); res.json({ success: true }); });
app.post('/api/admin/broadcast', protect, adminOnly, async (req, res) => { const { title, message } = req.body; const users = await User.find({ role: 'user', status: 'active' }); await Notification.insertMany(users.map(u => ({ user: u._id, type: 'system', title, message }))); res.json({ success: true, message: `Enviado a ${users.length} usuários` }); });

app.get('/api/admin/blogs', protect, adminOnly, async (req, res) => { const blogs = await Blog.find().sort({ createdAt: -1 }); res.json({ success: true, blogs }); });
app.post('/api/admin/blogs', protect, adminOnly, async (req, res) => { const blog = await Blog.create({ ...req.body, approved: true }); res.json({ success: true, blog }); });
app.put('/api/admin/blogs/:id/approve', protect, adminOnly, async (req, res) => { await Blog.findByIdAndUpdate(req.params.id, { approved: true }); res.json({ success: true }); });
app.delete('/api/admin/blogs/:id', protect, adminOnly, async (req, res) => { await Blog.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.post('/api/admin/upload', protect, adminOnly, upload.single('image'), async (req, res) => { res.json({ success: true, url: `/uploads/${req.file.filename}` }); });

// ===== SEED =====
async function seedData() {
  try {
    if (!await User.findOne({ role: 'admin' })) {
      await User.create({ nickname: 'Admin', phone: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@2026', role: 'admin' });
      console.log('✅ Admin criado');
    }
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
      console.log('✅ VIPs criados');
    }
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
        withdrawBanks: [{ code: 'BFA', name: 'BFA', active: true }, { code: 'BAI', name: 'BAI', active: true }, { code: 'BIC', name: 'BIC', active: true }, { code: 'ATL', name: 'ATL', active: true }, { code: 'BCI', name: 'BCI', active: true }],
        entityReference: { entity: '11333', references: [] },
        kwik: { numbers: [] },
        aboutUs: '🌟 KwanzaPay — A Plataforma Líder em Angola 🌟\n\nTarefas diárias simples para ganhar dinheiro.\nSaques rápidos em 24h.\nSuporte 24/7.\nAté 30% de comissão por convites.\n\n🇦🇴 Plataforma para Angolanos. Feito para Si.'
      });
      console.log('✅ Settings criadas');
    }
    console.log('🎉 Seed completo!');
  } catch (e) { console.error(e); }
}

// ===== SERVE STATIC FILES =====
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'dashboard.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '..', 'register.html')));

module.exports = app;
