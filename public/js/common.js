const socket = io();

function fmtMoney(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtBillNo(n) {
  return '#' + String(n).padStart(4, '0');
}

function toast(msg, isError) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `${icon(isError ? 'alert' : 'check', 16)}<span>${msg}</span>`;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2200);
}

function renderBottomNav(active, mode) {
  const ownerItems = [
    { href: '/index.html', icon: 'home', label: 'Home', key: 'home' },
    { href: '/products.html', icon: 'grid', label: 'Products', key: 'products' },
    { href: '/add-product.html', icon: 'plusCircle', label: 'Add', key: 'add' },
    { href: '/billing.html', icon: 'bag', label: 'Bill', key: 'billing' },
    { href: '/bills.html', icon: 'receipt', label: 'Bills', key: 'bills' },
  ];
  const customerItems = [
    { href: '/shop.html', icon: 'store', label: 'Shop', key: 'shop' },
    { href: '/cart.html', icon: 'bag', label: 'Cart', key: 'cart', badge: true },
  ];
  const items = mode === 'customer' ? customerItems : ownerItems;
  const nav = document.createElement('nav');
  nav.className = 'bottomnav';
  nav.innerHTML =
    `<div class="nav-brand" id="navBrand"><div class="brand-mark">C</div><span class="nav-brand-label">Chunari</span></div>` +
    items
      .map(
        (i) => `<a href="${i.href}" class="${i.key === active ? 'active' : ''}" ${i.badge ? 'id="navCartLink"' : ''}>
          ${icon(i.icon, 20)}<span class="label">${i.label}</span>
          ${i.badge ? '<span class="nav-badge" id="navCartBadge" hidden></span>' : ''}
        </a>`
      )
      .join('');
  document.body.appendChild(nav);
  if (mode === 'customer') updateCartBadge();

  apiGet('/api/shop/info').then((info) => {
    const brand = document.getElementById('navBrand');
    if (!brand) return;
    brand.querySelector('.nav-brand-label').textContent = info.shopName || 'Chunari';
    if (info.shopLogoUrl) {
      brand.querySelector('.brand-mark').outerHTML = `<img src="${info.shopLogoUrl}" style="border-radius:10px;object-fit:cover;" />`;
    } else {
      brand.querySelector('.brand-mark').textContent = (info.shopName || 'C').trim().charAt(0).toUpperCase();
    }
  }).catch(() => {});
}

// ---------- Category tabs (underline style with sliding gradient indicator) ----------

function renderCatTabs(containerId, items, active, onChange) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML =
    `<div class="cat-tabs" id="${containerId}Inner"><div class="cat-tabs-indicator" id="${containerId}Indicator"></div></div>`;
  const inner = document.getElementById(`${containerId}Inner`);
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-tab' + (item.key === active ? ' active' : '');
    btn.dataset.key = item.key;
    btn.innerHTML = item.count === undefined ? item.label : `${item.label}<span class="n">${item.count}</span>`;
    btn.addEventListener('click', () => onChange(item.key));
    inner.appendChild(btn);
  });
  requestAnimationFrame(() => moveCatTabsIndicator(containerId));
}

function moveCatTabsIndicator(containerId) {
  const inner = document.getElementById(`${containerId}Inner`);
  const indicator = document.getElementById(`${containerId}Indicator`);
  if (!inner || !indicator) return;
  const activeBtn = inner.querySelector('.cat-tab.active');
  if (!activeBtn) { indicator.style.width = '0'; return; }
  indicator.style.left = activeBtn.offsetLeft + 'px';
  indicator.style.width = activeBtn.offsetWidth + 'px';
  activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}

async function apiSend(url, method, body, isForm) {
  const opts = { method };
  if (isForm) {
    opts.body = body;
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  return res.json();
}

// ---------- Owner auth guard ----------

async function requireOwnerPage() {
  try {
    const me = await apiGet('/api/auth/me');
    if (!me.isOwner) {
      location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
      return null;
    }
    return me;
  } catch {
    location.href = '/login.html';
    return null;
  }
}

// ---------- Customer cart (per-device, stored locally) ----------

const CART_KEY = 'chunari_customer_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {}
  updateCartBadge();
}

function cartCount(cart) {
  cart = cart || getCart();
  return Object.values(cart).reduce((a, qty) => a + qty, 0);
}

// Cart is keyed by "productId" for plain products, or "productId::size" (size = 'small'/'big')
// for products with size variants, so both sizes of the same item can sit in the cart at once.
function cartKey(productId, size) {
  return size ? `${productId}::${size}` : productId;
}

function addToCart(productId, size, qty = 1) {
  const cart = getCart();
  const key = cartKey(productId, size);
  cart[key] = (cart[key] || 0) + qty;
  saveCart(cart);
}

function updateCartBadge() {
  const badge = document.getElementById('navCartBadge');
  if (!badge) return;
  const count = cartCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

// ---------- New-order chime (owner pages only) ----------
// Browsers block audio until a user gesture happens on the page, so the
// AudioContext is created lazily on the first click/tap/keypress rather
// than at load time.
let _chimeCtx = null;
function _unlockChime() {
  if (!_chimeCtx) {
    try { _chimeCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio support */ }
  } else if (_chimeCtx.state === 'suspended') {
    _chimeCtx.resume().catch(() => {});
  }
}
['click', 'touchstart', 'keydown'].forEach((evt) => document.addEventListener(evt, _unlockChime, { once: true }));

function playOrderChime() {
  _unlockChime();
  if (!_chimeCtx) return;
  const ctx = _chimeCtx;
  const now = ctx.currentTime;
  // Two-note "ding-dong" tone.
  [[988, now, 0.16], [740, now + 0.15, 0.28]].forEach(([freq, start, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch {}
}

// Call after requireOwnerPage() succeeds on any owner screen to play a
// chime whenever a customer places a self-checkout order.
function enableOrderChime() {
  socket.on('bill:created', (bill) => {
    if (bill && bill.createdBy === 'customer') playOrderChime();
  });
}
