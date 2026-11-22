<!-- [Diubah oleh Gemini - 2026-11-21] Panduan pemecahan masalah bahasa Indonesia (Gejala -> Penyebab -> Perbaikan) -->
# Panduan Pemecahan Masalah (Troubleshooting) — Office AI

Gunakan tabel di bawah ini untuk menyelesaikan kendala penyiapan, runtime, maupun integrasi. Versi bahasa Inggris tersedia di [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).

---

| Gejala | Penyebab Umum | Perbaikan |
|---|---|---|
| **Total sepanjang riwayat kosong atau tanggal awal terlalu baru** | Log lama belum diimpor atau sudah dihapus. | Buka **Paling banyak dipakai → Lihat semua → Impor riwayat lokal lengkap**. Impor bersifat baca-saja; log yang dihapus tidak dapat dipulihkan. Log OpenCode belum didukung. |
| **Impor dijeda, tidak lengkap atau biaya n/a** | Impor terputus, sumber terkunci/tidak didukung, atau harga model tidak diketahui. | Lanjutkan dengan tombol impor, lalu coba lagi setelah CLI melepas basis datanya. Sumber SQLite memerlukan `node:sqlite`. Token tetap dihitung meskipun harga tidak diketahui. Tanggal harian Antigravity/Hermes bersifat perkiraan. |
| **Riwayat perlu diperbaiki** | Generasi JSON riwayat rusak atau tidak terbaca. | Tutup Office AI sendiri dan cadangkan `<dataDir>/usage_history/`. Generasi `.bak` valid dipulihkan otomatis. Jika kedua salinan rusak, pulihkan folder tersebut dari cadangan lalu impor ulang log yang tersedia. Jangan mengganti saldo harian atau pengaturan lain. |
| **Agen tampil `"Belum terpasang"` / `"Not Installed"` di Prompt Agen atau Pusat Setup** | Perintah CLI (`claude`, `codex`, `agy`, `opencode`, atau `hermes`) belum terpasang atau belum masuk ke `PATH` sistem. | 1. Pasang CLI yang ingin dipakai (atau gunakan **Gemini API BYOK** bila tidak ingin memasang CLI).<br>2. Buka terminal baru dan uji misalnya `claude --version` atau `codex --version`.<br>3. Mulai ulang Office AI lalu klik **Segarkan** / **Uji koneksi** di Pusat Setup atau Prompt Agen. |
| **Dropdown Channel & Format di Studio Video kosong** | Folder proyek lokal (`localProjectDir`) belum diatur, atau folder yang dipilih tidak memiliki `Tools/youtube/channels.json` maupun subfolder `Channels/<NamaChannel>/`. | 1. Buka **Menu -> Mulai di sini · Pusat Setup** (atau gunakan kotak penyiapan langsung di dalam **Studio Video**).<br>2. Klik kandidat folder proyek yang terdeteksi otomatis, atau ketik/pilih folder yang memuat `Channels/<NamaChannel>/Videos/`.<br>3. Klik **Simpan** — daftar channel otomatis terisi dari `channels.json` atau subfolder `Channels/*`. |
| **Dasbor YouTube offline / skrip `server.py` tidak ditemukan** | `Tools/dashboard/server.py` (atau `dashboard/server.py`) tidak ada di folder proyek Anda, atau dasbor dipasang di folder/repo terpisah. | 1. Unduh atau clone [YouTube Studio Manager](https://github.com/FenomanSKY/YouTube-Studio-Manager) ke folder lokal mana saja.<br>2. Di panel **Dasbor YouTube** (atau **Pusat Setup**), isi atau pilih folder tersebut pada **Folder dasbor YouTube** (`dashboardDir`) lalu klik **Simpan & Jalankan**.<br>3. Pastikan Python 3.9+ berjalan normal di terminal (bukan alias kosong Windows Store `WindowsApps\python.exe`). |
| **Hermes tampil `"9router Offline"`** | Hermes terhubung ke layanan proxy lokal `9router` (`http://127.0.0.1:20128/v1/models`) yang sedang tidak berjalan. | 1. Nyalakan `9router` di komputer Anda (misalnya `9router --tray --no-browser --skip-update`).<br>2. Pastikan `http://127.0.0.1:20128/v1/models` merespons.<br>3. Kembali ke **Prompt Agen AI** lalu klik **Uji koneksi**. |
| **Kunci Gemini API belum ada, ditolak, atau gagal tersimpan** | Kunci belum disimpan di `<dataDir>/secrets_local.json`, ada spasi berlebih saat menyalin, akses API belum aktif, atau kuota habis. | 1. Buka **Pusat Setup** (baris 3) atau **Prompt Agen AI -> Gemini API (BYOK)**.<br>2. Tempel kunci dari Google AI Studio lalu klik **Simpan Key** (tampil `Tersimpan (...XXXX)`).<br>3. Klik **Uji koneksi**. Bila muncul 401/403/429, buat ulang kunci atau periksa batas kuota di Google AI Studio. |
| **Codex / agen CLI terkena limit di Studio Video (keluar dengan kode `0` atau pesan limit)** | Akun CLI mencapai batas pemakaian sesi atau harian di tengah tahap produksi. | 1. Office AI otomatis mendeteksi pesan limit (bahkan saat exit code `0`) dan berhenti dengan aman tanpa merusak artefak yang sudah selesai.<br>2. Tunggu kuota pulih atau ganti akun/model, lalu klik **Lanjutkan** — tahap yang sudah selesai tidak diulang. |
| **Port `8770` sudah terpakai** | Instansi Office AI lain (desktop/server) atau aplikasi lokal sedang memakai port `8770`. | 1. `embedded_server.js` otomatis berpindah ke port `8771` sampai `8775` dan mencetak URL aktif di terminal.<br>2. Lihat port aktif di `<dataDir>/port.txt`.<br>3. Untuk memaksa port tertentu, atur variabel lingkungan `OFFICE_PORT=8780` sebelum menjalankan `node embedded_server.js`. |
| **Lebih dari satu folder proyek terdeteksi (tidak dipilih otomatis)** | Office AI menemukan `> 1` folder dengan struktur `Channels/` dan sengaja tidak menebak otomatis. | Buka **Pusat Setup** atau **Studio Video**, lalu klik tombol kandidat folder proyek yang benar. Pilihan akan tersimpan permanen. |
| **Antivirus / Windows Defender memblokir proses atau galat SSL/TLS** | Antivirus menahan proses anak CLI/Python, atau proxy jaringan mencegat sertifikat HTTPS (`SELF_SIGNED_CERT_IN_CHAIN`). | 1. Tambahkan pengecualian folder Office AI serta biner Node/Python di antivirus bila terkena blokir palsu.<br>2. Di jaringan proxy perusahaan, atur `NODE_EXTRA_CA_CERTS=<path-ke-ca.pem>` (untuk Node/Gemini) dan `REQUESTS_CA_BUNDLE` (untuk Python). Jangan mematikan verifikasi SSL secara global. |
| **Status MT5 menampilkan `mt5_unavailable` atau `terminal_not_running`** | Paket Python `MetaTrader5` belum terpasang pada interpreter Python yang dipakai, atau aplikasi MetaTrader 5 belum dibuka/login. | 1. Pasang paket: `pip install MetaTrader5` (khusus Windows).<br>2. Bila memakai virtual environment, isi jalur `python.exe` pada **MT5 & Keuangan -> Pengaturan Koneksi MT5 -> Python Path**.<br>3. Buka terminal MetaTrader 5, login ke akun, lalu klik **Segarkan** (atau pakai **Simulasi Demo Trade** tanpa MT5). |
| **Permintaan API `/mt5/*`, `/finance/*`, atau `/prompt/*` mengembalikan `HTTP 403`** | Header `X-Office-Token` hilang/salah, folder kerja menunjuk `Secrets`/`.git`, atau payload memuat kunci trading/password pada endpoint MT5 baca-saja. | 1. Sertakan header `X-Office-Token` yang cocok dengan `<meta name="office-vault-token">`.<br>2. Jangan mengirim kunci order/kredensial (`order_send`, `password`, `lot_size`, `sl`, `tp`) karena MT5 100% baca-saja.<br>3. Pilih folder kerja di luar `Secrets` dan `.git`. |
| **Event `hook_send.py` / `office_event.py` tidak muncul di kantor 3D** | Antarmuka masih berada di mode **Demo**, atau port hook tidak cocok dengan port server aktif. | 1. Klik tombol **Live** pada sidebar/bilah atas agar kantor 3D tersambung ke server lokal.<br>2. Pastikan `OFFICE_PORT` cocok dengan port di `<dataDir>/port.txt`. |
| **Garis alur 3D tidak muncul atau berlabel `"Tertunda"` alih-alih `"Real-time"`** | Garis alur dimatikan/dijeda di Pengaturan, hook Claude Code/Codex belum dipasang, atau agen memakai pembacaan log baca-saja (`collector.js`). | 1. Buka **Pengaturan -> Alur** dan pastikan **Tampilkan garis alur 3D** AKTIF serta **Jeda animasi garis** MATI.<br>2. Buka **Pusat Setup -> Hook Office AI** untuk pratinjau dan memasang hook Claude Code (`.claude/settings.json`) atau Codex CLI (`.codex/hooks.json`), lalu mulai ulang sesi CLI yang sedang terbuka.<br>3. Penyedia tanpa hook bawaan memakai `collector.js` dan diberi tanda jujur **Tertunda / Perkiraan**. |
| **Pemasang hook tampil `"Parsial / rusak"`, `"HTTP 409"`, atau menolak pratinjau** | Berkas JSON target berubah manual setelah pratinjau, pemasangan sebelumnya terpotong, format JSON rusak, atau jalur diblokir (`Secrets`, `.git`, symlink, pola kredensial). | 1. Pada **HTTP 409 (berubah setelah pratinjau)**: klik **Pratinjau JSON persis** lagi lalu konfirmasi.<br>2. Pada **Parsial / rusak**: klik **Cabut** dulu agar cadangan awal aman, baru pratinjau dan pasang ulang.<br>3. Jangan arahkan ke `Secrets`, `.git`, atau symlink; perbaiki JSON yang rusak sebelum mencoba lagi. |
| **Perubahan kode sumber tidak tampak di `OfficeAI.exe`** | Aplikasi desktop terpaket memakai salinan runtime di `Aplikasi/OfficeAI-win32-x64/`. | Jalankan `python -I repack.py` dari akar repositori (setelah mendaftarkan berkas baru di `pack.js`), lalu buka ulang `OfficeAI.exe`. |
| **Pekerjaan agen terhenti (`interrupted`) setelah Office AI ditutup** | Semua agen yang dimulai dari dalam Office AI berjalan di bawah Windows Job Object (`kill-on-close`) agar penutupan atau crash tidak pernah menyisakan proses yatim yang menghabiskan CPU/kuota. | 1. Untuk Studio Video, klik **Lanjutkan** — tahap yang sudah selesai tidak diulang.<br>2. Untuk tugas CLI panjang yang ingin tetap hidup setelah Office AI ditutup, jalankan CLI di terminal terpisah di luar Office AI (kolektor/hook baca-saja tetap memvisualisasikannya).<br>3. Aktifkan **Tanya dulu sebelum menutup saat agen masih bekerja** di Pusat Setup agar tidak tertutup tak sengaja. |

---

## Masih Mengalami Kendala?
1. Jalankan `node qa/i18n_audit.cjs` dan `node qa/v15_onboarding_test.cjs` dari akar repositori untuk memeriksa lingkungan lokal Anda.
2. Baca panduan lengkap tiap fitur di [`USER_GUIDE.id.md`](USER_GUIDE.id.md).

<!-- [Diubah oleh Codex - 2026-11-21] -->
## Sinkron MT5 otomatis (V17)

Office AI mendeteksi Python yang memiliki modul `MetaTrader5` (jalur tersimpan,
`py -3`, `python`, `python3`, lalu lokasi instalasi umum) dan terminal MT5 lokal.
Deteksi hanya mengimpor modul, tanpa membaca berkas akun. Jika keduanya ditemukan,
instalasi baru atau yang belum pernah diatur mengaktifkan sinkron otomatis.
Matikan melalui **Pengaturan → Umum → Sinkron MT5 otomatis** atau baris MT5 di
**Mulai di sini**. Pengaturan lanjutan pada MT5 & Keuangan menerima jalur Python,
jalur terminal, serta interval 1000–5000 ms (bawaan 1000 ms). **Uji sekarang**
mengulang deteksi dan pemeriksaan baca-saja.

Jembatan persisten melakukan initialize sekali per koneksi, mengirim snapshot,
dan mencoba sambung ulang dengan jeda bertahap 1–5 detik. Perubahan dikirim lewat
SSE; snapshot yang sama hanya mengirim detak ringan. Aliran macet/gagal dimulai
ulang; polling proses berurutan menjadi cadangan. Penutupan Office maupun proses
induk yang mati paksa menghentikan jembatan miliknya melalui Job Object Windows
V15. Nomor login dan sandi tidak diterima atau disimpan. Tidak ada pemanggilan
order, modifikasi, atau penutupan posisi. Login dilakukan di terminal MT5.

Tabel posisi memuat tiket, simbol, sisi, lot, harga buka/saat ini, SL/TP,
profit, swap, komisi masuk, dan net. **Net floating = profit + swap + komisi masuk
yang tersedia**. Komisi yang tidak diperoleh ditulis **n/a**; net tidak memasukkan
komponen yang belum diketahui itu. Pada penutupan sebagian, komisi masuk dibagi
sesuai volume tersisa. Angka trading menggunakan mata uang akun, 2 desimal.
Tambahan USD→IDR diberi label perkiraan; mata uang lain tidak dianggap USD.

**Terminal (ekuitas − saldo)** dan **Profit akun** merupakan pembacaan terminal
yang berbeda. Lencana cocok memakai ambang 0,02 mata uang akun; di luar itu
ditampilkan selisih bertanda. Komisi masuk mungkin sudah dipotong dari saldo,
sehingga net posisi yang memasukkannya dapat berbeda dari ekuitas dikurangi
saldo. Kredit, biaya tertahan, konversi mata uang dan waktu pembacaan yang berbeda
juga dapat memengaruhi hasil. Angka tidak dipaksa agar tampak cocok.

Saat ada posisi terbuka, tile sidebar menampilkan Net floating yang sama dengan
panel. Saat kosong, tile menampilkan **Realisasi hari ini (UTC)** dari deal trading
tertutup dalam mata uang akun. Angka itu berbeda dari saldo seluruh sumber pada
buku besar kantor. **Diperbarui N dtk lalu** dihitung dari snapshot terakhir;
status menjadi basi setelah 10 detik, termasuk saat koneksi/aliran berhenti.

Tombol **DEMO** memakai buku besar `mt5_demo.json` terpisah dan tidak mengubah
floating, analitik, atau saldo asli. Catatan lama bertanda `demo` dipindahkan dari
buku besar asli. Dalam mode live, hasil simulasi jelas berlabel DEMO; proyeksi
kantor asli tetap mengikuti snapshot asli.

Migrasi: `config.autoSyncDecided` menandai pilihan sinkron yang eksplisit.
`enabled:false` lama dengan semua nilai bawaan dianggap belum pernah diatur;
konfigurasi lama yang sudah disesuaikan dipertahankan sebagai opt-out. Pilihan
mati lama yang tersimpan persis seperti bawaan tidak dapat dibedakan dari data
yang belum disentuh; matikan sekali setelah update untuk mencatat pilihan tegas.
Cadangkan direktori data secara lokal sebelum kembali ke versi lama. Untuk
membatalkan sinkron, matikan opsi; pengaturan terminal tidak berubah.

Jika belum tersambung: buka MT5 dan login di sana; periksa status Python/modul/
terminal di Mulai di sini; pilih Uji sekarang; isi jalur Python atau terminal di
pengaturan lanjutan jika instalasi khusus belum ditemukan. MT5 bersifat opsional
dan ketiadaannya tidak menimbulkan galat saat membuka Office. Bila data basi,
periksa koneksi terminal ke broker lalu ulangi Uji sekarang. Paket Python tidak
dipasang otomatis.

Rujukan: [posisi dan swap](https://www.mql5.com/en/docs/python_metatrader5/mt5positionsget_py),
[riwayat posisi dan komisi](https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py),
[field akun](https://www.mql5.com/en/docs/python_metatrader5/mt5accountinfo_py),
[komponen ekuitas terminal](https://www.metatrader5.com/en/terminal/help/trading/report).
