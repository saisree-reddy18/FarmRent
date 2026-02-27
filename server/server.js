require('dotenv').config(); // load .env file automatically
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ============================================================
// RESEND EMAIL CONFIGURATION
// 1. Sign up at https://resend.com (free — 100 emails/day)
// 2. Get your API key from the dashboard
// 3. Add to your .env file:  RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
// ============================================================
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const SECRET = process.env.FR_SECRET || 'dev_secret_change_me';

const DB_FILE = path.join(__dirname, 'db.json');
function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return { equip: [], bookings: [] }; }
}
function writeDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Helpers
function ensureDb() {
  const db = readDb();
  if (!db.equip) db.equip = [];
  if (!db.bookings) db.bookings = [];
  writeDb(db);
  return db;
}

app.get('/api/equip', (req, res) => {
  const db = readDb();
  res.json(db.equip || []);
});

app.post('/api/equip', (req, res) => {
  const db = readDb();
  const item = req.body;
  if (!item || !item.id) return res.status(400).json({ error: 'Invalid payload' });
  db.equip = db.equip.filter(e => e.id !== item.id);
  db.equip.push(item);
  writeDb(db);
  res.json(item);
});

app.put('/api/equip/:id', (req, res) => {
  const id = req.params.id;
  const db = readDb();
  const idx = db.equip.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.equip[idx] = Object.assign(db.equip[idx], req.body);
  writeDb(db);
  res.json(db.equip[idx]);
});

app.delete('/api/equip/:id', (req, res) => {
  const id = req.params.id;
  const db = readDb();
  db.equip = db.equip.filter(e => e.id !== id);
  writeDb(db);
  res.json({ ok: true });
});

// Users & Auth
app.post('/api/signup', (req, res) => {
  const db = readDb();
  const u = req.body;
  if (!u || !u.email || !u.pass || !u.name || !u.otp) return res.status(400).json({ error: 'Invalid payload' });
  const otps = db.otps || {};
  const rec = otps[u.email.toLowerCase()];
  if (!rec || rec.code !== u.otp.toString() || Date.now() > rec.expiresAt) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  if (!db.users) db.users = [];
  if (db.users.find(x => x.email === u.email)) return res.status(409).json({ error: 'Email exists' });
  const hashed = bcrypt.hashSync(u.pass, 10);
  const user = { name: u.name, email: u.email, pass: hashed, role: u.role || 'tenant', contact: u.contact || '' };
  db.users.push(user);
  delete db.otps[u.email.toLowerCase()];
  const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
  if (!db.sessions) db.sessions = {};
  db.sessions[token] = user.email;
  writeDb(db);
  res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
});

app.post('/api/login', (req, res) => {
  const db = readDb();
  const { email, pass } = req.body || {};
  if (!email || !pass) return res.status(400).json({ error: 'Invalid payload' });
  const user = (db.users || []).find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(pass, user.pass);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
  if (!db.sessions) db.sessions = {};
  db.sessions[token] = user.email;
  writeDb(db);
  res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
});

function authEmailFromReq(req) {
  const auth = req.headers['authorization'] || req.headers['x-fr-token'];
  if (!auth) return null;
  let token = auth;
  if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
  try {
    const payload = jwt.verify(token, SECRET);
    return payload && payload.email ? payload.email : null;
  } catch (e) {
    const db = readDb();
    return (db.sessions && db.sessions[token]) || null;
  }
}

// OTP
const twilio = require('twilio');

let smsClient = null;
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
  smsClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
}

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

