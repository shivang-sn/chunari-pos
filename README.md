# Chunari POS

A local point-of-sale system: product catalog with photos, per-product QR codes,
billing/checkout with live stock tracking, and sales history — all synced in
real time across every device on your WiFi.

## Running it

```bash
npm install
npm start
```

The terminal will print two URLs:

- `http://localhost:3000` — open this on the computer running the server.
- `http://<your-ip>:3000` — open this on your phone (or any device) connected
  to the **same WiFi network**.

Leave the terminal window open while you use the app — closing it stops the server.

## What's inside

- **Home** — today's sales/profit, total products, low-stock alerts.
- **Products** — searchable catalog grid; tap a product for its full detail page
  (photo, size, purchase price, selling price, stock, and its QR code).
- **Add / Edit** — upload a photo, set title, size(s), purchase price, selling
  price, and stock quantity. A QR code is generated automatically.
- **Bill (New Sale)** — scan a product's QR with your phone camera (📷 icon) or
  search by name to add it to the cart, adjust quantities, then Complete Sale.
  Stock decreases automatically and every connected device updates live.
- **Sales** — full history of past sales with revenue and profit per sale.
- **Settings** — shows the current network URL used to generate QR codes. If
  your router ever assigns this computer a new IP address, update it here and
  tap "Regenerate All QR Codes" so old QR codes keep working.

## Notes

- All 19 product photos already in the parent `chunari` folder were imported
  automatically as starter products (title guessed from the filename, prices
  and stock set to 0) — just open each one from **Products** and fill in its
  details.
- Data is stored locally in `data/chunari.db` (SQLite) — nothing leaves your
  network, and it keeps working with no internet connection once loaded.
- Scanning a product's QR code with **any** phone camera app (not just this
  app) opens that product's detail page directly in the browser.
