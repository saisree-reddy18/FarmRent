require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
async function sendEmail(to, subject, htmlContent) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'FarmRent', email: 'hariharanreddy843@gmail.com' }, to: [{ email: to }], subject, htmlContent })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Brevo error: ${err}`); }
  return await res.json();
}

const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI, { serverApi: ServerApiVersion.v1 });
let db;
async function connectDB() {
  await client.connect();
  db = client.db('farmrent');
  console.log('[DB] Connected to MongoDB Atlas');
}
function col(name) { return db.collection(name); }

const SECRET = process.env.FR_SECRET || 'dev_secret_change_me';
const otpStore = {};
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..')));

function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, SECRET); next(); } catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/equip', async (req, res) => {
  try { res.json(await col('equip').find({}, { projection: { _id: 0 } }).toArray()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/equip', authMiddleware, async (req, res) => {
  try { const item = req.body; if (!item || !item.id) return res.status(400).json({ error: 'Invalid payload' }); await col('equip').replaceOne({ id: item.id }, item, { upsert: true }); res.json(item); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/equip/:id', authMiddleware, async (req, res) => {
  try { const result = await col('equip').findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { returnDocument: 'after', projection: { _id: 0 } }); if (!result) return res.status(404).json({ error: 'Not found' }); res.json(result); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/equip/:id', authMiddleware, async (req, res) => {
  try { await col('equip').deleteOne({ id: req.params.id }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/bookings', authMiddleware, async (req, res) => {
  try { res.json(await col('bookings').find({}, { projection: { _id: 0 } }).toArray()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/bookings', authMiddleware, async (req, res) => {
  try { const b = req.body; if (!b || !b.id) return res.status(400).json({ error: 'Invalid payload' }); await col('bookings').replaceOne({ id: b.id }, b, { upsert: true }); res.json(b); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/bookings/:id', authMiddleware, async (req, res) => {
  try { const result = await col('bookings').findOneAndUpdate({ id: req.params.id }, { $set: req.body }, { returnDocument: 'after', projection: { _id: 0 } }); if (!result) return res.status(404).json({ error: 'Not found' }); res.json(result); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chats/:threadKey', authMiddleware, async (req, res) => {
  try { const thread = await col('chats').findOne({ threadKey: req.params.threadKey }, { projection: { _id: 0 } }); res.json(thread ? thread.messages : []); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/chats/:threadKey', authMiddleware, async (req, res) => {
  try { await col('chats').updateOne({ threadKey: req.params.threadKey }, { $push: { messages: req.body } }, { upsert: true }); res.json(req.body); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, pass, role, contact } = req.body;
    if (!name || !email || !pass || !role) return res.status(400).json({ error: 'Missing fields' });
    if (await col('users').findOne({ email })) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(pass, 10);
    await col('users').insertOne({ name, email, pass: hash, role, contact: contact || '' });
    const token = jwt.sign({ email, name, role }, SECRET, { expiresIn: '7d' });
    res.json({ user: { email, name, role, contact: contact || '' }, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, pass } = req.body;
    const user = await col('users').findOne({ email });
    if (!user || !(await bcrypt.compare(pass, user.pass))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ user: { email: user.email, name: user.name, role: user.role, contact: user.contact || '' }, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { code, expires: Date.now() + 10 * 60 * 1000 };
    await sendEmail(email, 'Your FarmRent OTP', `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;"><h2 style="color:#5a7a3a;">🌾 FarmRent OTP</h2><p>Your one-time password is:</p><h1 style="letter-spacing:8px;color:#333;">${code}</h1><p style="color:#888;font-size:12px;">Valid for 10 minutes.</p></div>`);
    console.log(`[MAIL] OTP email sent to ${email}`);
    res.json({ ok: true });
  } catch (e) { console.error('[MAIL] Error:', e.message); res.status(500).json({ error: 'Failed to send OTP' }); }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    const entry = otpStore[email];
    if (!entry || entry.code !== code || Date.now() > entry.expires) return res.status(400).json({ error: 'Invalid or expired OTP' });
    delete otpStore[email];
    const user = await col('users').findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
    res.json({ user: { email: user.email, name: user.name, role: user.role, contact: user.contact || '' }, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/verify-otp-only', async (req, res) => {
  try {
    const { email, code } = req.body;
    const entry = otpStore[email];
    if (!entry || entry.code !== code || Date.now() > entry.expires) return res.status(400).json({ error: 'Invalid or expired OTP' });
    delete otpStore[email];
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
}).catch(err => { console.error('[DB] Failed to connect:', err); process.exit(1); });