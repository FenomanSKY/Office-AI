<!-- [Diubah oleh Gemini - 2026-11-21] Panduan Pengguna lengkap bahasa Indonesia untuk Office AI V15 -->
# Office AI — Panduan Pengguna

Panduan ini menjelaskan cara menyiapkan, memakai, dan memaksimalkan setiap fitur di **Office AI**. Seluruh bagian mengikuti pola tetap enam langkah: **Apa ini -> Siapkan -> Langkah demi langkah -> Hasil yang seharusnya terlihat -> Tips memaksimalkan -> Kesalahan umum**.

- Versi bahasa Inggris: [`USER_GUIDE.md`](USER_GUIDE.md)
- Mengalami galat? Lihat [`TROUBLESHOOTING.id.md`](TROUBLESHOOTING.id.md)
- Mengustomisasi dengan agen AI? Baca [`../AGENTS.md`](../AGENTS.md) dan [`EXTENDING.md`](EXTENDING.md)

---

## Daftar Isi
1. [Pusat Setup ("Mulai di sini")](#1-pusat-setup-mulai-di-sini)
2. [Kantor Voxel 3D & Kontrol Kamera](#2-kantor-voxel-3d--kontrol-kamera)
3. [Alur Tugas Langsung & Pemasang Hook (Garis 3D Real-Time)](#3-alur-tugas-langsung--pemasang-hook-garis-3d-real-time)
4. [Baki Laporan & Hook Aktivitas Langsung](#4-baki-laporan--hook-aktivitas-langsung)
4. [Bank Token & Perkiraan Biaya](#4-bank-token--perkiraan-biaya)
5. [Sayap Mutu & Persona Spesialis](#5-sayap-mutu--persona-spesialis)
6. [Pengaturan & Editor Tata Letak 3D](#6-pengaturan--editor-tata-letak-3d)
7. [Studio Video (Pipa 8 Tahap & 3 Gerbang Manusia)](#7-studio-video-pipa-8-tahap--3-gerbang-manusia)
8. [Dasbor YouTube (YouTube Studio Manager Tertanam)](#8-dasbor-youtube-youtube-studio-manager-tertanam)
9. [Prompt Agen AI (CLI Lokal & Gemini BYOK)](#9-prompt-agen-ai-cli-lokal--gemini-byok)
10. [MetaTrader 5 & Keuangan Kantor (Baca-Saja)](#10-metatrader-5--keuangan-kantor-baca-saja)
11. [Analisa & Penjelajah Obsidian Vault (Baca-Saja)](#11-analisa--penjelajah-obsidian-vault-baca-saja)
12. [Bahasa & Dukungan RTL](#12-bahasa--dukungan-rtl)

---

## 1. Pusat Setup ("Mulai di sini")

- **Apa ini:** Daftar periksa penyiapan terpadu yang mendeteksi folder proyek, agen CLI lokal, kunci Gemini API, folder Dasbor YouTube, status MT5 baca-saja, serta preferensi bahasa/mata uang/tema dalam satu layar.
- **Siapkan:** Tidak ada prasyarat awal. Pada peluncuran pertama mode Live, Pusat Setup otomatis terbuka.
- **Langkah demi langkah:**
  1. Baca kartu **Langkah berikutnya yang disarankan** di bagian paling atas.
  2. Baca pemberitahuan satu kali mengenai **Mode Akses Penuh (Full Access)** lalu klik **Saya mengerti**.
  3. Atur hanya baris yang memang Anda butuhkan (semua integrasi bersifat opsional):
     - **Folder Proyek:** Klik kandidat yang terdeteksi otomatis, klik **Pilih folder…** (di aplikasi desktop Electron), atau tempel jalur folder yang memuat `Channels/<NamaChannel>/Videos/`, lalu klik **Simpan**.
     - **Agen CLI Terpasang:** Klik **Uji koneksi** untuk memastikan CLI lokal (`claude`, `codex`, `agy`, `opencode`, `hermes`) aktif.
     - **Kunci Gemini API (Opsional BYOK):** Tempel kunci lalu klik **Simpan Key** (disimpan lokal di `<dataDir>/secrets_local.json`).
     - **Dasbor YouTube (Opsional):** Pilih atau masukkan folder `YouTube-Studio-Manager` terpisah (atau folder proyek yang berisi `Tools/dashboard/server.py`) lalu klik **Simpan & Jalankan**.
     - **MT5 Baca-Saja (Opsional):** Buka panel **MT5 & Keuangan** jika Anda memakai MetaTrader 5 di Windows.
     - **Bahasa / Mata Uang / Tema:** Ganti langsung tanpa muat ulang.
  4. Centang **Jangan buka otomatis saat mulai** setelah selesai. Anda bisa membukanya kembali kapan saja lewat **Menu -> Mulai di sini · Pusat Setup**.
- **Hasil yang seharusnya terlihat:** Setiap baris yang siap berubah berstatus hijau (`Siap` / `Terhubung`), dan saran langkah berikutnya otomatis menyesuaikan (misalnya mengarahkan langsung ke produksi Short pertama).
- **Tips memaksimalkan:** Anda tidak wajib mengisi semua 6 baris. Bahkan hanya dengan **kunci Gemini API** (0 CLI, 0 folder proyek), Anda sudah bisa memakai kantor 3D, mode Demo, pembukuan keuangan, dan Prompt Agen AI (`Gemini API BYOK`).
- **Kesalahan umum:**
  - Mengira folder proyek otomatis terpilih padahal ada `> 1` kandidat di komputer — Office AI sengaja menunggu Anda mengklik satu kandidat agar tidak salah folder.
  - Menyimpan API key di folder kode alih-alih lewat Pusat Setup (`secrets_local.json`).

---

## 2. Kantor Voxel 3D & Kontrol Kamera

- **Apa ini:** Dunia kantor voxel 3D interaktif berukuran `48×32 m + Teras Barat` dengan 10 zona tematik (Ruang Bos, Lobby Utara & Kanban, Ruang Rapat Kaca, Obsidian Vault & Server Room, Engineering Bay, Studio Konten & Desain, Area Inti AI, Boulevard Proyek `P1..P8`, Ruang Mutu & Dokumen, Ruang MT5 & Keuangan, serta Teras Barat).
- **Siapkan:** Sudah siap bawaan (`node embedded_server.js` atau `OfficeAI.exe`). Pilih mode **Live** (terhubung ke server lokal) atau **Demo** (simulasi di memori) pada sidebar.
- **Langkah demi langkah:**
  1. **Putar / Geser / Zoom:** Seret kanvas 3D untuk memutar/menggeser kamera dan gulir mouse untuk zoom (arah mouse bisa diubah di **Pengaturan -> Kamera**).
  2. **Preset Kamera:** Buka **Menu** (kiri bawah) lalu pilih zona (`Isometrik`, `Atas`, `Ruang Bos`, `Server`, `Engineering Bay`, `Studio Konten & Desain`, `Ruang Mutu & Dokumen`, `Ruang MT5 & Keuangan`, `Teras Barat`).
  3. **Inspeksi Karakter & Benda:** Arahkan kursor ke karakter atau meja untuk melihat status; klik karakter di 3D atau di daftar penghuni sidebar untuk memfokuskan kamera.
  4. **Mode Layar Penuh / Sinema:** Klik **Panel** (kanan atas) untuk menyembunyikan sidebar, atau klik **Layar penuh**.
- **Hasil yang seharusnya terlihat:** Render 3D mulus (`drawCalls <= 340`); agen duduk mengetik saat tugas nyata berjalan, sekretaris mengantar lembar tugas, dan agen beristirahat (kopi, ping-pong, sofa) saat senggang.
- **Tips memaksimalkan:** Tekan `?` (atau klik ikon bantuan) untuk daftar pintasan keyboard. Nyalakan **Ikuti tugas aktif** di Pengaturan agar kamera otomatis menyorot agen yang sedang bekerja.
- **Kesalahan umum:**
  - Lupa keluar dari mode **Demo** saat menunggu event hook asli muncul — pastikan indikator sidebar bertuliskan **Live**.

---

## 3. Alur Tugas Langsung & Pemasang Hook (Garis 3D Real-Time)

- **Apa ini:** Busur garis delegasi 3D di atas kepala (**Bos -> Sekretaris -> Agen Utama -> Persona Spesialis -> Paket kembali**) yang dilengkapi panel **Alur Langsung** dapat diperluas, legenda warna+pola, Pengaturan Alur, dan pemasang **Hook Office AI** bercadangan aman di Pusat Setup.
- **Siapkan:**
  1. Buka **Menu -> Mulai di sini · Pusat Setup** lalu gulir ke bagian **Hook Office AI** (atau jalankan `python -I -B office_hooks.py` dari akar repositori).
  2. Pilih **Folder proyek saja** (disarankan untuk mencoba di satu folder kerja) atau **Global** (berlaku untuk semua sesi Claude Code atau Codex di komputer Anda).
  3. Klik **Cek status**, lalu **Pratinjau JSON persis** untuk melihat hasil penggabungan `.claude/settings.json` atau `.codex/hooks.json` sebelum apa pun ditulis.
  4. Klik **Pasang hook** dan konfirmasi. Office AI membuat cadangan bertanda waktu secara otomatis dan menggabungkan hook tanpa menimpa hook lain milik Anda.
  5. Biarkan opsi **"Sertakan judul tugas tersanitasi"** MATI untuk privasi maksimal (bahkan saat aktif, hanya judul ringkas `<= 120` karakter yang dikirim—isi prompt penuh dan rahasia tidak pernah dikirim).
- **Langkah demi langkah:**
  1. Mulai tugas apa saja di Claude Code, Codex CLI, **Prompt Agen AI**, atau **Studio Video**.
  2. Amati sinar cahaya menyala di atas kepala muncul dalam `<= 500 ms`: **Bos -> Sekretaris** (sinar emas berdenyut ganda; Sekretaris duduk mengetik tanpa menunda sinar) **-> Agen** (sinar warna penyedia + partikel transfer cahaya mengalir) **-> Persona Spesialis** (warna sinar, ritme denyut, pendaran bintang simpul, dan lencana label berbeda per persona).
  3. Amati **kometa kembali hijau-putih** (kepala terang + ekor bercahaya + percikan tiba) melesat balik menyusuri sinar saat subagen atau agen utama selesai (sinar merah berkedip putus-putus menandakan gagal atau batas pemakaian).
  4. Klik **Alur Langsung** di sidebar atau menu untuk membuka pohon delegasi, menyaring agen, menjeda/melanjutkan animasi garis, menyalakan/mematikan pola garis aksesibilitas, atau membuka **Legenda**.
  5. Buka **Pengaturan -> Alur** untuk mengatur garis hidup/mati, jumlah maks garis (`8..128`), ketebalan (`0,5..3`), **Animasi jalan-jalan karakter** (`Lengkap` / `Cepat` bawaan / `Mati`), serta tabel pemetaan **Jenis subagen -> Persona** yang bisa disunting (lengkap dengan tombol **Pulihkan bawaan alur**).
  6. Untuk mencabut hook kapan saja, klik **Cabut** di Pusat Setup (atau `office_hooks.py uninstall`) guna mengembalikan cadangan asli utuh atau menghapus entri Office AI secara bersih.
- **Hasil yang seharusnya terlihat:** Delegasi nyata langsung tampil di atas kepala kurang dari setengah detik (`Hook` / `Panel Prompt` / `Studio Video` = **Real-time**; log baca-saja `collector.js` untuk Gemini/OpenCode/Hermes = **Tertunda · Perkiraan**). Jumlah draw call tetap `<= 340`.
- **Tips memaksimalkan:**
  - Pertahankan **Animasi jalan-jalan** pada **Cepat** (bawaan) atau **Mati** agar laporan dan status tampil seketika tanpa menunggu karakter berjalan melintasi kantor.
  - Daftarkan nama subagen kustom tim Anda di **Pengaturan -> Alur** supaya setiap delegasi nyata langsung mengarah ke meja spesialis yang tepat.
- **Kesalahan umum:**
  - Membiarkan aplikasi di mode **Demo** saat mengharapkan hook terminal muncul — pastikan sudah beralih ke mode **Live**.
  - Mengubah `.claude/settings.json` secara manual di antara Pratinjau dan Pemasangan — Office AI mendeteksi perubahan bersamaan (`HTTP 409`) dan meminta pratinjau ulang agar konfigurasi Anda tidak tertimpa.
  - Mengharapkan cabang subagen instan dari penyedia tanpa hook — `collector.js` membaca log lokal secara baca-saja dan menandainya jujur sebagai **Tertunda / Perkiraan**.

---

## 4. Baki Laporan & Hook Aktivitas Langsung

- **Apa ini:** Baki masuk di Meja Bos yang menampung laporan selesai dari agen utama dan persona spesialis, didukung hook Python berlatensi rendah (`hook_send.py` untuk Claude Code, `office_event.py` untuk Codex/Gemini/Hermes/OpenCode) serta kolektor log lokal baca-saja (`collector.js`).
- **Siapkan:**
  - `collector.js` aktif otomatis (membaca log sesi lokal secara baca-saja; set `OFFICE_COLLECTOR=0` untuk mematikan).
  - Untuk reaksi instan **Claude Code**, daftarkan `python -B "<path-to-office-ai>/hook_send.py"` pada `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, dan `Stop` di `~/.claude/settings.json` (cukup Python 3.9+ bawaan, tanpa `pip`).
  - Untuk skrip **Codex / Gemini / Hermes / OpenCode**, panggil `python -B "<path-to-office-ai>/office_event.py" call|report|spawn|retire ...`.
- **Langkah demi langkah:**
  1. Perhatikan lencana merah belum dibaca di Meja Bos dan kartu **Baki laporan** saat tugas selesai.
  2. Klik **Baki laporan** (bilah bawah atau sidebar) untuk meninjau daftar laporan, durasi, dan token.
  3. Klik **Tandai dibaca**, **Tandai semua dibaca**, atau **Arsipkan**.
- **Hasil yang seharusnya terlihat:** Agen berjalan mengantar lembar laporan ke Baki Bos; `hook_send.py` selalu selesai `< 0,5` detik dengan `exit 0` tanpa mengirim isi prompt atau rahasia.
- **Tips memaksimalkan:** Gunakan `office_event.py spawn` dan `retire` di skrip orkestrasi paralel agar pekerja sementara muncul nyata di meja `P1..P8`.
- **Kesalahan umum:**
  - Menjalankan server di port kustom tanpa menyamakan `OFFICE_PORT` (pada port default `8770..8775`, hook otomatis membaca `<dataDir>/port.txt`).

---

## 4. Bank Token & Perkiraan Biaya

<!-- [Diubah oleh Codex - 2026-11-22] -->
### Riwayat token lokal (V22)

Sidebar mempertahankan **Token hari ini** dan menambahkan **Total sejak …**, dengan angka lengkap pada tooltip. **Paling banyak dipakai** tertutup bawaan dan memuat maksimal delapan peringkat. Pilih **Penyedia**, **Model** atau **Bulan**; buka **Lihat semua** untuk daftar lengkap berhalaman, grafik harian 30/90 hari dan kontrol impor. Mata uang mengikuti Pengaturan, termasuk perubahan saat aplikasi sedang terbuka.

Jalankan **Impor riwayat lokal lengkap** untuk memindai log lama yang masih tersedia. **Jeda impor** menyimpan progres; impor yang terputus tetap dijeda setelah Office AI dibuka lagi, lalu tombol impor yang sama meneruskannya. Berkas yang tidak berubah dilewati berdasarkan identitas, ukuran dan waktu modifikasi. Aktivitas kolektor biasa memperbarui arsip tanpa mengulang seluruh pemindaian. Tidak ada konfigurasi pengguna baru; data tersimpan di `<dataDir>/usage_history/`, berupa indeks berversi, berkas sumber bernama hash dan generasi `.bak`. Cadangkan folder ini bersama data lainnya, jangan menghapusnya untuk menyegarkan dasbor.

Sumber didukung: JSONL Claude Code (termasuk subagen), JSONL rollout Codex (termasuk akun terkelola), basis data `gen_metadata` Antigravity/Gemini dan `session_model_usage` Hermes. SQLite membutuhkan runtime dengan `node:sqlite`; sumber yang hilang, terkunci atau tidak didukung dilaporkan sebagai data tidak lengkap. Log penggunaan OpenCode belum didukung. Log yang sudah dihapus tidak dapat dipulihkan. Tanggal awal menunjukkan pemakaian yang masih dapat dicatat, bukan tanggal pembelian komputer. Pembacaan log bersifat baca-saja; arsip hanya menyimpan angka penggunaan, ID model/penyedia, hash sumber dan checkpoint. Nama proyek dan akun tidak disimpan.

Tanggal mengikuti waktu lokal saat dicatat. Claude/Codex memakai timestamp rekaman. Antigravity belum memiliki timestamp generasi yang didukung sehingga memakai tanggal modifikasi basis data; Hermes menempatkan total sesi/model pada tanggal penggunaan terakhir. Pembagian harian dua sumber tersebut bersifat perkiraan. Baris JSONL lebih dari 4 MiB dilewati; pembacaan berjalan dalam potongan berbatas dengan jeda antar-potongan, dan kueri SQLite dijalankan di worker latar. Isi prompt dan percakapan tidak disimpan di arsip.

Total sepanjang riwayat merupakan jumlah agregat harian tersimpan. Saldo harian lama dan log impor dicocokkan per penyedia/hari memakai total terbesar yang diketahui agar tidak dihitung ganda; pemakaian Gemini API langsung tetap terpisah. Cara ini mempertahankan saldo lama yang lognya hilang, tetapi rincian model dapat tetap mengikuti saldo lama sampai hasil impor yang lebih lengkap melampauinya. Tarif dibekukan saat pemakaian pertama kali diarsipkan; panel harga harian lama tetap menghitung ulang berdasarkan tarif terkini. Model tanpa harga menampilkan **n/a**, sementara tokennya tetap dihitung. Biaya adalah perkiraan setara API, bukan tagihan langganan.

- **Apa ini:** Penghitung harian di sidebar dan panel **Token & Harga** yang merangkum pemakaian token lintas provider (termasuk panggilan Gemini BYOK) serta menghitung **perkiraan biaya setara API** dalam mata uang pilihan Anda.
- **Siapkan:** Otomatis aktif dari `collector.js` dan panggilan BYOK. Tarif dapat diubah kapan saja di panel **Harga / Pemakaian Harian**.
- **Langkah demi langkah:**
  1. Klik kartu biaya di sidebar (atau **Menu -> Pemakaian Harian / Harga**).
  2. Periksa grafik batang 7 hari dan pembagian token per provider.
  3. Sesuaikan tarif USD per 1 juta token atau kurs mata uang (`IDR`, `USD`, `EUR`, `JPY`, `CNY`) lalu klik **Simpan Harga**.
- **Hasil yang seharusnya terlihat:** Angka token harian naik otomatis saat agen bekerja dan papan harian 3D di Ruang Server ikut diperbarui. Setiap angka biaya selalu diberi label **ESTIMASI**.
- **Tips memaksimalkan:** Cek tren 7 hari sebelum tugas besar agar pekerjaan rutin bisa diarahkan ke model yang lebih hemat.
- **Kesalahan umum:**
  - Mengira angka **ESTIMASI** adalah tagihan kartu kredit — paket langganan bulanan tetap berbiaya tetap; Office AI menghitung nilai setara API untuk pemantauan anggaran.

---

## 5. Sayap Mutu & Persona Spesialis

- **Apa ini:** Siklus pemeriksaan mutu terstruktur 3 ronde (`persona_call` -> `submit` -> `inspect_start` -> `verdict` -> `revise` / `learn` / `escalate`) yang dijalankan hingga **12 persona spesialis** (10 bawaan) bersama Manajer Mutu di Sayap Timur.
- **Siapkan:** Langsung siap di mode Demo atau Live lewat `office_event.py` / `POST /event`. Ubah persona di **Pengaturan -> Agen di kantor -> Persona**.
- **Langkah demi langkah:**
  1. Kirim event spesialis dari alur kerja Anda (mis. `python -I office_event.py persona_call --persona frontend-developer --engine codex --task-id ui-1 --category code`).
  2. Amati spesialis menaruh hasil ke Meja Inspeksi (baki `IN`), sementara Manajer Mutu menyalakan lampu kuning/hijau/merah.
  3. Buka **Menu -> Mutu** untuk melihat persentase lolos ronde pertama, rata-rata ronde, dan tab **Pembelajaran**.
  4. Klik **Setujui** atau **Tolak** pada catatan di **Lemari Pembelajaran**.
- **Hasil yang seharusnya terlihat:** Tugas lolos langsung diantar ke Baki Bos; kegagalan ronde ke-3 tereskalasi jelas; keputusan pembelajaran bertahan setelah restart.
- **Tips memaksimalkan:** Bedakan warna dan pakaian tiap persona departemen (engineering, desain, konten, QA) supaya beban kerja langsung terlihat di papan Kanban 3D.
- **Kesalahan umum:**
  - Mengirim `verdict` sebelum `inspect_start` (server menolak loncatan tahap dengan `HTTP 409`).
  - Memasukkan lebih dari 12 persona atau memakai slug `id` ganda.

---

## 6. Pengaturan & Editor Tata Letak 3D

- **Apa ini:** Lima tab pengaturan (**Kamera**, **Tampilan**, **Pintasan**, **Agen di kantor**, **Umum**) ditambah **Editor Tata Letak 3D** untuk memindahkan dan memutar perabot kantor secara langsung.
- **Siapkan:** Klik tombol gerigi **Pengaturan** (kanan atas) atau **Menu -> Editor Tata Letak**.
- **Langkah demi langkah:**
  1. Di **Pengaturan**, ubah pemetaan mouse, tema terang/gelap, ukuran teks (`kecil`/`sedang`/`besar`), mode kurangi animasi, pintasan keyboard, nama/avatar agen, mata uang, dan bahasa.
  2. Di **Editor Tata Letak**, buka gembok tata letak bila terkunci, pilih perabot, seret atau putar di lantai 3D, lalu pastikan indikator fisik hijau (`0` tabrakan, `0` rute buntu).
  3. Simpan atau ekspor/impor JSON pengaturan Anda.
- **Hasil yang seharusnya terlihat:** Tema, bahasa, ukuran huruf, dan posisi perabot langsung berubah dan tersimpan di `<dataDir>/settings.json`.
- **Tips memaksimalkan:** Aktifkan **Mode kurangi gerak** pada laptop lawas agar lebih ringan. Aktifkan tampilan **Garis fisik** saat menggeser meja untuk memastikan semua jalur karakter tetap terbuka.
- **Kesalahan umum:**
  - Mencoba menggeser perabot saat kunci tata letak masih aktif (buka kunci dulu di dalam Editor Tata Letak).

---

## 7. Studio Video (Pipa 8 Tahap & 3 Gerbang Manusia)

- **Apa ini:** Meja produksi video Short nyata dengan **8 tahap** (`ide` -> `naskah` -> `suara` -> `adegan` -> `render` -> `qa` -> `metadata` -> `upload`) dan **3 gerbang persetujuan manusia wajib** (**G1** Tinjau Naskah, **G2** Pratinjau Video & QA, **G3** Konfirmasi Upload Manual).
- **Siapkan:**
  1. Atur **Folder Proyek** (`localProjectDir`) lewat Pusat Setup atau kotak penyiapan langsung di dalam Studio Video.
  2. Buat minimal satu folder channel di dalamnya:
     ```text
     <folder-proyek-anda>/
       Channels/
         <NamaChannel>/
           Videos/
     ```
     *(Opsional: tambahkan `Tools/youtube/channels.json` untuk metadata channel serta skrip suara/render/QA/upload channel Anda di `Tools/` atau `Channels/<NamaChannel>/`.)*
  3. Pastikan CLI AI yang dipakai tahap Anda sudah terpasang (atau uji dengan stub/mode demo).
- **Langkah demi langkah:**
  1. Buka **Studio Video** dari sidebar atau menu.
  2. Pilih **Channel** dan **Format** (`Short`), lalu periksa tabel **Yang akan dijalankan (8 tahap)** serta peringatan alat yang belum tersedia sebelum mulai.
  3. Isi **Topik** (atau klik **Sarankan ide**) lalu klik **Mulai produksi**.
  4. **Gerbang G1 (Naskah):** Produksi berhenti otomatis setelah `script.json` selesai. Anda bisa mengedit naskah langsung di editor bawaan, mengirim catatan **Minta revisi**, atau klik **Setujui & lanjut**.
  5. Tahap **suara**, **adegan**, **render**, dan **qa** berjalan otomatis dengan log langsung. Bila QA menemukan `GAGAL` atau `RAGU`, pipa berhenti dan menampilkan temuan perbaikan (maksimal 3 ronde QA).
  6. **Gerbang G2 (Pratinjau & QA):** Putar pratinjau video dan baca laporan QA langsung di Studio Video. Setujui untuk membuat metadata (`upload.json`, `description.txt`, thumbnail) dan dry-run.
  7. **Gerbang G3 (Upload Manual Aman):** Tinjau ringkasan dry-run. Upload **TIDAK PERNAH otomatis** — Anda harus mencentang kotak konfirmasi eksplisit lalu menekan tombol konfirmasi upload untuk menjalankan skrip publikasi channel.
- **Hasil yang seharusnya terlihat:** Setiap tahap menulis artefak rapi ke `<proyek>/Channels/<Channel>/Videos/<slug>/`, tahan restart tanpa mengulang tahap yang sudah beres, dan tidak pernah mengunggah diam-diam.
- **Tips memaksimalkan:** Simpan aturan gaya channel di `AGENTS.md` dan `LEARNINGS.md` dalam folder channel agar Studio Video otomatis menyertakannya. Bila CLI terkena kuota limit di tengah jalan, tunggu atau ganti akun lalu klik **Lanjutkan** — tahap selesai tetap aman.
- **Kesalahan umum:**
  - Membuka Studio Video saat folder proyek belum diatur — ikuti kartu panduan langsung di layar atau Pusat Setup.
  - Mengira video langsung ter-render tanpa skrip audio/render lokal — cek dulu tabel **Yang akan dijalankan** untuk melihat alat apa yang sudah ada.

---

<!-- [Diubah oleh Gemini - 2026-11-21] Perbarui panduan Dasbor YouTube Tertanam V20 -->
## 8. Dasbor YouTube (YouTube Studio Manager Tertanam)

- **Apa ini:** Panel layar penuh yang menanamkan **YouTube Studio Manager** (`Ringkasan`, `Komparasi`, `Performa Konten`, `Kalender & Antrean`, `Komentar`, `Kuota API`, `Channel & Login`) di dalam Office AI, disertai pil status HUD non-rahasia dan reaksi 3D saat login OAuth hampir habis atau ada komentar baru.
- **Siapkan:**
  1. Jika `Tools/dashboard/server.py` sudah ada di dalam folder proyek Anda, Office AI mendeteksinya otomatis.
  2. Jika belum, pasang repo publik dasbor secara terpisah:
     - Unduh/clone `https://github.com/FenomanSKY/YouTube-Studio-Manager` ke folder lokal mana saja.
     - Di panel **Dasbor YouTube** (atau **Pusat Setup**), masukkan atau pilih folder tersebut di **Folder dasbor YouTube** (`dashboardDir`), lalu klik **Simpan & Jalankan**.
- **Langkah demi langkah:**
  1. Klik **Dasbor YouTube** di sidebar. Office AI otomatis menempel ke server dasbor yang sudah hidup (`managedByOffice: false`) atau menyalakan instansi terkelola sendiri (banner pemberitahuan hilang otomatis setelah ~4 detik).
  2. Gunakan 7 tab bergaya Office AI di bagian atas untuk berpindah halaman secara sinkron dua arah—mode tertanam (`?embed=office`) otomatis menyembunyikan sidebar dan merek ganda dari dasbor.
  3. Pilih **All Channels** atau channel tertentu lewat pemilih channel ringkas di bagian atas tampilan (memilih satu channel juga memunculkan bar aksi cepat: Info Akun, Buka Studio, Lihat di YouTube, Folder Proyek, dan Perpanjang Login).
  4. Ganti tema **Terang** atau **Gelap** Office AI kapan saja di Pengaturan: dasbor tertanam langsung menyesuaikan warna, tipografi, dan komponen secara real-time tanpa muat ulang, memakai font & ikon Material Symbols lokal 100% offline (nol permintaan eksternal).
  5. Pantau pil status sinkronisasi segar/basi, pil HUD, dan spanduk peringatan bila token OAuth channel mendekati kedaluwarsa, lalu perpanjang di tab **Channel & Login**.
  6. Klik **Hentikan Server Office** (hanya muncul bila server dinyalakan Office AI); server eksternal di luar Office AI **tidak pernah dimatikan**. Membuka `http://127.0.0.1:8765/` langsung di browser biasa tetap mempertahankan tampilan mandiri dasbor tanpa perubahan.
- **Hasil yang seharusnya terlihat:** Dasbor YouTube tertanam serasi dengan UI/UX Office AI di tema terang dan gelap dengan ikon tajam offline, satu area gulir tanpa terpotong, sinkronisasi tab dua arah, dan Office AI tidak menyimpan token OAuth apa pun.
- **Tips memaksimalkan:** Arahkan `dashboardDir` ke folder repo `YouTube-Studio-Manager` terpisah agar pembaruan Office AI dan Dasbor YouTube tetap saling bebas.
- **Kesalahan umum:**
  - Mengira kode dasbor sudah ikut di repo Office AI — bila belum ada `Tools/dashboard/server.py`, unduh repo `YouTube-Studio-Manager` lalu arahkan `dashboardDir` ke sana.

---

## 9. Prompt Agen AI (CLI Lokal & Gemini BYOK)

- **Apa ini:** Konsol perintah langsung dari Meja Bos untuk menjalankan prompt ke **6 eksekutor** (`Claude Code`, `Codex`, `Antigravity / Gemini`, `OpenCode`, `Hermes`, dan `Gemini API BYOK`) lengkap dengan pemilih model/effort, daftar folder kerja cepat, uji koneksi, streaming output langsung, dan koreografi 3D.
- **Siapkan:** Pasang minimal satu CLI lokal (`claude`, `codex`, `agy`, `opencode`, `hermes`) ATAU simpan **Kunci Gemini API (BYOK)** di Pusat Setup / Pengaturan Integrasi.
- **Langkah demi langkah:**
  1. Buka **Prompt Agen AI** dari sidebar atau menu.
  2. Pilih kartu agen berstatus **Siap**. Klik **Uji koneksi** terlebih dahulu untuk memastikan CLI/API merespons.
  3. Pilih **Model**, **Tingkat penalaran (Effort)** bila tersedia, dan **Folder kerja (`cwd`)** dari daftar workspace otomatis atau jalur kustom.
  4. Perhatikan sakelar **Mode Akses Penuh (`Full Access`)**:
     - **AKTIF (bawaan):** CLI lokal dapat membaca/mengubah berkas dan menjalankan perintah di `cwd` tanpa berhenti meminta izin berulang.
     - **MATI (Mode Aman / Baca-Saja):** Menjalankan mode rencana/baca-saja bila didukung CLI (`Gemini API BYOK` selalu murni REST tanpa akses shell/berkas).
  5. Tulis instruksi lalu klik **Kirim ke Agen**. Output mengalir langsung di konsol dan bisa dihentikan kapan saja lewat tombol **Hentikan**.
- **Hasil yang seharusnya terlihat:** Sekretaris 3D mengantar brief ke meja agen target (`Prompt Bos · <agen>`), output tampil real-time, dan hingga 50 riwayat tersimpan.
- **Tips memaksimalkan:** Selalu klik **Uji koneksi** setelah memasang CLI baru atau menyalakan `9router` untuk Hermes. Periksa kembali `cwd` sebelum menjalankan perintah ubah berkas dengan Full Access aktif.
- **Kesalahan umum:**
  - Memilih folder `Secrets` atau `.git` sebagai `cwd` — otomatis ditolak server dengan `HTTP 403`.
  - Mengirim prompt ke `Hermes` saat `9router` mati — nyalakan `9router` terlebih dahulu.
- **Perilaku saat menutup Office AI ketika agen masih bekerja:**
  - Setiap proses CLI dari Prompt Agen dan tahap Studio Video yang dijalankan Office AI dibungkus di dalam **Windows Job Object (`kill-on-close`)** lewat `short_process_runner.py`.
  - Bila Anda menutup jendela Electron saat masih ada agen atau tahap pipeline yang berjalan, muncul dialog konfirmasi (**"Ada N agen yang masih bekerja. Tutup dan hentikan semua / Tetap buka"**) dengan pilihan **"Jangan tanya lagi"** (juga bisa diubah di Pusat Setup).
  - Baik saat ditutup normal maupun saat aplikasi mati paksa/crash di Task Manager, Job Object otomatis menghentikan seluruh pohon proses anak (nol agen yatim tertinggal) dan menandai pekerjaan yang belum selesai sebagai **`interrupted`** di riwayat (tahap Studio Video dapat dilanjutkan lagi tanpa mengulang tahap yang sudah beres).
  - **Ingin agen panjang tetap berjalan walau Office AI ditutup?** Jalankan CLI tersebut di terminal terpisah di luar Office AI; Office AI tetap dapat memantaunya lewat kolektor log baca-saja dan hook tanpa menghentikan prosesnya saat aplikasi ditutup.

---

## 10. MetaTrader 5 & Keuangan Kantor (Baca-Saja)

- **Apa ini:** Panel 3 tab yang menggabungkan **Pemantau MetaTrader 5 100% Baca-Saja**, **Laporan Keuangan Kantor Multi-Sumber** (dimulai jujur dari `Rp 0`), serta tab **Analisa Trading** berisi Kurva Ekuitas, performa per simbol, kalender harian (heatmap), dan ekspor CSV.
- **Siapkan:**
  - Keuangan Kantor & Simulasi Demo Trade langsung bisa dipakai di semua sistem operasi.
  - Untuk pemantauan MT5 nyata (khusus Windows): jalankan `pip install MetaTrader5`, buka & login di aplikasi desktop MetaTrader 5, Office mendeteksi interpreter/terminal dan mengaktifkan sinkron otomatis bila belum pernah diatur. Periksa **Mulai di sini → MT5**; jalur lanjutan hanya diperlukan untuk instalasi khusus.
- **Langkah demi langkah:**
  1. Buka **MT5 & Keuangan** dari sidebar atau menu.
  2. **Tab 1 — Pemantau MT5:** Periksa sinkron otomatis dan Net floating. Tombol DEMO memakai buku besar terpisah; koreografi demo 3D tersedia dalam mode Demo. Trader MT5 duduk di meja 4 monitor, menyalakan suar hijau/merah, dan mengantar slip hasil transaksi tertutup ke Manajer Keuangan.
  3. **Tab 2 — Laporan Keuangan Kantor:** Catat pemasukan/pengeluaran untuk 5 sumber (`Trading MT5`, `YouTube`, `Affiliate`, `Freelance`, `Lainnya`). Deal tertutup MT5 mempertahankan mata uang akun dan dideduplikasi berdasarkan nomor tiket. USD→IDR merupakan tambahan perkiraan; konversi yang belum didukung ditulis tidak tersedia.
  4. **Tab 3 — Analisa Trading:** Saring periode `7 / 30 / 90` hari atau simbol, pantau Win Rate, Profit Factor, Max Drawdown, Kurva Ekuitas, lalu klik **Ekspor CSV** (transaksi deposit/withdraw otomatis dikecualikan).
- **Hasil yang seharusnya terlihat:** Saldo awal selalu jujur `Rp 0`, deal MT5 tidak pernah dibukukan ganda, dan segala payload kunci order/password ditolak permanen dengan `HTTP 403`.
- **Tips memaksimalkan:** Klik **Muat Data Demo** di tab Analisa Trading untuk melihat tampilan grafik dan ekspor CSV sebelum menyambungkan terminal MT5, pilih **Tampilkan data asli** untuk kembali ke analitik asli. Reset Demo hanya membersihkan buku besar demo.
- **Kesalahan umum:**
  - Virtual environment khusus belum terdeteksi — pilih jalur `python.exe` pada pengaturan lanjutan MT5, lalu gunakan Uji sekarang.

---

## 11. Analisa & Penjelajah Obsidian Vault (Baca-Saja)

- **Apa ini:**
  - **Penjelajah Obsidian Vault:** Pembaca pohon folder & catatan Markdown baca-saja di dalam Office AI, ditambah sinkronisasi ringkasan token harian opsional (`Kantor/YYYY-MM-DD.md`).
  - **Arsip Snapshot YouTube Lama:** Menjaga arsip harian lama (`<dataDir>/yt_snapshots/YYYY-MM-DD.json`) secara baca-saja berdampingan dengan Dasbor YouTube tertanam.
- **Siapkan:** Matikan Office AI, ubah `<dataDir>/config.json` untuk mengatur `"vaultRoot": "<jalur-obsidian-vault-anda>"`, lalu jalankan ulang server. *(Sengaja tidak ada endpoint HTTP untuk mengubah `vaultRoot` demi keamanan).*
- **Langkah demi langkah:**
  1. Klik rak server **OBSIDIAN** di ruang timur laut 3D atau buka **Menu -> Vault**.
  2. Telusuri folder, cari catatan `.md`, dan klik wikilink secara aman (berkas/folder yang memuat `secret`, `token`, `password`, `.env`, atau symlink diblokir).
  3. Bila diinginkan, nyalakan **Sinkron ke Obsidian** (selalu **MATI** saat server mulai) untuk menulis ringkasan pemakaian harian ke `Kantor/YYYY-MM-DD.md`.
- **Hasil yang seharusnya terlihat:** Pembacaan catatan bersih tanpa pernah menyentuh catatan pribadi Anda.
- **Tips memaksimalkan:** Biarkan sinkronisasi harian mati bila Anda hanya ingin menelusuri catatan secara baca-saja.
- **Kesalahan umum:**
  - Mengubah `config.json` saat server masih hidup — mulai ulang server agar `vaultRoot` baru terbaca.

---

## 12. Bahasa & Dukungan RTL

- **Apa ini:** Lokalisasi instan 6 bahasa bawaan: **Bahasa Indonesia (`id`)**, **English (`en`)**, **Español (`es`)**, **日本語 (`ja`)**, **中文 (`zh-CN`)**, dan **العربية (`ar` dengan tata letak kanan-ke-kiri / RTL penuh)**.
- **Siapkan:** Sudah tersedia bawaan.
- **Langkah demi langkah:**
  1. Buka **Pusat Setup** (baris 6) atau **Pengaturan -> Umum -> Bahasa**.
  2. Pilih bahasa yang diinginkan.
- **Hasil yang seharusnya terlihat:** Seluruh menu, dialog, label papan 3D, format angka, dan arah tata letak langsung berubah tanpa memuat ulang halaman.
- **Tips memaksimalkan:** Sesuaikan juga **Mata uang** (`IDR`, `USD`, `EUR`, `JPY`, `CNY`) agar estimasi biaya token sesuai kebiasaan Anda.
- **Kesalahan umum:**
  - Menambah teks UI baru saat mengedit kode tanpa mengisi keenam berkas di `locales/` — selalu jalankan `node qa/i18n_audit.cjs` setelah perubahan teks.

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
