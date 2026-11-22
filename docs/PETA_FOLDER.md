# Peta folder Office AI (dirapikan 2026-11-16)

Jalankan aplikasi: dobel-klik **`00_Office AI.lnk`** di akar folder (menunjuk ke `Aplikasi\OfficeAI-win32-x64\OfficeAI.exe`).
Bila pintasan hilang atau folder dipindah: `powershell -NoProfile -ExecutionPolicy Bypass -File docs\buat_pintasan.ps1`.

## Susunan

| Lokasi | Isi |
|---|---|
| `00_Office AI.lnk` | Pintasan ke aplikasi (di bagian terdepan) |
| `Aplikasi\OfficeAI-win32-x64\` | Aplikasi terpaket (`OfficeAI.exe` + berkas pendamping; dulu bernama `dist`). Dirakit ulang dengan `python -I repack.py` |
| `README.md`, `REPORT.md`, `CATATAN_KOORDINATOR.md` | Panduan, laporan teknis per fase, catatan koordinator |
| `docs\briefs\` | Brief/PRD agen, termasuk V10 dan revisi layout `PRD_REVISI_V10_KANTOR_UTAMA.md`, prompt agent, serta screenshot referensinya |
| `docs\log-agen\` | Keluaran dan log agen (`astra_*`, `sol_*`, `debug.log`) |
| `cadangan\` | Semua cadangan berkas (`*.bak_*`) |
| `qa\` | Skrip uji, hasil uji, dan tangkapan layar uji |
| `locales\` | Terjemahan (id, en, es, ja, zh-CN, ar) |
| `vendor\` | three.js lokal r149 |
| `shots\`, `logs\`, `runtime\` | Tangkapan layar lama, log, data runtime |
| `node_modules\` | Hanya dipakai untuk mengambil berkas Electron saat merakit paket |

Berkas sumber aplikasi (`main.js`, `office.js`, `furniture.js`, `chars.js`, `embedded_server.js`, `collector.js`, `office_*.js`, `i18n*.js`, `index.html`, `office_ui.css`, `pricing.json`, dst.) SENGAJA tetap di akar: path-nya dipakai langsung oleh `pack.js`/`repack.py`, hook Claude Code (`hook_send.py`), dan skrip pemanggil CLI eksternal (`office_event.py`). Jangan dipindah tanpa memperbarui semuanya.

## Catatan
- Dokumen lama (REPORT, brief, laporan QA) masih menyebut `dist\OfficeAI-win32-x64`: sekarang artinya `Aplikasi\OfficeAI-win32-x64`.
- Skrip QA lama di `qa\` yang membandingkan dengan cadangan (`*.bak_*`) mencari di akar; berkas itu kini ada di `cadangan\`. Ubah path-nya bila ingin mengulang audit "sebelum".
- Akun Codex/Opus yang bekerja di folder ini tidak boleh menjalankan atau mematikan `OfficeAI.exe` dari sandbox (menimbulkan jendela error); uji lewat server uji + Chromium headless.

## Tambahan V10

- personas.json dan persona_schema.js: data persona bawaan dan skema bersama klien/server.
- specialist_wing.js: denah Divisi Spesialis, meja/baki/papan dan registri V9.
- office_specialists.js: karakter persona/manajer, antrean mutu, panel Mutu dan editor Persona.
- quality_store.js: validasi event, riwayat mutu/laporan/pembelajaran dan penyimpanan atomik.
- qa/v10_event_contract.md: protokol tanpa teks bebas; qa/v10_simulate_flow.py: simulator HTTP.
- qa/v10_progress.md, qa/v10_*results.json, qa/v10-shots/: checkpoint, angka dan bukti visual.
- cadangan/*.bak_v10: salinan sebelum perubahan; path relatif diratakan dengan __.
