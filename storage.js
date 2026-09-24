const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadsDir = path.join(process.env.DATA_DIR || __dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// Saves an uploaded file's buffer and returns the URL/path to store in the DB
// (an absolute https URL on Vercel Blob, or "/uploads/<file>" locally).
async function saveFile(buffer, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  if (useBlob) {
    const { put } = require('@vercel/blob');
    const blob = await put(filename, buffer, { access: 'public' });
    return blob.url;
  }
  fs.writeFileSync(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

// Deletes a previously saved file, given whatever was stored for it
// (handles both Blob URLs and local "/uploads/<file>" paths / bare filenames).
async function deleteFile(stored) {
  if (!stored) return;
  if (/^https?:\/\//.test(stored)) {
    try {
      const { del } = require('@vercel/blob');
      await del(stored);
    } catch { /* already gone or not a blob URL we own */ }
    return;
  }
  const filePath = path.join(uploadsDir, path.basename(stored));
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

// Normalizes a stored image reference into a URL usable straight in <img src>.
function toImageUrl(stored) {
  if (!stored) return null;
  if (/^https?:\/\//.test(stored) || stored.startsWith('/uploads/')) return stored;
  return `/uploads/${stored}`;
}

module.exports = { saveFile, deleteFile, toImageUrl, uploadsDir };
