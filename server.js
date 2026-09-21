const express = require('express');
const session = require('express-session');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const crypto = require('crypto');
const uuidv4 = crypto.randomUUID;

const { db, getSetting, setSetting, nextBillNo } = require('./db');
const { importExistingImages } = require('./importImages');

const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ---------- Passcode hashing (scrypt, no plaintext at rest) ----------

function hashPasscode(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasscode(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (!getSetting('sessionSecret')) setSetting('sessionSecret', crypto.randomBytes(32).toString('hex'));
if (!getSetting('ownerPasscode')) setSetting('ownerPasscode', hashPasscode('1234'));
if (!getSetting('shopName')) setSetting('shopName', 'Shree Shrungar');
if (getSetting('ownerName') === null) setSetting('ownerName', '');
if (getSetting('ownerPhone') === null) setSetting('ownerPhone', '');
if (getSetting('ownerAddress') === null) setSetting('ownerAddress', '');
if (getSetting('offerEnabled') === null) setSetting('offerEnabled', 'false');
if (getSetting('offerPercent') === null) setSetting('offerPercent', '10');
if (getSetting('offerLabel') === null) setSetting('offerLabel', 'Festival Offer');

const sessionMiddleware = session({
  secret: getSetting('sessionSecret'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
});

// Bill and full-product events carry sensitive data (customer details, cost
// price) so only sockets from an authenticated owner session may join this
// room; every other broadcast (stock/price changes) is sanitized instead.
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
io.on('connection', (socket) => {
  if (socket.request.session && socket.request.session.isOwner) socket.join('owners');
});

app.use(sessionMiddleware);
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

function requireOwner(req, res, next) {
  if (req.session && req.session.isOwner) return next();
  res.status(401).json({ error: 'Owner login required' });
}

function isOwnerReq(req) {
  return !!(req.session && req.session.isOwner);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const SIZE_LABELS = { small: 'Small (10x13)', big: 'Big (13x18)' };

function sizeOptionsFor(row) {
  if (!row.has_size_variants) return null;
  return [
    { key: 'small', label: SIZE_LABELS.small, purchasePrice: row.small_purchase_price, sellingPrice: row.small_selling_price, stockQty: row.small_stock_qty },
    { key: 'big', label: SIZE_LABELS.big, purchasePrice: row.big_purchase_price, sellingPrice: row.big_selling_price, stockQty: row.big_stock_qty },
  ];
}

// Numbered variants (No. 1 - No. 5): a separate, generic variant system used by
// categories like Julha/Sinhasan that don't fit Chunari's fixed Small/Big shape.
// Kept independent from sizeOptionsFor/parseSizeVariantFields on purpose so the
// Chunari size-variant code path above is never touched by this.
const NUMBER_VARIANT_KEYS = ['1', '2', '3', '4', '5'];
const numberVariantLabel = (k) => `No. ${k}`;

function numberVariantsFor(row) {
  if (!row.has_number_variants) return null;
  let stored = [];
  try { stored = JSON.parse(row.number_variants || '[]'); } catch { stored = []; }
  return NUMBER_VARIANT_KEYS.map((key) => {
    const existing = stored.find((o) => o.key === key) || {};
    return {
      key,
      label: numberVariantLabel(key),
      purchasePrice: existing.purchasePrice || 0,
      sellingPrice: existing.sellingPrice || 0,
      stockQty: existing.stockQty || 0,
    };
  });
}

function rowToProduct(row) {
  if (!row) return null;
  const sizeOptions = sizeOptionsFor(row);
  const numberVariants = numberVariantsFor(row);
  const variantOptions = sizeOptions || numberVariants || null;
  return {
    id: row.id,
    title: row.title,
    category: row.category || '',
    sizes: row.sizes,
    hasSizeVariants: !!row.has_size_variants,
    sizeOptions,
    hasNumberVariants: !!row.has_number_variants,
    numberVariants,
    isVariant: !!(row.has_size_variants || row.has_number_variants),
    variantOptions,
    purchasePrice: variantOptions ? variantOptions[0].purchasePrice : row.purchase_price,
    sellingPrice: variantOptions ? variantOptions[0].sellingPrice : row.selling_price,
    stockQty: variantOptions ? variantOptions.reduce((a, o) => a + o.stockQty, 0) : row.stock_qty,
    imageUrl: row.image_filename ? `/uploads/${row.image_filename}` : null,
    qrDataUrl: row.qr_data_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToShopProduct(row) {
  if (!row) return null;
  const sizeOptions = sizeOptionsFor(row);
  const numberVariants = numberVariantsFor(row);
  const variantOptions = sizeOptions || numberVariants || null;
  return {
    id: row.id,
    title: row.title,
    category: row.category || '',
    sizes: row.sizes,
    hasSizeVariants: !!row.has_size_variants,
    sizeOptions: sizeOptions ? sizeOptions.map((o) => ({ key: o.key, label: o.label, sellingPrice: o.sellingPrice, stockQty: o.stockQty })) : null,
    hasNumberVariants: !!row.has_number_variants,
    numberVariants: numberVariants ? numberVariants.map((o) => ({ key: o.key, label: o.label, sellingPrice: o.sellingPrice, stockQty: o.stockQty })) : null,
    isVariant: !!(row.has_size_variants || row.has_number_variants),
    variantOptions: variantOptions ? variantOptions.map((o) => ({ key: o.key, label: o.label, sellingPrice: o.sellingPrice, stockQty: o.stockQty })) : null,
    sellingPrice: variantOptions ? variantOptions[0].sellingPrice : row.selling_price,
    stockQty: variantOptions ? variantOptions.reduce((a, o) => a + o.stockQty, 0) : row.stock_qty,
    imageUrl: row.image_filename ? `/uploads/${row.image_filename}` : null,
  };
}

function parseSizeVariantFields(body, existing) {
  const hasSizeVariants = body.hasSizeVariants === 'true' || body.hasSizeVariants === true;
  if (!hasSizeVariants) {
    return {
      has_size_variants: 0,
      purchase_price: body.purchasePrice !== undefined ? parseFloat(body.purchasePrice) || 0 : existing ? existing.purchase_price : 0,
      selling_price: body.sellingPrice !== undefined ? parseFloat(body.sellingPrice) || 0 : existing ? existing.selling_price : 0,
      stock_qty: body.stockQty !== undefined ? parseInt(body.stockQty, 10) || 0 : existing ? existing.stock_qty : 0,
      small_purchase_price: 0, small_selling_price: 0, small_stock_qty: 0,
      big_purchase_price: 0, big_selling_price: 0, big_stock_qty: 0,
    };
  }
  const num = (v, fallback) => (v !== undefined ? parseFloat(v) || 0 : fallback);
  const int = (v, fallback) => (v !== undefined ? parseInt(v, 10) || 0 : fallback);
  const small_purchase_price = num(body.smallPurchasePrice, existing ? existing.small_purchase_price : 0);
  const small_selling_price = num(body.smallSellingPrice, existing ? existing.small_selling_price : 0);
  const small_stock_qty = int(body.smallStockQty, existing ? existing.small_stock_qty : 0);
  const big_purchase_price = num(body.bigPurchasePrice, existing ? existing.big_purchase_price : 0);
  const big_selling_price = num(body.bigSellingPrice, existing ? existing.big_selling_price : 0);
  const big_stock_qty = int(body.bigStockQty, existing ? existing.big_stock_qty : 0);
  return {
    has_size_variants: 1,
    // Kept in sync for code paths that read the legacy single-price/stock columns
    // (e.g. the low-stock alert query): purchase/selling mirror the small size,
    // stock uses the lower of the two so a depleted size still triggers a warning.
    purchase_price: small_purchase_price,
    selling_price: small_selling_price,
    stock_qty: Math.min(small_stock_qty, big_stock_qty),
    small_purchase_price, small_selling_price, small_stock_qty,
    big_purchase_price, big_selling_price, big_stock_qty,
  };
}

// Combines the (untouched) Chunari size-variant parsing above with the separate
// numbered-variant (No. 1 - No. 5) path, so callers get one set of DB columns
// regardless of which variant mode (or neither) the submitted product uses.
function parseVariantFields(body, existing) {
  const hasNumberVariants = body.hasNumberVariants === 'true' || body.hasNumberVariants === true;
  const sizeCols = parseSizeVariantFields(body, existing);
  if (!hasNumberVariants) {
    return { ...sizeCols, has_number_variants: 0, number_variants: '[]' };
  }
  const arr = NUMBER_VARIANT_KEYS.map((k) => ({
    key: k,
    purchasePrice: parseFloat(body[`num${k}PurchasePrice`]) || 0,
    sellingPrice: parseFloat(body[`num${k}SellingPrice`]) || 0,
    stockQty: parseInt(body[`num${k}StockQty`], 10) || 0,
  }));
  const representative = arr.find((o) => o.sellingPrice > 0) || arr[0];
  return {
    has_size_variants: 0,
    purchase_price: representative.purchasePrice,
    selling_price: representative.sellingPrice,
    stock_qty: arr.reduce((sum, o) => sum + o.stockQty, 0),
    small_purchase_price: 0, small_selling_price: 0, small_stock_qty: 0,
    big_purchase_price: 0, big_selling_price: 0, big_stock_qty: 0,
    has_number_variants: 1,
    number_variants: JSON.stringify(arr),
  };
}

function getBaseUrl() {
  return getSetting('baseUrl') || `http://${getLocalIp()}:${PORT}`;
}

async function generateQr(id) {
  const text = `${getBaseUrl()}/product/${id}`;
  return QRCode.toDataURL(text, { width: 400, margin: 1 });
}

function currentOffer() {
  return {
    enabled: getSetting('offerEnabled') === 'true',
    percent: parseFloat(getSetting('offerPercent')) || 0,
    label: getSetting('offerLabel') || 'Festival Offer',
  };
}

function shopInfo() {
  return {
    shopName: getSetting('shopName') || 'Shree Shrungar',
    ownerName: getSetting('ownerName') || '',
    ownerPhone: getSetting('ownerPhone') || '',
    ownerAddress: getSetting('ownerAddress') || '',
    shopLogoUrl: getSetting('shopLogoUrl') || null,
    offer: currentOffer(),
  };
}

// ---------- Auth ----------

app.get('/api/auth/me', (req, res) => {
  res.json({ isOwner: isOwnerReq(req) });
});

app.post('/api/auth/login', (req, res) => {
  const { passcode } = req.body;
  if (!passcode || !verifyPasscode(String(passcode), getSetting('ownerPasscode'))) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }
  req.session.isOwner = true;
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------- Public shop info ----------

app.get('/api/shop/info', (req, res) => {
  res.json(shopInfo());
});

app.get('/api/shop/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows.map(rowToShopProduct));
});

app.get('/api/shop/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(rowToShopProduct(row));
});

// ---------- Product routes (owner) ----------

app.get('/api/products', requireOwner, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(rows.map(rowToProduct));
});

app.get('/api/products/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(rowToProduct(row));
});

app.post('/api/products', requireOwner, upload.single('image'), async (req, res) => {
  try {
    const { title, sizes, category } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    const id = uuidv4();
    const imageFilename = req.file ? req.file.filename : null;
    const qrDataUrl = await generateQr(id);
    const now = new Date().toISOString();
    const v = parseVariantFields(req.body, null);

    db.prepare(`
      INSERT INTO products (
        id, title, category, sizes, purchase_price, selling_price, stock_qty,
        has_size_variants, small_purchase_price, small_selling_price, small_stock_qty,
        big_purchase_price, big_selling_price, big_stock_qty,
        has_number_variants, number_variants,
        image_filename, qr_data_url, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      (category || '').trim(),
      sizes || '',
      v.purchase_price,
      v.selling_price,
      v.stock_qty,
      v.has_size_variants,
      v.small_purchase_price,
      v.small_selling_price,
      v.small_stock_qty,
      v.big_purchase_price,
      v.big_selling_price,
      v.big_stock_qty,
      v.has_number_variants,
      v.number_variants,
      imageFilename,
      qrDataUrl,
      now,
      now
    );

    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    const product = rowToProduct(row);
    io.emit('product:created', rowToShopProduct(row));
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireOwner, upload.single('image'), async (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const { title, sizes, category } = req.body;
    let imageFilename = existing.image_filename;
    if (req.file) {
      if (existing.image_filename) {
        const oldPath = path.join(uploadsDir, existing.image_filename);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      imageFilename = req.file.filename;
    }

    const now = new Date().toISOString();
    const v = parseVariantFields(req.body, existing);
    db.prepare(`
      UPDATE products SET
        title = ?, category = ?, sizes = ?, purchase_price = ?, selling_price = ?, stock_qty = ?,
        has_size_variants = ?, small_purchase_price = ?, small_selling_price = ?, small_stock_qty = ?,
        big_purchase_price = ?, big_selling_price = ?, big_stock_qty = ?,
        has_number_variants = ?, number_variants = ?,
        image_filename = ?, updated_at = ?
      WHERE id = ?
    `).run(
      title && title.trim() ? title.trim() : existing.title,
      category !== undefined ? category.trim() : existing.category,
      sizes !== undefined ? sizes : existing.sizes,
      v.purchase_price,
      v.selling_price,
      v.stock_qty,
      v.has_size_variants,
      v.small_purchase_price,
      v.small_selling_price,
      v.small_stock_qty,
      v.big_purchase_price,
      v.big_selling_price,
      v.big_stock_qty,
      v.has_number_variants,
      v.number_variants,
      imageFilename,
      now,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    const product = rowToProduct(row);
    io.emit('product:updated', rowToShopProduct(row));
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireOwner, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  if (existing.image_filename) {
    const imgPath = path.join(uploadsDir, existing.image_filename);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  io.emit('product:deleted', { id: req.params.id });
  res.json({ success: true });
});

app.post('/api/products/:id/regenerate-qr', requireOwner, async (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const qrDataUrl = await generateQr(req.params.id);
  db.prepare('UPDATE products SET qr_data_url = ?, updated_at = ? WHERE id = ?').run(
    qrDataUrl,
    new Date().toISOString(),
    req.params.id
  );
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  const product = rowToProduct(row);
  io.emit('product:updated', rowToShopProduct(row));
  res.json(product);
});

app.post('/api/settings/regenerate-all-qr', requireOwner, async (req, res) => {
  const rows = db.prepare('SELECT id FROM products').all();
  for (const row of rows) {
    const qrDataUrl = await generateQr(row.id);
    db.prepare('UPDATE products SET qr_data_url = ?, updated_at = ? WHERE id = ?').run(
      qrDataUrl,
      new Date().toISOString(),
      row.id
    );
  }
  io.emit('products:bulk-updated');
  res.json({ regenerated: rows.length });
});

// ---------- Settings ----------

app.get('/api/settings', requireOwner, (req, res) => {
  res.json({ baseUrl: getBaseUrl(), localIp: getLocalIp(), port: PORT, ...shopInfo() });
});

app.post('/api/settings/base-url', requireOwner, async (req, res) => {
  const { baseUrl } = req.body;
  if (!baseUrl) return res.status(400).json({ error: 'baseUrl required' });
  setSetting('baseUrl', baseUrl.replace(/\/$/, ''));
  res.json({ baseUrl: getBaseUrl() });
});

app.post('/api/settings/business', requireOwner, (req, res) => {
  const { shopName, ownerName, ownerPhone, ownerAddress } = req.body;
  if (shopName !== undefined) setSetting('shopName', shopName);
  if (ownerName !== undefined) setSetting('ownerName', ownerName);
  if (ownerPhone !== undefined) setSetting('ownerPhone', ownerPhone);
  if (ownerAddress !== undefined) setSetting('ownerAddress', ownerAddress);
  res.json(shopInfo());
});

app.post('/api/settings/offer', requireOwner, (req, res) => {
  const { enabled, percent, label } = req.body;
  if (enabled !== undefined) setSetting('offerEnabled', enabled ? 'true' : 'false');
  if (percent !== undefined) setSetting('offerPercent', String(Math.max(0, parseFloat(percent) || 0)));
  if (label !== undefined) setSetting('offerLabel', String(label).trim() || 'Festival Offer');
  io.emit('offer:updated', currentOffer());
  res.json(shopInfo());
});

app.post('/api/settings/logo', requireOwner, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const old = getSetting('shopLogoUrl');
  if (old) {
    const oldPath = path.join(uploadsDir, path.basename(old));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  setSetting('shopLogoUrl', `/uploads/${req.file.filename}`);
  res.json(shopInfo());
});

app.post('/api/settings/passcode', requireOwner, (req, res) => {
  const { currentPasscode, newPasscode } = req.body;
  if (!verifyPasscode(String(currentPasscode || ''), getSetting('ownerPasscode'))) {
    return res.status(401).json({ error: 'Current passcode is incorrect' });
  }
  if (!newPasscode || String(newPasscode).length < 4) {
    return res.status(400).json({ error: 'New passcode must be at least 4 characters' });
  }
  setSetting('ownerPasscode', hashPasscode(String(newPasscode)));
  res.json({ ok: true });
});

// ---------- Bills ----------

function rowToBill(row, includeCost) {
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(row.id).map((i) => {
    const item = {
      id: i.id,
      productId: i.product_id,
      title: i.title_snapshot,
      size: i.size,
      qty: i.qty,
      rate: i.unit_price,
      amount: i.unit_price * i.qty,
    };
    if (includeCost) item.unitCost = i.unit_cost;
    return item;
  });
  const bill = {
    id: row.id,
    billNo: row.bill_no,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    status: row.status || 'paid',
    createdBy: row.created_by || 'owner',
    totalAmount: row.total_amount,
    subtotalAmount: row.subtotal_amount || row.total_amount,
    discountPercent: row.discount_percent || 0,
    discountAmount: row.discount_amount || 0,
    discountLabel: row.discount_label || '',
    customer: {
      name: row.customer_name || '',
      mobile: row.customer_mobile || '',
      email: row.customer_email || '',
      address: row.customer_address || '',
    },
    items,
  };
  if (includeCost) bill.totalProfit = row.total_profit;
  return bill;
}

function resolveItemSize(row, size) {
  if (!row.has_size_variants) return { key: '', sellingPrice: row.selling_price, purchasePrice: row.purchase_price, stockQty: row.stock_qty };
  const key = size === 'big' ? 'big' : 'small';
  return key === 'big'
    ? { key, sellingPrice: row.big_selling_price, purchasePrice: row.big_purchase_price, stockQty: row.big_stock_qty }
    : { key, sellingPrice: row.small_selling_price, purchasePrice: row.small_purchase_price, stockQty: row.small_stock_qty };
}

// Generalizes resolveItemSize (left untouched above) with a sibling branch for
// numbered variants, so bill creation can resolve either kind without the
// Chunari size-variant resolution logic changing at all.
function resolveItemVariant(row, size) {
  if (row.has_number_variants) {
    const variants = numberVariantsFor(row);
    const match = variants.find((o) => o.key === size) || variants[0];
    return { key: match.key, sellingPrice: match.sellingPrice, purchasePrice: match.purchasePrice, stockQty: match.stockQty };
  }
  return resolveItemSize(row, size);
}

// Numbered variants store their stock as JSON, so decrementing means read-modify-write
// rather than a single arithmetic UPDATE (as small/big use). stock_qty (the legacy
// aggregate column used by low-stock queries) is kept as the sum across all 5 slots.
function decrementNumberVariantStock(row, key, qty, now) {
  let arr;
  try { arr = JSON.parse(row.number_variants || '[]'); } catch { arr = []; }
  const idx = arr.findIndex((o) => o.key === key);
  if (idx >= 0) arr[idx].stockQty = (arr[idx].stockQty || 0) - qty;
  const total = arr.reduce((sum, o) => sum + (o.stockQty || 0), 0);
  db.prepare('UPDATE products SET number_variants = ?, stock_qty = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(arr),
    total,
    now,
    row.id
  );
}

app.post('/api/bills', (req, res) => {
  try {
    const { items, customer, applyDiscount } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items in bill' });
    }
    const owner = isOwnerReq(req);

    const productRows = {};
    const resolvedSizes = [];
    for (const item of items) {
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
      if (!row) return res.status(400).json({ error: `Product not found` });
      const resolved = resolveItemVariant(row, item.size);
      if (resolved.stockQty < item.qty) {
        const label = row.has_size_variants ? ` (${SIZE_LABELS[resolved.key]})` : row.has_number_variants ? ` (${numberVariantLabel(resolved.key)})` : '';
        return res.status(400).json({ error: `Not enough stock for "${row.title}"${label} (have ${resolved.stockQty}, need ${item.qty})` });
      }
      productRows[item.productId] = row;
      resolvedSizes.push(resolved);
    }

    const billId = uuidv4();
    const billNo = nextBillNo();
    const now = new Date().toISOString();
    let subtotalAmount = 0;
    let costTotal = 0;
    items.forEach((item, i) => {
      const resolved = resolvedSizes[i];
      subtotalAmount += resolved.sellingPrice * item.qty;
      costTotal += resolved.purchasePrice * item.qty;
    });

    // The offer's on/off state and percent always come from server-side settings,
    // never the client, so a bill can't be discounted more than what's actually active.
    const offer = currentOffer();
    const useDiscount = !!applyDiscount && offer.enabled && offer.percent > 0;
    const discountPercent = useDiscount ? offer.percent : 0;
    const discountLabel = useDiscount ? offer.label : '';
    const discountAmount = Math.round(subtotalAmount * discountPercent) / 100;
    const totalAmount = Math.round((subtotalAmount - discountAmount) * 100) / 100;
    const totalProfit = Math.round((totalAmount - costTotal) * 100) / 100;

    const status = owner && req.body.markPaid === false ? 'pending' : owner ? 'paid' : 'pending';
    const createdBy = owner ? 'owner' : 'customer';
    const paidAt = status === 'paid' ? now : null;

    db.prepare(`
      INSERT INTO sales (
        id, created_at, total_amount, total_profit, subtotal_amount, discount_percent, discount_amount, discount_label,
        bill_no, customer_name, customer_mobile, customer_email, customer_address, status, created_by, paid_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      billId,
      now,
      totalAmount,
      totalProfit,
      subtotalAmount,
      discountPercent,
      discountAmount,
      discountLabel,
      billNo,
      (customer && customer.name) || '',
      (customer && customer.mobile) || '',
      (customer && customer.email) || '',
      (customer && customer.address) || '',
      status,
      createdBy,
      paidAt
    );

    const insertItem = db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_id, title_snapshot, size, qty, unit_price, unit_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStockPlain = db.prepare('UPDATE products SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?');
    const updateStockSmall = db.prepare(`
      UPDATE products SET small_stock_qty = small_stock_qty - ?, stock_qty = MIN(small_stock_qty - ?, big_stock_qty), updated_at = ?
      WHERE id = ?
    `);
    const updateStockBig = db.prepare(`
      UPDATE products SET big_stock_qty = big_stock_qty - ?, stock_qty = MIN(small_stock_qty, big_stock_qty - ?), updated_at = ?
      WHERE id = ?
    `);

    items.forEach((item, i) => {
      const row = productRows[item.productId];
      const resolved = resolvedSizes[i];
      const sizeLabel = row.has_size_variants ? SIZE_LABELS[resolved.key] : row.has_number_variants ? numberVariantLabel(resolved.key) : '';
      insertItem.run(uuidv4(), billId, row.id, row.title, sizeLabel, item.qty, resolved.sellingPrice, resolved.purchasePrice);
      if (row.has_number_variants) decrementNumberVariantStock(row, resolved.key, item.qty, now);
      else if (!row.has_size_variants) updateStockPlain.run(item.qty, now, row.id);
      else if (resolved.key === 'big') updateStockBig.run(item.qty, item.qty, now, row.id);
      else updateStockSmall.run(item.qty, item.qty, now, row.id);
    });

    Object.keys(productRows).forEach((id) => {
      io.emit('product:updated', rowToShopProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
    });

    const billRow = db.prepare('SELECT * FROM sales WHERE id = ?').get(billId);
    io.to('owners').emit('bill:created', rowToBill(billRow, true));

    res.status(201).json(rowToBill(billRow, owner));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bills', requireOwner, (req, res) => {
  const rows = db.prepare('SELECT * FROM sales ORDER BY created_at DESC').all();
  res.json(rows.map((r) => rowToBill(r, true)));
});

app.get('/api/bills/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Bill not found' });
  res.json(rowToBill(row, isOwnerReq(req)));
});

app.patch('/api/bills/:id/collect', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Bill not found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Bill is not pending' });
  const now = new Date().toISOString();
  db.prepare("UPDATE sales SET status = 'paid', paid_at = ? WHERE id = ?").run(now, req.params.id);
  const bill = rowToBill(db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id), true);
  io.to('owners').emit('bill:updated', bill);
  res.json(bill);
});

app.patch('/api/bills/:id/cancel', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Bill not found' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Only pending bills can be cancelled' });

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
  const now = new Date().toISOString();
  const restock = db.prepare('UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?');
  for (const item of items) {
    if (item.product_id) restock.run(item.qty, now, item.product_id);
  }
  db.prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?").run(req.params.id);

  items.forEach((item) => {
    if (!item.product_id) return;
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    if (p) io.emit('product:updated', rowToShopProduct(p));
  });

  const bill = rowToBill(db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id), true);
  io.to('owners').emit('bill:updated', bill);
  res.json(bill);
});

