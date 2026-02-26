/* ============================================================
   FARMRENT — app.js
   Main application logic
   ============================================================ */

'use strict';

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */
const $ = id => document.getElementById(id);
function parseStore(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch { return def; }
}
function persist() {
  localStorage.setItem(STORAGE_KEYS.USERS,    JSON.stringify(db.users));
  localStorage.setItem(STORAGE_KEYS.EQUIP,    JSON.stringify(db.equip));
  localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(db.bookings));
  localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(db.wishlist));
  localStorage.setItem(STORAGE_KEYS.CHATS,    JSON.stringify(chats));
  localStorage.setItem(STORAGE_KEYS.REVIEWS,  JSON.stringify(reviews));
  localStorage.setItem('fr_read_status',      JSON.stringify(messageReadStatus));
}
function saveSession() { localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session)); }
function uid()  { return 'id' + Math.random().toString(36).slice(2, 9); }
function esc(s) { return (s || '').toString().replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// API sync settings
const API_BASE = 'http://localhost:4000/api';

async function apiAvailable() {
  try {
    const res = await fetch(API_BASE + '/health');
    return res.ok;
  } catch (e) { return false; }
}

async function apiGetEquip() {
  try { const headers = {}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/equip', { headers }); if (!r.ok) throw new Error('bad'); return await r.json(); } catch (e) { return null; }
}

async function apiGetBookings() {
  try { const headers = {}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/bookings', { headers }); if (!r.ok) throw new Error('bad'); return await r.json(); } catch (e) { return null; }
}

async function apiPostEquip(item) {
  try { const headers = {'Content-Type':'application/json'}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/equip', { method: 'POST', headers, body: JSON.stringify(item) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

async function apiPutEquip(id, data) {
  try { const headers = {'Content-Type':'application/json'}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/equip/' + encodeURIComponent(id), { method: 'PUT', headers, body: JSON.stringify(data) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

async function apiDeleteEquip(id) {
  try { const headers = {}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/equip/' + encodeURIComponent(id), { method: 'DELETE', headers }); return r.ok; } catch (e) { return false; }
}

async function apiPostBooking(b) {
  try { const headers = {'Content-Type':'application/json'}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/bookings', { method: 'POST', headers, body: JSON.stringify(b) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

async function apiPutBooking(id, data) {
  try { const headers = {'Content-Type':'application/json'}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/bookings/' + encodeURIComponent(id), { method: 'PUT', headers, body: JSON.stringify(data) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

// Auth
async function apiSignup(payload) {
  try { const r = await fetch(API_BASE + '/signup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function apiLogin(payload) {
  try { const r = await fetch(API_BASE + '/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

// OTP APIs
async function apiRequestOtp(email) {
  try {
    const r = await fetch(API_BASE + '/request-otp', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email })
    });
    if (!r.ok) {
      let err = 'Server error';
      try { const j = await r.json(); if (j && j.error) err = j.error; } catch {}
      return { ok: false, error: err };
    }
    const data = await r.json();
    return { ok: true, data };
  } catch (e) {
    console.error('apiRequestOtp network', e);
    return { ok: false, error: e.message || 'Network error' };
  }
}
async function apiVerifyOtp(email, code) {
  try { const r = await fetch(API_BASE + '/verify-otp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, code }) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

// Chats
async function apiGetChats(threadKey) {
  try { const headers = {}; if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token; const r = await fetch(API_BASE + '/chats/' + encodeURIComponent(threadKey), { headers }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function apiPostChat(threadKey, msg, token) {
  try { const headers = {'Content-Type':'application/json'}; const tk = token || (session && session.token); if (tk) headers['Authorization'] = 'Bearer ' + tk; const r = await fetch(API_BASE + '/chats/' + encodeURIComponent(threadKey), { method: 'POST', headers, body: JSON.stringify(msg) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

/* ----------------------------------------------------------
   STATE
   ---------------------------------------------------------- */
let db = {
  users:    parseStore(STORAGE_KEYS.USERS,    []),
  equip:    parseStore(STORAGE_KEYS.EQUIP,    []),
  bookings: parseStore(STORAGE_KEYS.BOOKINGS, []),
  wishlist: parseStore(STORAGE_KEYS.WISHLIST, {}),
};
let chats   = parseStore(STORAGE_KEYS.CHATS,   {});
let reviews = parseStore(STORAGE_KEYS.REVIEWS, {});
let session = parseStore(STORAGE_KEYS.SESSION, null);
let messageReadStatus = parseStore('fr_read_status', {}); // Track { threadKey: { userEmail: lastReadIndex } }

let editingId        = null;   // equipment being edited
let rentalEquipId    = null;   // equipment open in rental modal
let activeChatEquipId = null;  // equipment chat is open for
let activeChatKey = null;      // chat thread key: equipId::tenantEmail
let selectedRole     = 'tenant';
let pickedIcon       = '🚜';

/* ----------------------------------------------------------
   SEED
   ---------------------------------------------------------- */
(function seed() {
  // Re-seed if any existing equipment is missing images (upgrade from emoji-only version)
  const needsReseed = db.equip.length === 0 ||
    db.equip.some(e => SEED_EQUIPMENT.find(s => s.id === e.id) && !e.image);
  if (needsReseed) {
    // Preserve any owner-added equipment (id not in seed list)
    const seedIds = SEED_EQUIPMENT.map(s => s.id);
    const custom  = db.equip.filter(e => !seedIds.includes(e.id));
    db.equip = [...SEED_EQUIPMENT, ...custom];
    persist();
  }
})();

/* ----------------------------------------------------------
   ICON PICKER (build on DOM ready)
   ---------------------------------------------------------- */
function buildIconPicker() {
  const picker = $('iconPicker');
  if (!picker) return;
  picker.innerHTML = '';
  EQUIPMENT_ICONS.forEach((ic, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = ic;
    btn.className = 'icon-option' + (idx === 0 ? ' selected' : '');
    btn.onclick = () => {
      pickedIcon = ic;
      picker.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    picker.appendChild(btn);
  });
}

/* ----------------------------------------------------------
   VIEWS
   ---------------------------------------------------------- */
const ALL_VIEWS = ['browse', 'wishlist', 'bookings', 'messages', 'ownerList', 'ownerAdd', 'ownerRequests'];

function goHome() {
  if (session) goTo('browse'); else showAuth();
}

function goTo(key) {
  if (!session) { showAuth(); showToast('Please sign in to continue'); return; }

  const ownerOnly = ['ownerList', 'ownerAdd', 'ownerRequests'];
  if (ownerOnly.includes(key) && session.role !== 'owner') {
    showToast('❌ Owner access only. Please sign in as an Owner.');
    return;
  }

  // hide all views, show target
  ALL_VIEWS.forEach(v => {
    const el = $('view-' + v);
    if (el) el.classList.remove('active');
  });
  const target = $('view-' + key);
  if (target) target.classList.add('active');

  // highlight nav
  document.querySelectorAll('#navLinks button').forEach(b => b.classList.remove('active'));
  const navMap = { browse: 'navBrowse', wishlist: 'navWishlist', bookings: 'navBookings', messages: 'navMessages' };
  if (navMap[key]) $(navMap[key])?.classList.add('active');
  if (ownerOnly.includes(key)) $('navOwner')?.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // per-view render
  if (key === 'browse')        { renderProducts(); renderChips(); }
  if (key === 'wishlist')      renderWishlist();
  if (key === 'bookings')      renderBookings();
  if (key === 'messages')      renderMessages();
  if (key === 'ownerList')     renderOwnerList();
  if (key === 'ownerRequests') renderRequests();
  if (key === 'ownerAdd') {
    editingId = null;
    $('addFormTitle').textContent = '+ Add Equipment';
    clearAddForm();
    buildIconPicker();
  }
  updateWishCount();
  updateMessageCount();
}

/* ----------------------------------------------------------
   AUTH
   ---------------------------------------------------------- */
function showAuth() {
  $('authCard').style.display = 'block';
  $('navLinks').style.display = 'none';
  ALL_VIEWS.forEach(v => { const el = $('view-' + v); if (el) el.classList.remove('active'); });
}

function authTab(t) {
  const isSignin = t === 'signin';
  $('tabSignin').classList.toggle('active', isSignin);
  $('tabSignup').classList.toggle('active', !isSignin);
  $('paneSignin').style.display  = isSignin ? 'block' : 'none';
  $('paneSignup').style.display  = isSignin ? 'none'  : 'block';
  $('authToggleText').textContent = isSignin ? "Don't have an account?" : "Already have an account?";
  $('authToggleLink').textContent = isSignin ? 'Sign Up' : 'Sign In';
  $('authToggleLink').onclick     = () => authTab(isSignin ? 'signup' : 'signin');
  // hide otp rows when switching and reset signin step
  if (isSignin) {
    const row = $('siOtpRow');
    if (row) { row.style.display = 'none'; delete row.dataset.pendingToken; delete row.dataset.pendingUser; }
    const step1 = $('siStep1'); if (step1) step1.style.display = 'block';
  } else {
    if ($('suOtpRow')) $('suOtpRow').style.display = 'none';
  }
}

function pickRole(r) {
  selectedRole = r;
  $('roleTenant').classList.toggle('active', r === 'tenant');
  $('roleOwner').classList.toggle('active',  r === 'owner');
  $('ownerContact').style.display = r === 'owner' ? 'block' : 'none';
}

function doSignin() {
  // Routes through OTP flow
  doSigninWithOtp();
}

function doSigninWithOtp() {
  const email = $('siEmail').value.trim().toLowerCase();
  const pass  = $('siPass').value.trim();
  if (!email) { showToast('❌ Please enter your email'); $('siEmail').focus(); return; }
  if (!pass)  { showToast('❌ Please enter your password'); $('siPass').focus(); return; }

  (async () => {
    // Step 1: Validate credentials first
    const res = await apiLogin({ email, pass });
    if (!res || !res.token) {
      showToast('❌ Invalid email or password');
      return;
    }
    // Credentials valid — now send OTP before granting access
    const outcome = await apiRequestOtp(email);
    if (outcome.ok) {
      const data = outcome.data;
      showToast('✅ OTP sent — check your email');
      const row = $('siOtpRow'); if (row) row.style.display = 'block';
      const step1 = $('siStep1'); if (step1) step1.style.display = 'none';
      if (data.code) {
        $('siOtpCode').value = data.code;
        showToast('✅ DEV mode — OTP auto-filled: ' + data.code);
        console.log('DEV OTP:', data.code);
      }
      // Store pending session data; actual login happens after OTP verify
      $('siOtpRow').dataset.pendingToken = res.token;
      $('siOtpRow').dataset.pendingUser  = JSON.stringify(res.user);
    } else {
      showToast('❌ Could not send OTP: ' + (outcome.error || 'unknown'));
    }
  })();
}

let signupOtpVerified = false;

function doSignup() {
  const name    = $('suName').value.trim();
  const email   = $('suEmail').value.trim().toLowerCase();
  const pass    = $('suPass').value.trim();
  const contact = $('suContact') ? $('suContact').value.trim() : '';
  const otp     = $('suOtpCode') ? $('suOtpCode').value.trim() : '';
  if (!name || !email || !pass) { showToast('❌ Please fill all required fields'); return; }
  if (!signupOtpVerified) { showToast('❌ Please verify OTP before creating account'); return; }
  (async () => {
    const res = await apiSignup({ name, email, pass, role: selectedRole, contact, otp });
    if (res && res.token) {
      session = { email: res.user.email, name: res.user.name, role: res.user.role, contact: res.user.contact || '', token: res.token };
      saveSession();
      afterLogin();
      return;
    }
    // fallback to local signup (ignores OTP)
    if (db.users.some(u => u.email === email)) { showToast('❌ Email already registered. Please sign in.'); authTab('signin'); return; }
    const role = email === 'admin@farmrent.com' ? 'admin' : selectedRole;
    const user = { name, email, pass, role, contact };
    db.users.push(user); persist();
    session = { email, name, role, contact }; saveSession();
    afterLogin();
  })();
}

async function verifySignupOtp() {
  const email = $('suEmail').value.trim().toLowerCase();
  const code  = $('suOtpCode').value.trim();
  if (!email || !code) { showToast('❌ Enter email and OTP'); return; }
  const res = await fetch(API_BASE + '/verify-otp-only', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, code })
  });
  if (res.ok) {
    signupOtpVerified = true;
    const stat = $('suOtpStatus'); if (stat) stat.style.display = 'inline';
    showToast('✅ OTP verified, you may now create your account');
  } else {
    showToast('❌ OTP verification failed');
  }
}

function requestOtp() {
  // determine whether we're signing in or signing up
  const isSignup = $('tabSignup').classList.contains('active');
  const email = (isSignup ? $('suEmail') : $('siEmail')).value.trim().toLowerCase();
  console.log('requestOtp called, isSignup=', isSignup, 'email=', email);
  if (!email) {
    showToast('❌ Enter your email first');
    // focus the appropriate field so user can type
    const fld = isSignup ? $('suEmail') : $('siEmail');
    if (fld) fld.focus();
    return;
  }
  (async () => {
    const outcome = await apiRequestOtp(email);
    if (outcome.ok) {
      const res = outcome.data;
      showToast('✅ OTP requested — check email (or console in dev)');
      if (isSignup) {
        const row = $('suOtpRow'); if (row) row.style.display = 'block';
        if (res.code) { $('suOtpCode').value = res.code; }
      } else {
        const row = $('siOtpRow'); if (row) row.style.display = 'block';
        if (res.code) { $('siOtpCode').value = res.code; }
      }
      if (res.code) {
        showToast(`✅ OTP auto-filled for development: ${res.code}`);
        console.log('DEV OTP:', res.code);
      }
    } else {
      showToast('❌ Failed to request OTP: ' + (outcome.error || 'unknown'));
    }
  })();
}

function verifyOtp() {
  const email = $('siEmail').value.trim().toLowerCase();
  const code  = $('siOtpCode').value.trim();
  if (!email || !code) { showToast('❌ Enter email and OTP'); return; }
  (async () => {
    // Use verify-otp-only to check the code, then use the pending session token
    const otpRow = $('siOtpRow');
    const pendingToken = otpRow && otpRow.dataset.pendingToken;
    const pendingUserRaw = otpRow && otpRow.dataset.pendingUser;

    if (!pendingToken) {
      showToast('❌ Session expired. Please sign in again.');
      // Reset UI
      if (otpRow) otpRow.style.display = 'none';
      const step1 = $('siStep1'); if (step1) step1.style.display = 'block';
      return;
    }

    try {
      const r = await fetch(API_BASE + '/verify-otp-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      const res = await r.json();
      if (r.ok && res.ok) {
        const user = JSON.parse(pendingUserRaw);
        session = { email: user.email, name: user.name, role: user.role, contact: user.contact || '', token: pendingToken };
        // Clean up pending data
        delete otpRow.dataset.pendingToken;
        delete otpRow.dataset.pendingUser;
        saveSession(); afterLogin();
      } else {
        showToast('❌ OTP verification failed: ' + (res.error || 'Invalid code'));
      }
    } catch(e) {
      showToast('❌ OTP verification error');
    }
  })();
}

function afterLogin() {
  $('authCard').style.display  = 'none';
  $('openAuthBtn').style.display = 'none';
  $('logoutBtn').style.display   = 'inline-block';
  $('welcomeText').textContent   = `Hi, ${session.name} 👋`;
  $('welcomeText').style.display = 'inline-block';
  $('navLinks').style.display    = 'flex';
  $('navOwner').style.display    = session.role === 'owner' ? 'inline-block' : 'none';
  if ($('eContact')) $('eContact').value = session.contact || session.email || '';
  showToast(`✅ Welcome, ${session.name}!`);
  updateMessageCount();
  goTo('browse');
  // start polling server for cross-device sync
  startPolling();
}

function doLogout() {
  session = null;
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  $('openAuthBtn').style.display = 'inline-block';
  $('logoutBtn').style.display   = 'none';
  $('welcomeText').style.display = 'none';
  $('navLinks').style.display    = 'none';
  ALL_VIEWS.forEach(v => { const el = $('view-' + v); if (el) el.classList.remove('active'); });
  closeChat();
  showAuth();
  stopPolling();
}

/* ----------------------------------------------------------
   WISHLIST HELPERS
   ---------------------------------------------------------- */
function isWished(id) {
  return !!(session && (db.wishlist[session.email] || []).includes(id));
}
function toggleWish(id) {
  if (!session) { showToast('Please sign in to add to wishlist'); return; }
  const key = session.email;
  if (!db.wishlist[key]) db.wishlist[key] = [];
  const idx = db.wishlist[key].indexOf(id);
  if (idx >= 0) db.wishlist[key].splice(idx, 1);
  else db.wishlist[key].push(id);
  persist(); updateWishCount();
}
function updateWishCount() {
  const n = session ? (db.wishlist[session.email] || []).length : 0;
  $('wishCount').textContent = n;
}

/* ----------------------------------------------------------
   RATINGS
   ---------------------------------------------------------- */
function avgRating(id) {
  const rs = reviews[id] || [];
  if (!rs.length) return 0;
  return rs.reduce((s, r) => s + (r.stars || 0), 0) / rs.length;
}
function starsHtml(avg) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<span class="star ${i <= Math.round(avg) ? 'on' : ''}">★</span>`;
  return h;
}
function rateEquip(equipId) {
  const val = prompt('Rate this equipment (1–5) and optionally add a comment:\nExample:  4|Great condition and helpful owner');
  if (!val) return;
  const parts = val.split('|');
  const stars = Math.min(5, Math.max(1, Number(parts[0] || 0)));
  const text  = (parts[1] || '').trim();
  if (!reviews[equipId]) reviews[equipId] = [];
  reviews[equipId].push({ user: session.email, userName: session.name, stars, text, time: new Date().toLocaleDateString() });
  persist();
  showToast('⭐ Thanks for your review!');
  renderBookings(); renderProducts();
}

/* ----------------------------------------------------------
   IMAGE HELPERS
   ---------------------------------------------------------- */
function imgSrc(eq) {
  return eq && eq.image && eq.image.trim() !== '' ? eq.image : '';
}
function thumbHtml(eq) {
  const src = imgSrc(eq);
  return src
    ? `<img src="${esc(src)}" alt="${esc(eq.name)}">`
    : `<div class="equip-thumb-placeholder">${eq.icon || '🚜'}</div>`;
}
function smallThumb(eq) {
  const src = imgSrc(eq);
  return src
    ? `<img class="owner-img" src="${esc(src)}" alt="${esc(eq.name)}">`
    : `<div class="owner-img-placeholder">${eq.icon || '🚜'}</div>`;
}

/* ----------------------------------------------------------
   BROWSE / PRODUCTS
   ---------------------------------------------------------- */
function onSearch()   { const q = $('searchInp').value; renderProducts(q); renderChips(q); }
function resetSearch() { $('searchInp').value = ''; renderProducts(''); renderChips(''); }

function renderChips(q = '') {
  const box = $('cropChips'); if (!box) return; box.innerHTML = '';
  const all = new Set();
  db.equip.forEach(e => (e.crops || []).forEach(c => all.add(c.trim())));
  [...all]
    .filter(c => !q || c.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)
    .forEach(c => {
      const d = document.createElement('div');
      d.className = 'chip'; d.textContent = c;
      d.onclick = () => { $('searchInp').value = c; renderProducts(c); };
      box.appendChild(d);
    });
}

function renderProducts(filter) {
  const q = (filter !== undefined ? filter : ($('searchInp')?.value || '')).toLowerCase();
  const grid = $('productsGrid'); if (!grid) return; grid.innerHTML = '';

  const list = db.equip.filter(e => {
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || (e.crops || []).some(c => c.toLowerCase().includes(q));
  });

  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">🔍</div>
      <h3>No equipment found</h3>
      <p>Try a different search term or crop name</p>
    </div>`;
    return;
  }

  list.forEach(eq => {
    const wished = session ? isWished(eq.id) : false;
    const avg    = avgRating(eq.id);
    const ratingCount = (reviews[eq.id] || []).length;
    const card = document.createElement('div');
    card.className = 'equip-card';
    card.innerHTML = `
      <div class="equip-thumb">
        ${thumbHtml(eq)}
        <div class="price-badge">₹${eq.cost}/day</div>
        <div class="avail-badge ${eq.available ? 'avail-yes' : 'avail-no'}">
          ${eq.available ? 'Available' : 'Unavailable'}
        </div>
      </div>
      <div class="equip-body">
        <div class="equip-name">${esc(eq.name)}</div>
        <div class="equip-meta">Owner: ${esc(eq.owner)} · ${esc(eq.category || '')}</div>
        <div class="equip-crops">🌱 ${esc((eq.crops || []).join(', '))}</div>
        <div class="rating-row">
          ${starsHtml(avg)}
          <span style="font-size:12px;color:var(--muted)">
            ${avg ? avg.toFixed(1) + ` (${ratingCount})` : 'No ratings yet'}
          </span>
        </div>
        <div class="equip-actions">
          <button class="btn-book" ${eq.available ? '' : 'disabled'} onclick="openRental('${eq.id}')">
            ${eq.available ? 'Book Now' : 'Unavailable'}
          </button>
          <button class="btn-icon ${wished ? 'active-heart' : ''}"
            onclick="handleWish('${eq.id}', this)" title="Wishlist">
            ${wished ? '❤️' : '🤍'}
          </button>
          <button class="btn-icon" onclick="openChatFor('${eq.id}')" title="Chat with owner">💬</button>
          <button class="btn-small" onclick="showOwnerInfo('${eq.id}')">Info</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function handleWish(id, btn) {
  if (!session) { showToast('Please sign in to add to wishlist'); return; }
  toggleWish(id);
  const wished = isWished(id);
  btn.textContent = wished ? '❤️' : '🤍';
  btn.classList.toggle('active-heart', wished);
  showToast(wished ? '❤️ Added to wishlist' : 'Removed from wishlist');
}

function showOwnerInfo(id) {
  const eq = db.equip.find(e => e.id === id); if (!eq) return;
  showToast(`📞 ${eq.owner}: ${eq.ownerContact || 'No contact listed'}`);
}

/* ----------------------------------------------------------
   WISHLIST PAGE
   ---------------------------------------------------------- */
function renderWishlist() {
  const grid = $('wishlistGrid'); if (!grid) return; grid.innerHTML = '';
  if (!session) {
    grid.innerHTML = `<div class="empty"><div class="empty-icon">🤍</div><h3>Sign in to see your wishlist</h3></div>`;
    return;
  }
  const ids  = db.wishlist[session.email] || [];
  const list = db.equip.filter(e => ids.includes(e.id));
  if (!list.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">🤍</div>
      <h3>Your wishlist is empty</h3>
      <p>Browse equipment and tap ❤️ to save items here</p>
    </div>`;
    return;
  }
  list.forEach(eq => {
    const avg  = avgRating(eq.id);
    const card = document.createElement('div');
    card.className = 'equip-card';
    card.innerHTML = `
      <div class="equip-thumb">
        ${thumbHtml(eq)}
        <div class="price-badge">₹${eq.cost}/day</div>
        <div class="avail-badge ${eq.available ? 'avail-yes' : 'avail-no'}">
          ${eq.available ? 'Available' : 'Unavailable'}
        </div>
      </div>
      <div class="equip-body">
        <div class="equip-name">${esc(eq.name)}</div>
        <div class="equip-meta">Owner: ${esc(eq.owner)}</div>
        <div class="equip-crops">🌱 ${esc((eq.crops || []).join(', '))}</div>
        <div class="rating-row">${starsHtml(avg)}</div>
        <div class="equip-actions">
          <button class="btn-book" ${eq.available ? '' : 'disabled'} onclick="openRental('${eq.id}')">
            ${eq.available ? 'Book Now' : 'Unavailable'}
          </button>
          <button class="btn-icon active-heart" onclick="removeWish('${eq.id}', this)">❤️</button>
          <button class="btn-icon" onclick="openChatFor('${eq.id}')">💬</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function removeWish(id) {
  toggleWish(id);
  showToast('Removed from wishlist');
  renderWishlist();
}

/* ----------------------------------------------------------
   RENTAL MODAL
   ---------------------------------------------------------- */
function openRental(id) {
  if (!session) { showToast('Please sign in to book'); showAuth(); return; }
  const eq = db.equip.find(e => e.id === id); if (!eq) return;
  rentalEquipId = id;
  $('rentalEquipName').textContent  = eq.name;
  $('rentalEquipTitle').textContent = eq.name;
  $('rentalEquipIcon').textContent  = eq.icon || '🚜';
  $('rentalOwnerName').textContent  = 'Owner: ' + eq.owner;
  $('rentalDays').value = 1;
  $('rentalTotal').textContent = eq.cost;
  window._rentalCostPerDay = eq.cost;
  $('rentalModal').classList.add('open');
}
function updateRentalTotal() {
  const days = parseInt($('rentalDays').value) || 1;
  $('rentalTotal').textContent = days * window._rentalCostPerDay;
}
function closeModal(id) { $(id).classList.remove('open'); }

function confirmBooking() {
  const eq = db.equip.find(e => e.id === rentalEquipId); if (!eq) return;
  const days = parseInt($('rentalDays').value) || 1;
  const booking = {
    id:            uid(),
    equipmentId:   eq.id,
    equipmentName: eq.name,
    icon:          eq.icon || '🚜',
    owner:         eq.owner,
    user:          session.email,
    userName:      session.name,
    date:          new Date().toLocaleDateString('en-IN'),
    days,
    total:         days * eq.cost,
    status:        'Pending',
  };
  // Try server sync first; fallback to local
  (async () => {
    const ok = await apiPostBooking(booking);
    if (ok) {
      // server returned stored booking
      db.bookings.push(ok);
      persist();
      closeModal('rentalModal');
      showToast('✅ Booking confirmed and synced to server!');
    } else {
      db.bookings.push(booking); persist();
      closeModal('rentalModal');
      showToast('✅ Booking confirmed (offline mode).');
    }
    renderBookings();
  })();
}

/* ----------------------------------------------------------
   MY BOOKINGS
   ---------------------------------------------------------- */
function renderBookings() {
  const c = $('bookingsList'); if (!c) return; c.innerHTML = '';
  if (!session) {
    c.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><h3>Sign in to see your bookings</h3></div>`;
    return;
  }
  const mine = db.bookings.filter(b => b.user === session.email);
  if (!mine.length) {
    c.innerHTML = `<div class="empty">
      <div class="empty-icon">📋</div>
      <h3>No bookings yet</h3>
      <p>Browse equipment and make your first booking</p>
    </div>`;
    return;
  }
  mine.forEach(b => {
    const eq      = db.equip.find(e => e.id === b.equipmentId);
    const stCls   = { Pending: 'st-pending', Accepted: 'st-accepted', Confirmed: 'st-confirmed', Rejected: 'st-rejected' }[b.status] || 'st-pending';
    const rated   = (reviews[b.equipmentId] || []).some(r => r.user === session.email);
    const div     = document.createElement('div');
    div.className = 'booking-card';
    div.innerHTML = `
      ${eq ? smallThumb(eq) : `<div class="booking-img-placeholder">${b.icon || '🚜'}</div>`}
      <div class="booking-info">
        <div class="booking-name">${esc(b.equipmentName)}</div>
        <div class="booking-meta">Owner: ${esc(b.owner)} · Booked: ${esc(b.date)}</div>
        <div class="booking-meta">Days: ${b.days} · Total: ₹${b.total}</div>
        <span class="booking-status ${stCls}">● ${esc(b.status)}</span>
      </div>
      <div class="booking-actions-col">
        <button class="btn-small" onclick="openChatFor('${b.equipmentId}','${b.user}')">💬 Chat</button>
        ${!rated
          ? `<button class="btn-small" onclick="rateEquip('${b.equipmentId}')">⭐ Rate</button>`
          : `<span style="font-size:12px;color:var(--muted)">Rated ✓</span>`
        }
      </div>`;
    c.appendChild(div);
  });
}

/* ----------------------------------------------------------
   OWNER: MY LISTINGS
   ---------------------------------------------------------- */
function renderOwnerList() {
  const c = $('ownerEquipList'); if (!c) return; c.innerHTML = '';
  if (!session || session.role !== 'owner') {
    c.innerHTML = `<div class="empty"><div class="empty-icon">🚜</div><h3>Owner access required</h3></div>`;
    return;
  }
  const mine = db.equip.filter(e => e.owner === session.name);
  if (!mine.length) {
    c.innerHTML = `<div class="empty">
      <div class="empty-icon">📋</div>
      <h3>No listings yet</h3>
      <p>Add your first equipment to start earning</p>
      <button class="btn-action dark" style="margin-top:16px" onclick="goTo('ownerAdd')">+ Add Equipment</button>
    </div>`;
    return;
  }
  mine.forEach(e => {
    const div = document.createElement('div');
    div.className = 'owner-item';
    div.innerHTML = `
      ${smallThumb(e)}
      <div class="owner-info">
        <div class="owner-item-name">
          ${esc(e.name)}
          <span class="cat-tag">${esc(e.category || '')}</span>
        </div>
        <div class="owner-item-meta">
          ₹${e.cost}/day · Crops: ${esc((e.crops || []).join(', '))} ·
          ${e.available
            ? '<span style="color:#2a4a22">✅ Available</span>'
            : '<span style="color:#a02020">🔒 Unavailable</span>'}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-small" onclick="editEquip('${e.id}')">✏️ Edit</button>
        <button class="btn-small" onclick="toggleAvail('${e.id}')">
          ${e.available ? 'Mark Unavailable' : 'Mark Available'}
        </button>
        <button class="btn-action danger" onclick="deleteEquip('${e.id}')">🗑️</button>
      </div>`;
    c.appendChild(div);
  });
}

function editEquip(id) {
  const e = db.equip.find(x => x.id === id); if (!e) return;
  editingId = id;
  $('addFormTitle').textContent = '✏️ Edit Equipment';
  $('eName').value    = e.name;
  $('eCost').value    = e.cost;
  $('eCrops').value   = (e.crops || []).join(', ');
  $('eCat').value     = e.category || 'Tractor';
  $('eDesc').value    = e.desc || '';
  $('eImageUrl').value = (e.image && !e.image.startsWith('data:')) ? e.image : '';
  $('eContact').value = e.ownerContact || '';
  $('eAvail').value   = e.available ? 'true' : 'false';
  pickedIcon = e.icon || '🚜';
  if (e.image) { $('eImagePreview').src = e.image; $('eImagePreview').style.display = 'block'; }
  buildIconPicker();
  // re-select the right icon after building
  $('iconPicker').querySelectorAll('.icon-option').forEach(btn => {
    if (btn.textContent === pickedIcon) btn.classList.add('selected');
    else btn.classList.remove('selected');
  });
  goTo('ownerAdd');
}

function clearAddForm() {
  ['eName', 'eCost', 'eCrops', 'eDesc', 'eImageUrl', 'eContact'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  const cat = $('eCat'); if (cat) cat.value = 'Tractor';
  const av  = $('eAvail'); if (av) av.value = 'true';
  $('eImagePreview').style.display = 'none';
  const fi = $('eImageFile'); if (fi) fi.value = '';
  pickedIcon = '🚜';
}

function toggleAvail(id) {
  const e = db.equip.find(x => x.id === id); if (!e) return;
  e.available = !e.available; persist(); renderOwnerList();
  // Try to update server copy
  (async () => {
    const res = await apiPutEquip(id, { available: e.available });
    if (res) {
      showToast(`${e.name} marked as ${e.available ? 'Available' : 'Unavailable'} (synced)`);
    } else {
      showToast(`${e.name} marked as ${e.available ? 'Available' : 'Unavailable'} (offline)`);
    }
  })();
}

function deleteEquip(id) {
  if (!confirm('Delete this listing?')) return;
  // Try server delete, then local
  (async () => {
    const ok = await apiDeleteEquip(id);
    db.equip = db.equip.filter(e => e.id !== id);
    persist();
    renderOwnerList(); renderProducts();
    showToast(ok ? '🗑️ Listing deleted (synced)' : '🗑️ Listing deleted (offline)');
  })();
}

/* ----------------------------------------------------------
   SAVE EQUIPMENT (ADD / EDIT)
   ---------------------------------------------------------- */
function saveEquipment() {
  if (!session || session.role !== 'owner') { showToast('❌ Owner access only'); return; }
  const name    = $('eName').value.trim();
  const cost    = Number($('eCost').value);
  const crops   = $('eCrops').value.split(',').map(s => s.trim()).filter(Boolean);
  const cat     = $('eCat').value;
  const desc    = $('eDesc').value.trim();
  const imageUrl = $('eImageUrl').value.trim();
  const contact  = $('eContact').value.trim() || session.contact || session.email;
  const available = $('eAvail').value === 'true';

  if (!name || !cost || !crops.length) {
    showToast('❌ Please fill Equipment Name, Cost, and Crops'); return;
  }

  function finalize(imageData) {
    if (editingId) {
      const item = db.equip.find(x => x.id === editingId);
      if (!item) { showToast('❌ Item not found'); return; }
      item.name = name; item.cost = cost; item.crops = crops;
      item.category = cat; item.desc = desc; item.ownerContact = contact;
      item.available = available; item.icon = pickedIcon;
      if (imageData) item.image = imageData;
      // Attempt to update server, fallback to local
      (async () => {
        const payload = Object.assign({}, item);
        const res = await apiPutEquip(item.id, payload);
        if (res) {
          // server kept copy
          const idx = db.equip.findIndex(x => x.id === item.id);
          if (idx >= 0) db.equip[idx] = res;
          showToast('✅ Listing updated and synced!');
        } else {
          showToast('✅ Listing updated (offline mode).');
        }
        persist();
        goTo('ownerList');
        renderProducts();
      })();
      return;
    } else {
      const newItem = {
        id: uid(), name, cost, crops, category: cat, desc,
        owner: session.name, ownerContact: contact,
        image: imageData || '', icon: pickedIcon, available,
      };
      (async () => {
        const res = await apiPostEquip(newItem);
        if (res) {
          db.equip.push(res);
          showToast('✅ Equipment listed and synced!');
        } else {
          db.equip.push(newItem);
          showToast('✅ Equipment listed (offline mode).');
        }
        persist();
        goTo('ownerList');
        renderProducts();
      })();
      return;
    }
  }

  const file = $('eImageFile')?.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => finalize(e.target.result);
    reader.readAsDataURL(file);
  } else if (imageUrl) {
    finalize(imageUrl);
  } else if (editingId) {
    finalize(db.equip.find(x => x.id === editingId)?.image || '');
  } else {
    finalize('');
  }
}

/* ----------------------------------------------------------
   OWNER: BOOKING REQUESTS
   ---------------------------------------------------------- */
function renderRequests() {
  const c = $('requestsList'); if (!c) return; c.innerHTML = '';
  if (!session || session.role !== 'owner') {
    c.innerHTML = `<div class="empty"><div class="empty-icon">📩</div><h3>Owner access required</h3></div>`;
    return;
  }
  const myIds = db.equip.filter(e => e.owner === session.name).map(e => e.id);
  const reqs  = db.bookings.filter(b => myIds.includes(b.equipmentId));
  if (!reqs.length) {
    c.innerHTML = `<div class="empty"><div class="empty-icon">📩</div><h3>No booking requests yet</h3></div>`;
    return;
  }
  reqs.forEach(b => {
    const stCls = { Pending: 'st-pending', Accepted: 'st-accepted', Rejected: 'st-rejected' }[b.status] || 'st-pending';
    const div = document.createElement('div');
    div.className = 'request-item';
    div.innerHTML = `
      <div class="request-info">
        <div class="request-name">
          ${esc(b.equipmentName)}
          <span class="booking-status ${stCls}" style="margin-left:8px">● ${esc(b.status)}</span>
        </div>
        <div class="request-meta">
          From: ${esc(b.userName)} (${esc(b.user)}) · Date: ${esc(b.date)} · Days: ${b.days} · ₹${b.total}
        </div>
      </div>
      <div class="request-actions">
        ${b.status === 'Pending'
          ? `<button class="btn-accept" onclick="setStatus('${b.id}','Accepted')">✅ Accept</button>
             <button class="btn-reject" onclick="setStatus('${b.id}','Rejected')">❌ Reject</button>`
          : `<span style="font-size:12px;color:var(--muted)">${esc(b.status)}</span>`
        }
        <button class="btn-small" onclick="openChatFor('${b.equipmentId}')">💬 Chat</button>
      </div>`;
    c.appendChild(div);
  });
}

function setStatus(bid, status) {
  const b = db.bookings.find(x => x.id === bid); if (!b) return;
  b.status = status; persist(); renderRequests();
  showToast(`Booking ${status}!`);
}

/* ----------------------------------------------------------
   MESSAGES VIEW
   ---------------------------------------------------------- */
function getUnreadCountForThread(threadKey) {
  if (!session) return 0;
  const msgs = chats[threadKey] || [];
  // ignore threads that have no messages at all
  if (msgs.length === 0) return 0;

  // ensure user is part of this thread (either tenant or owner)
  const parts = threadKey.split('::');
  if (parts.length !== 2) return 0;
  const equipId = parts[0];
  const tenantEmail = parts[1];
  const eq = db.equip.find(e => e.id === equipId);
  const isTenant = session.email === tenantEmail;
  const isOwner = eq && session.name === eq.owner;
  if (!isTenant && !isOwner) return 0;

  // Get the last read message index for this user
  const readStatus = messageReadStatus[threadKey] || {};
  let lastReadIndex = readStatus[session.email] ?? -1;
  // clamp to valid range (may be stale)
  if (lastReadIndex >= msgs.length) lastReadIndex = msgs.length - 1;

  // Count messages from others that are after the last read index
  let unread = 0;
  for (let i = lastReadIndex + 1; i < msgs.length; i++) {
    if (msgs[i].from !== session.email) {
      unread++;
    }
  }
  return unread;
}

function updateMessageCount() {
  if (!session) {
    $('messageCount').style.display = 'none';
    return;
  }
  
  // Calculate total unread across all threads
  let totalUnread = 0;
  Object.keys(chats).forEach(key => {
    totalUnread += getUnreadCountForThread(key);
  });
  
  const badge = $('messageCount');
  if (totalUnread > 0) {
    badge.textContent = totalUnread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderMessages() {
  const list = $('messagesList'); if (!list) return; list.innerHTML = '';
  if (!session) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">💬</div><h3>Sign in to see your messages</h3></div>`;
    return;
  }

  // purge any malformed threads from chats
  Object.keys(chats).forEach(k => {
    const parts = k.split('::');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      delete chats[k];
    }
  });

  // Collect all unique chat threads for the user
  const threads = new Map(); // key -> { equipId, tenantEmail, lastMsg, otherUserName, otherUserEmail, unreadCount }
  Object.keys(chats).forEach(k => {
    const [equipId, tenantEmail] = k.split('::');
    const eq = db.equip.find(e => e.id === equipId);
    if (!eq) return;

    // Determine if user is in this thread
    const isOwner = session.name === eq.owner;
    const isTenant = session.email === tenantEmail;
    if (!isOwner && !isTenant) return;

    const msgs = chats[k] || [];
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    const otherEmail = isOwner ? tenantEmail : eq.owner;
    const otherName = isOwner ? getUserNameByEmail(tenantEmail) : eq.owner;

    threads.set(k, {
      equipId,
      tenantEmail,
      lastMsg: lastMsg?.text || '(No messages yet)',
      lastTime: lastMsg?.time || '',
      otherUserName: otherName,
      otherUserEmail: otherEmail,
      equipName: eq.name,
      unreadCount: getUnreadCountForThread(k),
    });
  });

  // Also include equipment the user has booked or owns (even if no messages yet)
  if (session.role === 'tenant') {
    db.bookings.filter(b => b.user === session.email).forEach(b => {
      const key = chatThreadKey(b.equipmentId, session.email);
      if (!threads.has(key)) {
        const eq = db.equip.find(e => e.id === b.equipmentId);
        if (eq) {
          threads.set(key, {
            equipId: b.equipmentId,
            tenantEmail: session.email,
            lastMsg: '(No messages yet)',
            lastTime: '',
            otherUserName: eq.owner,
            otherUserEmail: eq.owner,
            equipName: eq.name,
            unreadCount: 0,
          });
        }
      }
    });
  } else if (session.role === 'owner') {
    db.equip.filter(e => e.owner === session.name).forEach(eq => {
      findTenantsForEquip(eq.id).forEach(tenantEmail => {
        const key = chatThreadKey(eq.id, tenantEmail);
        if (!threads.has(key)) {
          threads.set(key, {
            equipId: eq.id,
            tenantEmail,
            lastMsg: '(No messages yet)',
            lastTime: '',
            otherUserName: getUserNameByEmail(tenantEmail),
            otherUserEmail: tenantEmail,
            equipName: eq.name,
            unreadCount: 0,
          });
        }
      });
    });
  }

  if (threads.size === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">💬</div><h3>No messages yet</h3><p>Book equipment or wait for rental requests to start chatting</p></div>`;
    return;
  }

  // Display threads
  [...threads.entries()].forEach(([key, info]) => {
    const div = document.createElement('div');
    div.className = 'message-thread-card' + (info.unreadCount > 0 ? ' unread' : '');
    div.innerHTML = `
      <div class="thread-header">
        <div class="thread-equip">🚜 ${esc(info.equipName)}</div>
        ${info.unreadCount > 0 ? `<div class="unread-badge">${info.unreadCount}</div>` : ''}
      </div>
      <div class="thread-body">
        <div class="thread-user">💬 ${esc(info.otherUserName)}</div>
        <div class="thread-last-msg">${esc(info.lastMsg)}</div>
        ${info.lastTime ? `<div class="thread-time">${esc(info.lastTime)}</div>` : ''}
      </div>`;
    div.onclick = () => openChatThread(key, info);
    list.appendChild(div);
  });
}

function chatThreadKey(equipId, tenantEmail) {
  return `${equipId}::${tenantEmail}`;
}

function getUserNameByEmail(email) {
  const u = db.users.find(x => x.email === email);
  return u ? u.name : email;
}

function findTenantsForEquip(equipId) {
  const tenants = new Set();
  Object.keys(chats).forEach(k => {
    if (k.startsWith(equipId + '::')) tenants.add(k.split('::')[1]);
  });
  db.bookings.filter(b => b.equipmentId === equipId).forEach(b => tenants.add(b.user));
  return [...tenants];
}

function openChatThread(key, info) {
  activeChatKey = key;
  activeChatEquipId = info.equipId;
  $('activeChatTitle').textContent = `${info.equipName} • Chat with ${info.otherUserName}`;
  $('messagesList').style.display = 'none';
  $('chatPane').style.display = 'flex';
  
  // Mark all current messages as read for this user
  // Fetch latest from server if available
  (async () => {
    const serverMsgs = await apiGetChats(key);
    if (Array.isArray(serverMsgs)) {
      chats[key] = serverMsgs;
    }
    const msgs = chats[key] || [];
    if (msgs.length > 0) {
      if (!messageReadStatus[key]) messageReadStatus[key] = {};
      messageReadStatus[key][session.email] = msgs.length - 1;
      persist();
      updateMessageCount();
    }
    setTimeout(() => $('chatInp')?.focus(), 100);
    renderChatMsgs();
  })();
}

function backToMessagesList() {
  activeChatKey = null;
  activeChatEquipId = null;
  $('messagesList').style.display = 'block';
  $('chatPane').style.display = 'none';
  $('chatInp').value = '';
  updateMessageCount();
  renderMessages();
}

function openChatFor(equipId, tenantEmail) {
  if (!session) { showAuth(); showToast('Please sign in to chat'); return; }
  const eq = db.equip.find(e => e.id === equipId);
  if (!eq) { showToast('Equipment not found'); goTo('messages'); return; }

  // build or open appropriate thread
  let threadKey;
  if (session.name === eq.owner) {
    // owner: choose tenant from booking list or passed param
    const tenant = tenantEmail || chooseTenantForOwner(equipId);
    if (!tenant) { goTo('messages'); return; }
    threadKey = chatThreadKey(equipId, tenant);
  } else {
    // tenant or other user
    threadKey = chatThreadKey(equipId, session.email);
  }
  // ensure thread exists in chat store
  if (!chats[threadKey]) chats[threadKey] = [];
  persist();

  goTo('messages');
  // after switching view, open the thread
  setTimeout(() => {
    const info = {
      equipId,
      tenantEmail: threadKey.split('::')[1],
      equipName: eq.name,
      otherUserName: session.name === eq.owner ? getUserNameByEmail(threadKey.split('::')[1]) : eq.owner
    };
    openChatThread(threadKey, info);
  }, 100);
}

function closeChat() {
  activeChatKey = null;
  activeChatEquipId = null;
}

function renderChatMsgs() {
  const c = $('chatMsgs'); if (!c) return; c.innerHTML = '';
  if (!activeChatKey) return;
  const msgs = chats[activeChatKey] || [];
  msgs.forEach(m => {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (m.from === session.email ? 'from-me' : 'from-owner');
    div.innerHTML = `
      <div>${esc(m.text)}</div>
      <div class="chat-msg-time">${esc(m.fromName || m.from)} · ${esc(m.time)}</div>`;
    c.appendChild(div);
  });
  c.scrollTop = c.scrollHeight;
}

function sendChat() {
  if (!session) { showToast('Please sign in to chat'); return; }
  if (!activeChatKey) { showToast('Open a chat first'); return; }
  
  const txt = $('chatInp')?.value?.trim();
  if (!txt) return;
  
  const parts = activeChatKey.split('::');
  if (parts.length !== 2) { showToast('Invalid chat thread'); return; }
  
  const equipId = parts[0];
  const tenantEmail = parts[1];
  const eq = db.equip.find(e => e.id === equipId);
  
  if (!eq) { showToast('Equipment not found'); return; }
  
  // Only allow the thread initiator (tenantEmail) or the equipment owner to send messages
  const isOwner = session.name === eq.owner;
  const isTenant = session.email === tenantEmail;
  
  if (!isOwner && !isTenant) {
    showToast('You do not have permission to message in this thread');
    return;
  }
  
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (!chats[activeChatKey]) chats[activeChatKey] = [];
  const msgObj = { from: session.email, fromName: session.name, text: txt };
  (async () => {
    const token = session.token;
    const res = await apiPostChat(activeChatKey, msgObj, token);
    if (res) {
      chats[activeChatKey].push(res);
      if (!messageReadStatus[activeChatKey]) messageReadStatus[activeChatKey] = {};
      messageReadStatus[activeChatKey][session.email] = chats[activeChatKey].length - 1;
      persist(); updateMessageCount(); $('chatInp').value = '';
      renderChatMsgs(); showToast('✓ Message sent');
    } else {
      // offline fallback: push local msg with time
      const fallback = { from: session.email, fromName: session.name, text: txt, time };
      chats[activeChatKey].push(fallback);
      if (!messageReadStatus[activeChatKey]) messageReadStatus[activeChatKey] = {};
      messageReadStatus[activeChatKey][session.email] = chats[activeChatKey].length - 1;
      persist(); updateMessageCount(); $('chatInp').value = '';
      renderChatMsgs(); showToast('✓ Message queued (offline)');
    }
  })();
}

/* ----------------------------------------------------------
   CONTACT FORM
   ---------------------------------------------------------- */
function submitContact(e) {
  e.preventDefault();
  const name  = $('cName').value.trim();
  const email = $('cEmail').value.trim();
  const msg   = $('cMsg').value.trim();
  if (!name || !email || !msg) { showToast('❌ Please fill all fields'); return; }
  showToast(`✅ Thanks ${name}! We'll contact you at ${email}`);
  $('contactForm').reset();
}

/* ----------------------------------------------------------
   TOAST
   ---------------------------------------------------------- */
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ----------------------------------------------------------
   IMAGE FILE INPUT LISTENER
   ---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const fi = $('eImageFile');
  if (fi) fi.addEventListener('change', ev => {
    const f = ev.target.files?.[0];
    if (!f) { $('eImagePreview').style.display = 'none'; return; }
    const reader = new FileReader();
    reader.onload = e => {
      $('eImagePreview').src = e.target.result;
      $('eImagePreview').style.display = 'block';
    };
    reader.readAsDataURL(f);
  });
});

/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */
(function init() {
  // Try to sync initial data from server, otherwise fall back to localStorage seed
  (async () => {
    const apiOk = await apiAvailable();
    if (apiOk) {
      const se = await apiGetEquip();
      const sb = await apiGetBookings();
      if (Array.isArray(se)) db.equip = se;
      if (Array.isArray(sb)) db.bookings = sb;
      persist();
    }

    if (session) {
      afterLogin();
      setInterval(() => { if (session) updateMessageCount(); }, 2000);
    } else {
      showAuth();
      renderProducts();
      renderChips();
    }
    updateWishCount();
    updateMessageCount();
  })();
})();

// Periodic polling to keep multiple devices in sync
let _pollTimer = null;
function startPolling() {
  stopPolling();
  _pollTimer = setInterval(() => { if (session) pollServer(); }, 3000);
}
function stopPolling() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

async function getThreadKeysForSession() {
  if (!session) return [];
  const keys = new Set(Object.keys(chats));
  if (session.role === 'tenant') {
    db.bookings.filter(b => b.user === session.email).forEach(b => keys.add(chatThreadKey(b.equipmentId, session.email)));
  } else if (session.role === 'owner') {
    db.equip.filter(e => e.owner === session.name).forEach(eq => {
      db.bookings.filter(b => b.equipmentId === eq.id).forEach(b => keys.add(chatThreadKey(eq.id, b.user)));
    });
  }
  return [...keys];
}

async function pollServer() {
  if (!session) return;
  try {
    const [se, sb] = await Promise.all([apiGetEquip(), apiGetBookings()]);
    let changed = false;
    if (Array.isArray(se)) {
      // naive replace to keep server authoritative
      db.equip = se;
      changed = true;
    }
    if (Array.isArray(sb)) {
      db.bookings = sb;
      changed = true;
    }
    // fetch chats for known threads
    const threads = await getThreadKeysForSession();
    await Promise.all(threads.map(async k => {
      const msgs = await apiGetChats(k);
      if (Array.isArray(msgs)) {
        chats[k] = msgs;
        changed = true;
      }
    }));

    if (changed) {
      persist();
      // update UI
      renderProducts(); renderChips(); renderBookings(); renderRequests(); renderMessages();
    }
  } catch (e) {
    // silent fail (offline)
  }
}
