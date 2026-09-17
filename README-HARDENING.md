# SoMusic v0.2.1 — Hardening Patch

Gunakan ini menggantikan patch v0.2.

## Kenapa ada v0.2.1
Audit lanjutan menemukan beberapa edge case yang layak dibereskan sebelum Spotify API dipasang:

- Spotify Search API saat ini maksimal 10 hasil per request; `spotify.js` lama masih mengizinkan sampai 20.
- OAuth callback sekarang menangani `access_denied` dan state mismatch dengan lebih bersih.
- Access token 401 sekarang mencoba refresh sekali sebelum meminta reconnect.
- Error playback tanpa active Spotify device dibuat jelas.
- Search proxy sekarang mengirim market `ID`, karena client-credentials token tidak punya user country.
- Search proxy punya origin check dan error JSON yang konsisten.
- Queue document memakai `requestId` sebagai ID jika tersedia, sehingga double approve tidak membuat dua queue item.
- CRUD table sekarang memastikan Firebase benar-benar ready, bukan cuma melihat config tersimpan.
- Lock tombol action diperpanjang untuk mengurangi double action saat koneksi lambat.
- Service Worker cache version dibump lagi.

## File root repo yang di-replace
- index.html
- premium.css
- premium.js
- firebase-adapter.js
- spotify.js
- sw.js
- firestore.rules

## File worker
Upload `spotify-proxy.js` dan `wrangler.toml.example` ke folder `worker/`.

## Setelah upload
1. Tunggu GitHub Pages deploy.
2. Hard refresh (`Ctrl+F5`).
3. Jika perlu unregister Service Worker.
4. Paste `firestore.rules` ke Firebase Console lalu Publish.
5. Test Firebase flow lagi: request → approve → queue.
6. Baru pasang Spotify Client ID / Redirect URI.
7. Saat punya Premium, test:
   - Connect Spotify
   - Test Spotify
   - buka Spotify di HP kasir dan putar lagu sebentar agar ada active device
   - approve request Spotify
   - Play next

## Penting
Tidak ada software yang bisa dijamin 0 bug tanpa live integration test. Patch ini menghilangkan bug/edge case yang bisa ditemukan lewat static audit. Playback Spotify tetap perlu dites dengan akun Premium asli karena endpoint player Spotify menolaknya untuk akun non-Premium.
