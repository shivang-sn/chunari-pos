const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const { run, countProducts } = require('./db');
const { uploadsDir } = require('./storage');

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const sourceDir = path.join(__dirname, '..');

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

// One-time local-dev convenience: on first run, auto-import photos sitting next
// to this app's folder as starter products. Those source photos aren't part of
// the deployed app, so this is a no-op wherever sourceDir doesn't exist (e.g. Vercel).
async function importExistingImages(baseUrl) {
  if ((await countProducts()) > 0) return { imported: 0, skipped: true };
  if (!fs.existsSync(sourceDir)) return { imported: 0, skipped: true };
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .filter((f) => fs.statSync(path.join(sourceDir, f)).isFile());

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
    await run(
      `INSERT INTO products (id, title, sizes, purchase_price, selling_price, stock_qty, image_filename, qr_data_url, created_at, updated_at)
       VALUES (?, ?, '', 0, 0, 0, ?, ?, ?, ?)`,
      [id, title, destName, qrDataUrl, now, now]
    );
    imported++;
  }
  return { imported, skipped: false };
}

module.exports = { importExistingImages, cleanTitle };
