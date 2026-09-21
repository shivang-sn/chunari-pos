const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const { db, countProducts } = require('./db');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const sourceDir = path.join(__dirname, '..');
const uploadsDir = path.join(__dirname, 'uploads');

function cleanTitle(filename) {
  let name = filename.replace(path.extname(filename), '');
  name = name.replace(/[\s.]+$/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  name = name
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return name;
}

async function importExistingImages(baseUrl) {
  if (countProducts() > 0) {
    return { imported: 0, skipped: true };
  }
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .filter((f) => fs.statSync(path.join(sourceDir, f)).isFile());

  const insert = db.prepare(`
    INSERT INTO products (id, title, sizes, purchase_price, selling_price, stock_qty, image_filename, qr_data_url, created_at, updated_at)
    VALUES (?, ?, '', 0, 0, 0, ?, ?, ?, ?)
  `);

  let imported = 0;
  for (const file of files) {
    const id = crypto.randomUUID();
    const ext = path.extname(file).toLowerCase();
    const hash = crypto.createHash('md5').update(file).digest('hex').slice(0, 8);
    const destName = `${hash}-${id}${ext}`;
    fs.copyFileSync(path.join(sourceDir, file), path.join(uploadsDir, destName));

    const title = cleanTitle(file);
    const qrText = `${baseUrl}/product/${id}`;
    const qrDataUrl = await QRCode.toDataURL(qrText, { width: 400, margin: 1 });

    const now = new Date().toISOString();
    insert.run(id, title, destName, qrDataUrl, now, now);
    imported++;
  }
  return { imported, skipped: false };
}

module.exports = { importExistingImages, cleanTitle };
