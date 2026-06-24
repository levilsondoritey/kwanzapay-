require('dotenv').config();
const express = require('express');
const path = require('path');
const app = require('./api/index.js');

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas de páginas admin (fora do public)
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// SPA fallback — todas as rotas vão para index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return;
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 KwanzaPay v2.0 rodando!`);
  console.log(`🌐 Site: http://localhost:${PORT}`);
  console.log(`⚙️  Admin: http://localhost:${PORT}/admin.html`);
  console.log(`📧 Admin Email: ${process.env.ADMIN_EMAIL || 'admin@kwanzapay.com'}`);
  console.log(`🔑 Admin Senha: ${process.env.ADMIN_PASSWORD || 'Admin@2026'}\n`);
});