app.get('/api/bills/summary/stats', requireOwner, (req, res) => {
  const all = db.prepare('SELECT * FROM sales').all();
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);

  // Monday-start week, computed in UTC to match created_at's ISO date strings.
  const utcNow = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const dow = utcNow.getUTCDay();
  utcNow.setUTCDate(utcNow.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const weekStartStr = utcNow.toISOString().slice(0, 10);

  // "Recent" = today + yesterday + the day before, combined.
  const recentStart = new Date();
  recentStart.setDate(recentStart.getDate() - 2);
  const recentStartStr = recentStart.toISOString().slice(0, 10);

  const summary = {
    recentRevenue: 0, recentProfit: 0, recentCount: 0,
    weekRevenue: 0, weekProfit: 0, weekCount: 0,
    monthRevenue: 0, monthProfit: 0, monthCount: 0,
    allTimeRevenue: 0, allTimeProfit: 0, allTimeCount: 0,
    pendingCount: 0, pendingAmount: 0,
  };
  const dayMap = {};
  for (const s of all) {
    if (s.status === 'cancelled') continue;
    if (s.status === 'pending') {
      summary.pendingCount += 1;
      summary.pendingAmount += s.total_amount;
      continue;
    }
    summary.allTimeCount += 1;
    summary.allTimeRevenue += s.total_amount;
    summary.allTimeProfit += s.total_profit;
    const dateStr = s.created_at.slice(0, 10);
    if (dateStr >= recentStartStr) {
      summary.recentRevenue += s.total_amount;
      summary.recentProfit += s.total_profit;
      summary.recentCount += 1;
    }
    if (dateStr >= weekStartStr) {
      summary.weekRevenue += s.total_amount;
      summary.weekProfit += s.total_profit;
      summary.weekCount += 1;
    }
    if (dateStr.slice(0, 7) === monthStr) {
      summary.monthRevenue += s.total_amount;
      summary.monthProfit += s.total_profit;
      summary.monthCount += 1;
    }
    if (!dayMap[dateStr]) dayMap[dateStr] = { date: dateStr, revenue: 0, profit: 0, count: 0 };
    dayMap[dateStr].revenue += s.total_amount;
    dayMap[dateStr].profit += s.total_profit;
    dayMap[dateStr].count += 1;
  }
  summary.dailyBreakdown = Object.values(dayMap)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 14);

  const lowStock = db.prepare('SELECT * FROM products WHERE stock_qty <= 2 ORDER BY stock_qty ASC').all();
  summary.lowStock = lowStock.map(rowToProduct);
  summary.totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  res.json(summary);
});

