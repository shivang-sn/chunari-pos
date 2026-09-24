const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.env.DATA_DIR || __dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'chunari.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT DEFAULT '',
    sizes TEXT DEFAULT '',
    purchase_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    image_filename TEXT,
    qr_data_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    total_amount REAL NOT NULL,
    total_profit REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL,
    product_id TEXT,
    title_snapshot TEXT NOT NULL,
    size TEXT,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ---- Lightweight migrations: add size-variant columns to older DBs ----
const productColumns = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
const productMigrations = {
  category: "ALTER TABLE products ADD COLUMN category TEXT DEFAULT ''",
  has_size_variants: 'ALTER TABLE products ADD COLUMN has_size_variants INTEGER NOT NULL DEFAULT 0',
  small_purchase_price: 'ALTER TABLE products ADD COLUMN small_purchase_price REAL NOT NULL DEFAULT 0',
  small_selling_price: 'ALTER TABLE products ADD COLUMN small_selling_price REAL NOT NULL DEFAULT 0',
  small_stock_qty: 'ALTER TABLE products ADD COLUMN small_stock_qty INTEGER NOT NULL DEFAULT 0',
  big_purchase_price: 'ALTER TABLE products ADD COLUMN big_purchase_price REAL NOT NULL DEFAULT 0',
  big_selling_price: 'ALTER TABLE products ADD COLUMN big_selling_price REAL NOT NULL DEFAULT 0',
  big_stock_qty: 'ALTER TABLE products ADD COLUMN big_stock_qty INTEGER NOT NULL DEFAULT 0',
  has_number_variants: 'ALTER TABLE products ADD COLUMN has_number_variants INTEGER NOT NULL DEFAULT 0',
  number_variants: "ALTER TABLE products ADD COLUMN number_variants TEXT NOT NULL DEFAULT '[]'",
};
for (const [col, sql] of Object.entries(productMigrations)) {
  if (!productColumns.includes(col)) db.exec(sql);
}

// ---- Lightweight migrations: add bill/customer columns to older DBs ----
const salesColumns = db.prepare("PRAGMA table_info(sales)").all().map((c) => c.name);
const migrations = {
  bill_no: 'ALTER TABLE sales ADD COLUMN bill_no INTEGER',
  customer_name: 'ALTER TABLE sales ADD COLUMN customer_name TEXT',
  customer_mobile: 'ALTER TABLE sales ADD COLUMN customer_mobile TEXT',
  customer_email: 'ALTER TABLE sales ADD COLUMN customer_email TEXT',
  customer_address: 'ALTER TABLE sales ADD COLUMN customer_address TEXT',
  status: "ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'paid'",
  created_by: "ALTER TABLE sales ADD COLUMN created_by TEXT DEFAULT 'owner'",
  paid_at: 'ALTER TABLE sales ADD COLUMN paid_at TEXT',
  subtotal_amount: 'ALTER TABLE sales ADD COLUMN subtotal_amount REAL NOT NULL DEFAULT 0',
  discount_percent: 'ALTER TABLE sales ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0',
  discount_amount: 'ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0',
  discount_label: "ALTER TABLE sales ADD COLUMN discount_label TEXT DEFAULT ''",
};
for (const [col, sql] of Object.entries(migrations)) {
  if (!salesColumns.includes(col)) db.exec(sql);
}
// Backfill bill_no for any pre-existing rows that predate the column.
const needsBillNo = db.prepare('SELECT id FROM sales WHERE bill_no IS NULL ORDER BY created_at ASC').all();
if (needsBillNo.length) {
  const maxRow = db.prepare('SELECT COALESCE(MAX(bill_no), 0) as m FROM sales').get();
  let next = maxRow.m + 1;
  const upd = db.prepare('UPDATE sales SET bill_no = ? WHERE id = ?');
  for (const row of needsBillNo) upd.run(next++, row.id);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function countProducts() {
  const row = db.prepare('SELECT COUNT(*) as c FROM products').get();
  return row.c;
}

function nextBillNo() {
  const row = db.prepare('SELECT COALESCE(MAX(bill_no), 0) as m FROM sales').get();
  return row.m + 1;
}

module.exports = { db, getSetting, setSetting, countProducts, nextBillNo };
