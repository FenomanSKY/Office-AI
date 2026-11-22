'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
// V16-B [Diubah oleh Gemini - 2026-11-21] Tambah modul alur garis real-time V16 (model, peta, 3D, UI, CSS, hook CLI) ke RUNTIME_FILES
// [Diubah oleh Codex - 2026-11-22] V22 server-only numeric usage history.
const RUNTIME_FILES = Object.freeze(['usage_history_store.js','personas.json','persona_schema.js','quality_store.js','specialist_wing.js','office_specialists.js','main.js', 'preload.js', 'quit_guard.js', 'workspace_discovery.js', 'embedded_server.js', 'index.html',
  'i18n.js', 'i18n_ready.js', 'locales/index.json', 'layout_rules.js', 'layout_catalog.js', 'office_layout.js', 'office.js', 'office_settings.js', 'office_settings_ui.js', 'settings_store.js', 'office_ui.css', 'office_v12.css', 'office_flow.css', 'office_panels.js', 'office_setup_ui.js', 'office_v12_ui.js', 'office_youtube_ui.js', 'office_v13_ui.js', 'office_flow_model.js', 'office_flow_map.json', 'office_flow3d.js', 'office_flow_ui.js', 'hook_send.py', 'office_event.py', 'office_hooks.py', 'office_hook_codex.py', 'office_data.js', 'collector.js', 'pricing.json', 'chars.js', 'furniture.js', 'mt5_readonly_bridge.py', 'mt5_finance_store.js', /* [Diubah oleh Codex - 2026-11-21] */ 'mt5_sync.js', 'short_workflow_store.js', /* V14-A [Diubah oleh Codex - 2026-11-21] */ 'short_pipeline.js', 'short_process_runner.py', 'office_short_ui.js', 'office_short.css', 'youtube_analytics_store.js', 'youtube_dashboard_host.js', 'agent_prompt_store.js', 'vendor/three.min.js', 'icon.ico'].concat(require('./locales/index.json').map(l=>'locales/'+l.code+'.json')));
async function copyRegular(root, name, destination) {
  const source = path.join(root, name);
  const info = await fs.lstat(source), parent = await fs.lstat(path.dirname(source));
  if (!info.isFile() || info.isSymbolicLink() || parent.isSymbolicLink()) throw new Error('Berkas runtime tidak reguler: ' + name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
async function stageRuntime(root = __dirname) {
  const stage = await fs.mkdtemp(path.join(root, '.pack-stage-'));
  try {
    // Salin nama eksplisit: tidak pernah menelusuri folder sumber lain.
    for (const name of RUNTIME_FILES) await copyRegular(root, name, path.join(stage, name));
    const source = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
      name: source.name, version: source.version, description: source.description, author: 'Office AI', main: 'main.js'
    }, null, 2) + '\n');
    return stage;
  } catch (error) { await removeStage(root, stage); throw error; }
}
async function removeStage(root, stage) {
  const base = path.resolve(root), target = path.resolve(stage);
  if (path.dirname(target) !== base || !path.basename(target).startsWith('.pack-stage-')) {
    throw new Error('Lokasi staging di luar folder kerja');
  }
  await fs.rm(target, { recursive: true, force: true });
}
async function pack() {
  // Dependensi hanya diperlukan ketika koordinator menjalankan npm run pack.
  const packager = require('@electron/packager');
  const stage = await stageRuntime();
  try {
    const config = require('./package.json');
    const outputs = await packager({ dir: stage, name: 'OfficeAI', platform: 'win32', arch: 'x64',
      out: path.join(__dirname, 'Aplikasi'), overwrite: true, icon: path.join(__dirname, 'icon.ico'),
      electronVersion: config.devDependencies.electron, asar: false, prune: false,
      executableName: 'OfficeAI', appVersion: config.version,
      win32metadata: { ProductName: 'Office AI', FileDescription: 'Office AI' }
    });
    for (const output of outputs) {
      await copyRegular(__dirname, 'hook_send.py', path.join(output, 'hook_send.py'));
      console.log('Paket siap: ' + path.join(output, 'OfficeAI.exe'));
    }
  } finally { await removeStage(__dirname, stage); }
}
if (require.main === module) pack().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { RUNTIME_FILES, stageRuntime, removeStage };
