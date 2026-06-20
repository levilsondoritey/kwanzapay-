require('dotenv').config();
const express = require('express');
const path = require('path');
const app = require('./api/index.js');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 KwanzaPay rodando!`);
  console.log(`🌐 Site:  http://localhost:${PORT}`);
  console.log(`⚙️  Admin: http://localhost:${PORT}/admin\n`);
  console.log(`📧 Admin Email: ${process.env.ADMIN_EMAIL}`);
  console.log(`🔑 Admin Senha: ${process.env.ADMIN_PASSWORD}\n`);
});
