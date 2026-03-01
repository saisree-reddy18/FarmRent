require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const mongoose   = require('mongoose');
const https      = require('https');
const path       = require('path');

const SECRET = process.env.FR_SECRET || 'dev_secret_change_me';
const PORT   = process.env.PORT || 4000;

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || '';
if (!MONGO_URI) {
  console.error('[DB] ERROR: MONGO_URI not set!');
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[DB] Connected to MongoDB Atlas'))
    .catch(err => console.error('[DB] Connection error:', err.message));
}

// Schemas
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  pass: String,
  role: { type: String, default: 'tenant' },
  contact: String,
});
const EquipSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String, cost: Number, crops: [String], category: String,
  desc: String, owner: String, ownerContact: String,
  image: String, icon: String, available: { type: Boolean, default: true },
});
const BookingSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  equipmentId: String, equipmentName: String, icon: String,
  owner: String, user: String, userName: String,
  date: String, days: Number, total: Number, status: { type: String, default: 'Pending' },
});
const OtpSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true },
  code: String, expiresAt: Number,
});
const ChatSchema = new mongoose.Schema({
  threadKey: { type: String, unique: true },
  messages: [{ from: String, fromName: String, text: String, time: String }],
});

const User    = mongoose.model('User',    UserSchema);
const Equip   = mongoose.model('Equip',   EquipSchema);
const Booking = mongoose.model('Booking', BookingSchema);
const Otp     = mongoose.model('Otp',     OtpSchema);
const Chat    = mongoose.model('Chat',    ChatSchema);

// ============================================================
// BREVO HTTP API — works on Render free plan (HTTPS port 443)
// Set BREVO_API_KEY in Render environment variables
// ============================================================
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const SENDER_EMAIL  = process.env.SENDER_EMAIL  || 'harunsanayapalli@gmail.com';
console.log('[ENV] BREVO_API_KEY:', BREVO_API_KEY ? 'LOADED ✓' : 'MISSING ✗');
console.log('[ENV] SENDER_EMAIL:', SENDER_EMAIL);

function sendBrevoEmail(to, subject, htmlContent, textContent) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      sender: { name: 'FarmRent', email: SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
      textContent,
    });

    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendOtpEmail(email, code) {
  if (!BREVO_API_KEY) { console.warn('[MAIL] No BREVO_API_KEY — OTP code:', code); return; }
  try {
    await sendBrevoEmail(
      email,
      'Your FarmRent OTP Code',
      `<div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#2e7d32;">🌾 FarmRent OTP</h2>
        <p>Your one-time password is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2e7d32;padding:16px 0;">${code}</div>
        <p style="color:#666;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
      </div>`,
      `Your FarmRent OTP is ${code}. Expires in 5 minutes.`
    );
    console.log('[MAIL] OTP sent to', email);
  } catch (e) { console.error('[MAIL] Failed:', e.message); }
}

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Serve frontend static files
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, pass, role, contact, otp } = req.body || {};
    if (!name || !email || !pass || !otp) return res.status(400).json({ error: 'Invalid payload' });
    const otpRec = await Otp.findOne({ email: email.toLowerCase() });
    if (!otpRec || otpRec.code !== otp.toString() || Date.now() > otpRec.expiresAt)
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Email already registered' });
    const hashed = bcrypt.hashSync(pass, 10);
    const user = await User.create({ name, email: email.toLowerCase(), pass: hashed, role: role || 'tenant', contact: contact || '' });
    await Otp.deleteOne({ email: email.toLowerCase() });
    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
  } catch (e) { console.error('[SIGNUP]', e.message); res.status(500).json({ error: 'Server error' }); }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, pass } = req.body || {};
    if (!email || !pass) return res.status(400).json({ error: 'Invalid payload' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !bcrypt.compareSync(pass, user.pass)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
  } catch (e) { console.error('[LOGIN]', e.message); res.status(500).json({ error: 'Server error' }); }
});