async function sendOtpDelivery(email, code, phone) {
  // Send email via Resend
  if (email) {
    try {
      await resend.emails.send({
        from: 'FarmRent <onboarding@resend.dev>',
        to: email,
        subject: 'Your FarmRent OTP Code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
            <h2 style="color:#2e7d32;">🌾 FarmRent OTP</h2>
            <p>Your one-time password is:</p>
            <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2e7d32;padding:16px 0;">${code}</div>
            <p style="color:#666;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
          </div>
        `,
        text: `Your FarmRent OTP code is ${code}. It expires in 5 minutes.`,
      });
      console.log('[MAIL] OTP email sent to', email);
    } catch (e) {
      console.error('[MAIL] Failed to send OTP email:', e.message);
    }
  }

  if (smsClient && phone) {
    try {
      await smsClient.messages.create({
        body: `FarmRent OTP: ${code}`,
        from: process.env.TWILIO_FROM,
        to: phone,
      });
    } catch (e) {
      console.error('Failed to send OTP SMS', e);
    }
  }
}

app.post('/api/request-otp', async (req, res) => {
  console.log('[API] request-otp', req.body);
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const db = readDb();
  if (!db.otps) db.otps = {};
  const code = genOtp();
  const expiresAt = Date.now() + (5 * 60 * 1000);
  db.otps[email.toLowerCase()] = { code, expiresAt };
  writeDb(db);
  const user = (db.users || []).find(u => u.email === email.toLowerCase());
  const phone = user && user.contact && user.contact.match(/\+?\d+/) ? user.contact : null;
  await sendOtpDelivery(email, code, phone);
  if (process.env.FR_DEV_OTP === '1') return res.json({ ok: true, code });
  return res.json({ ok: true });
});

app.post('/api/verify-otp', (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
  const db = readDb();
  const rec = db.otps && db.otps[email.toLowerCase()];
  if (!rec) return res.status(400).json({ error: 'No OTP requested' });
  if (Date.now() > rec.expiresAt) { delete db.otps[email.toLowerCase()]; writeDb(db); return res.status(400).json({ error: 'OTP expired' }); }
  if (rec.code !== code.toString()) return res.status(400).json({ error: 'Invalid code' });
  if (!db.users) db.users = [];
  let user = db.users.find(u => u.email === email.toLowerCase());
  if (!user) {
    user = { name: email.split('@')[0], email: email.toLowerCase(), pass: '', role: 'tenant', contact: '' };
    db.users.push(user);
  }
  const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
  if (!db.sessions) db.sessions = {};
  db.sessions[token] = user.email;
  delete db.otps[email.toLowerCase()];
  writeDb(db);
  res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
});

app.post('/api/verify-otp-only', (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
  const db = readDb();
  const rec = db.otps && db.otps[email.toLowerCase()];
  if (!rec) return res.status(400).json({ error: 'No OTP requested' });
  if (Date.now() > rec.expiresAt) { delete db.otps[email.toLowerCase()]; writeDb(db); return res.status(400).json({ error: 'OTP expired' }); }
  if (rec.code !== code.toString()) return res.status(400).json({ error: 'Invalid code' });
  res.json({ ok: true });
});

// Chats
app.get('/api/chats/:thread', (req, res) => {
  const key = req.params.thread;
  const db = readDb();
  if (!db.chats) db.chats = {};
  res.json(db.chats[key] || []);
});

app.post('/api/chats/:thread', (req, res) => {
  const key = req.params.thread;
  const db = readDb();
  if (!db.chats) db.chats = {};
  const msg = req.body;
  if (!msg || !msg.text) return res.status(400).json({ error: 'Invalid payload' });
  const senderEmail = authEmailFromReq(req) || msg.from;
  const senderName = msg.fromName || senderEmail || 'anonymous';
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const payload = { from: senderEmail, fromName: senderName, text: msg.text, time };
  if (!db.chats[key]) db.chats[key] = [];
  db.chats[key].push(payload);
  writeDb(db);
  res.json(payload);
});

// Bookings
app.get('/api/bookings', (req, res) => {
  const db = readDb();
  res.json(db.bookings || []);
});

app.post('/api/bookings', (req, res) => {
  const db = readDb();
  const b = req.body;
  if (!b || !b.id) return res.status(400).json({ error: 'Invalid payload' });
  db.bookings = db.bookings.filter(x => x.id !== b.id);
  db.bookings.push(b);
  writeDb(db);
  res.json(b);
});

app.put('/api/bookings/:id', (req, res) => {
  const id = req.params.id;
  const db = readDb();
  const idx = db.bookings.findIndex(b => b.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.bookings[idx] = Object.assign(db.bookings[idx], req.body);
  writeDb(db);
  res.json(db.bookings[idx]);
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

ensureDb();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`FarmRent API listening on http://localhost:${PORT}/api`));