// Full analysis: day-by-day collection/expense/profit for a month, quarter, or
// year window, plus totals for the whole window. Expense (cost of goods sold)
// and profit are derived from the already-discount-adjusted total_amount /
// total_profit stored per sale, not recomputed from sale_items.
app.get('/api/bills/summary/analysis', requireOwner, (req, res) => {
  const range = ['month', 'quarter', 'year'].includes(req.query.range) ? req.query.range : 'month';
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  let start;
  if (range === 'month') {
    start = new Date(Date.UTC(utcYear, utcMonth, 1));
  } else if (range === 'quarter') {
    start = new Date(Date.UTC(utcYear, Math.floor(utcMonth / 3) * 3, 1));
  } else {
    start = new Date(Date.UTC(utcYear, 0, 1));
  }
  const startStr = start.toISOString().slice(0, 10);

  const dayMap = {};
  for (let d = new Date(start); d <= now; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dayMap[key] = { date: key, revenue: 0, expense: 0, profit: 0, bills: 0 };
  }

  const rows = db.prepare('SELECT * FROM sales WHERE created_at >= ?').all(startStr);
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const s of rows) {
    if (s.status === 'cancelled') continue;
    const dateStr = s.created_at.slice(0, 10);
    if (s.status === 'pending') {
      pendingCount += 1;
      pendingAmount += s.total_amount;
      continue;
    }
    const bucket = dayMap[dateStr];
    if (!bucket) continue;
    bucket.revenue += s.total_amount;
    bucket.profit += s.total_profit;
    bucket.bills += 1;
  }

  const daily = Object.values(dayMap)
    .map((d) => ({ ...d, expense: Math.round((d.revenue - d.profit) * 100) / 100 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const totals = daily.reduce(
    (acc, d) => {
      acc.revenue += d.revenue;
      acc.expense += d.expense;
      acc.profit += d.profit;
      acc.bills += d.bills;
      return acc;
    },
    { revenue: 0, expense: 0, profit: 0, bills: 0 }
  );
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  totals.expense = Math.round(totals.expense * 100) / 100;
  totals.profit = Math.round(totals.profit * 100) / 100;

  res.json({ range, startDate: startStr, endDate: now.toISOString().slice(0, 10), daily, totals, pendingCount, pendingAmount });
});

// ---------- Product detail page (QR target) ----------

app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// ---------- Startup ----------

async function start() {
  const baseUrl = getBaseUrl();
  if (!getSetting('baseUrl')) setSetting('baseUrl', baseUrl);

  const result = await importExistingImages(getBaseUrl());
  if (result.imported > 0) {
    console.log(`Imported ${result.imported} existing images as starter products.`);
  }

  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIp();
    console.log('');
    console.log('  Chunari POS is running!');
    console.log(`  On this computer:  http://localhost:${PORT}`);
    console.log(`  On your phone (same WiFi): http://${ip}:${PORT}`);
    console.log(`  Owner login passcode (default): 1234 — change it in Settings`);
    console.log('');
  });
}

start();