// Request OTP
app.post('/api/request-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });
    const code = genOtp();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await Otp.findOneAndUpdate({ email: email.toLowerCase() }, { code, expiresAt }, { upsert: true, new: true });
    await sendOtpEmail(email, code);
    if (process.env.FR_DEV_OTP === '1') return res.json({ ok: true, code });
    return res.json({ ok: true });
  } catch (e) { console.error('[REQUEST-OTP]', e.message); res.status(500).json({ error: 'Server error' }); }
});

// Verify OTP (issues token)
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const otpRec = await Otp.findOne({ email: email.toLowerCase() });
    if (!otpRec) return res.status(400).json({ error: 'No OTP requested' });
    if (Date.now() > otpRec.expiresAt) { await Otp.deleteOne({ email: email.toLowerCase() }); return res.status(400).json({ error: 'OTP expired' }); }
    if (otpRec.code !== code.toString()) return res.status(400).json({ error: 'Invalid code' });
    let user = await User.findOne({ email: email.toLowerCase() });
    if (!user) user = await User.create({ name: email.split('@')[0], email: email.toLowerCase(), pass: '', role: 'tenant', contact: '' });
    await Otp.deleteOne({ email: email.toLowerCase() });
    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { name: user.name, email: user.email, role: user.role, contact: user.contact } });
  } catch (e) { console.error('[VERIFY-OTP]', e.message); res.status(500).json({ error: 'Server error' }); }
});

// Verify OTP Only (signup flow)
app.post('/api/verify-otp-only', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const otpRec = await Otp.findOne({ email: email.toLowerCase() });
    if (!otpRec) return res.status(400).json({ error: 'No OTP requested' });
    if (Date.now() > otpRec.expiresAt) { await Otp.deleteOne({ email: email.toLowerCase() }); return res.status(400).json({ error: 'OTP expired' }); }
    if (otpRec.code !== code.toString()) return res.status(400).json({ error: 'Invalid code' });
    res.json({ ok: true });
  } catch (e) { console.error('[VERIFY-OTP-ONLY]', e.message); res.status(500).json({ error: 'Server error' }); }
});

// Equipment
app.get('/api/equip', async (req, res) => {
  try { res.json(await Equip.find({})); } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/equip', async (req, res) => {
  try {
    const item = req.body;
    if (!item || !item.id) return res.status(400).json({ error: 'Invalid payload' });
    const result = await Equip.findOneAndUpdate({ id: item.id }, item, { upsert: true, new: true });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/equip/:id', async (req, res) => {
  try {
    const result = await Equip.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.delete('/api/equip/:id', async (req, res) => {
  try { await Equip.deleteOne({ id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Bookings
app.get('/api/bookings', async (req, res) => {
  try { res.json(await Booking.find({})); } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/bookings', async (req, res) => {
  try {
    const b = req.body;
    if (!b || !b.id) return res.status(400).json({ error: 'Invalid payload' });
    const result = await Booking.findOneAndUpdate({ id: b.id }, b, { upsert: true, new: true });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/bookings/:id', async (req, res) => {
  try {
    const result = await Booking.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Chats
app.get('/api/chats/:thread', async (req, res) => {
  try {
    const chat = await Chat.findOne({ threadKey: req.params.thread });
    res.json(chat ? chat.messages : []);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/chats/:thread', async (req, res) => {
  try {
    const { text, fromName, from } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Invalid payload' });
    let senderEmail = from || 'anonymous';
    let senderName = fromName || senderEmail;
    const auth = req.headers['authorization'] || req.headers['x-fr-token'];
    if (auth) {
      try {
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth;
        const payload = jwt.verify(token, SECRET);
        senderEmail = payload.email; senderName = payload.name;
      } catch {}
    }
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const msg = { from: senderEmail, fromName: senderName, text, time };
    await Chat.findOneAndUpdate({ threadKey: req.params.thread }, { $push: { messages: msg } }, { upsert: true, new: true });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
