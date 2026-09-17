# SoMusic v0.1.0

Web app request musik untuk F&B: customer scan QR meja, request lagu, kasir approve/reject, lalu request masuk antrean. UI dibuat mengambil arah visual Tianlala Thanksgiving: dark premium, glow/ambient, cassette hero, Meong DJ, micro-animation, dan mobile-first.

## Yang langsung jalan tanpa API

Buka `index.html` melalui web server/GitHub Pages. Customer view default memakai Demo Mode dan katalog contoh. Admin ada di `#admin`, misalnya:

`https://username.github.io/somusic/#admin`

Customer meja 07:

`https://username.github.io/somusic/?table=07`

Demo Mode menyimpan data di browser dan sinkron antar-tab pada perangkat yang sama. Ini sengaja dibuat supaya UI/UX bisa dites dulu walau Spotify/Firebase belum ada.

## Fitur v0.1.0

- Customer QR per meja
- Now Playing + progress
- Search demo + Surprise Me
- Request status + estimasi antrean
- Manual approve/reject kasir
- Approved queue + Play Next
- Wi-Fi QR + password
- Admin dashboard
- Theme Builder / Appearance
- Upload logo + auto color extraction di browser
- Live preview dan Publish Theme
- Firebase config import untuk realtime lintas device
- Spotify config import untuk dipasang belakangan
- Spotify Authorization Code + PKCE (tidak menaruh Client Secret di frontend)
- Optional Cloudflare Worker untuk search Spotify customer
- PWA/service worker basic

## GitHub Pages

Tidak perlu `npm install` dan tidak perlu build.

1. Buat repo GitHub baru.
2. Upload seluruh isi folder ini ke root repo.
3. GitHub → Settings → Pages.
4. Deploy from branch `main`, folder `/root`.
5. Buka URL Pages yang diberikan GitHub.

## Firebase Cloud Mode — tetap bisa Spark / no billing

1. Buat Firebase project.
2. Buat Web App dan copy Firebase config.
3. Authentication → aktifkan **Anonymous** dan **Email/Password**.
4. Buat akun Email/Password untuk admin/kasir.
5. Firestore Database → buat database.
6. Buka `firestore.rules`, ganti `GANTI_DENGAN_EMAIL_ADMIN` dengan email admin tadi, lalu publish rules.
7. Di SoMusic → `#admin` → Settings → import/paste Firebase config → Save & Reload.
8. Setelah reload, login admin.

> Firebase Web API key bukan secret server. Security tetap ditentukan oleh Authentication + Firestore Rules.

## Spotify — dipasang nanti

SoMusic tetap berfungsi tanpa Spotify. Setelah tersedia akun yang memenuhi persyaratan Spotify Developer:

1. Buat Spotify Developer App.
2. Isi Redirect URI dengan URL SoMusic (harus sama persis).
3. Di Admin → Spotify, import `sample/spotify-config.example.json` yang sudah diisi atau isi manual.
4. Save Config → Connect Spotify.
5. Test Spotify.

**Jangan masukkan Client Secret ke GitHub Pages.** Browser memakai PKCE. Client Secret hanya diperlukan oleh optional search proxy dan harus disimpan sebagai Cloudflare Worker secret.

Catatan: Player API Spotify membutuhkan Premium. Spotify juga menerapkan persyaratan Premium pada app owner Development Mode untuk app baru (2026), jadi mode Spotify memang sengaja optional.

## Spotify search customer (optional)

Customer tidak memegang token Spotify kasir. Agar pencarian Spotify asli bisa dipakai customer, deploy folder `worker/` ke Cloudflare Workers Free dan pasang secrets:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `ALLOWED_ORIGIN`

Setelah Worker aktif, isi URL `/search` Worker di Admin → Spotify → **Customer Search Proxy URL**.

## Appearance

Admin → Appearance:

1. Upload PNG/JPG/WebP.
2. Browser resize ke maksimal 320px dan compress ke WebP.
3. Pixel logo dianalisis lokal; tidak dikirim ke AI/API.
4. Sistem memilih primary, secondary, accent, dark background.
5. Admin masih bisa override Primary/Accent/Glow.
6. Publish Theme menyimpan brand + theme ke local state atau Firestore.

## Catatan prototype

- Auto Player hanya berjalan ketika halaman Admin terbuka dan Spotify sudah connected.
- Demo track tidak memainkan audio; ia hanya mensimulasikan flow request/queue/Now Playing.
- Sebelum dipakai produksi, tambahkan rate limiting server-side/App Check dan pertimbangkan aturan/lisensi penggunaan musik di lokasi usaha.
