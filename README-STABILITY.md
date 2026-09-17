# SoMusic v0.2.2 — Stability Audit

Ini menggantikan v0.2.1.

Perbaikan audit tambahan:
- Auto-approval Cloud sebelumnya bisa gagal karena customer tidak punya izin menulis queue.
  Sekarang request menyimpan `ownerUid` dan Rules mengizinkan queue create yang tervalidasi hanya saat auto-approval aktif.
- Approve manual sekarang diproses atomik (request + queue satu transaksi) dari premium layer untuk menghindari status approved tanpa queue.
- Service Worker tidak lagi mengintersep/cache Spotify, Firebase, CDN, atau response API lintas origin.
- Logout admin mengembalikan sesi ke Anonymous Auth supaya listener customer tetap punya auth.
- Settings pada Demo Mode langsung reload supaya state UI tidak stale.
- QR fallback akan direpair otomatis bila library QR terlambat selesai load.
- Spotify search customer/admin memfilter track explicit karena policy SoMusic saat ini `explicitAllowed:false`.
- Validasi Firestore request diperketat: owner UID, ukuran field, durasi, table aktif, dan allow-list field.

## Upload ke root repo
Replace:
- index.html
- premium.css
- premium.js
- firebase-adapter.js
- spotify.js
- sw.js
- firestore.rules

Worker folder:
- spotify-proxy.js
- wrangler.toml.example

Setelah upload:
1. Publish `firestore.rules` ke Firebase Console.
2. Hard refresh.
3. Test manual approval.
4. Matikan Manual Approval sebentar lalu test auto-approval.
5. Test CRUD meja dan QR meja yang sudah dihapus.
6. Baru pasang Spotify credentials.

Catatan:
Static audit + syntax check tidak bisa menjamin 0 bug runtime. OAuth/playback Spotify tetap perlu diuji dengan akun Premium dan active Spotify device.
