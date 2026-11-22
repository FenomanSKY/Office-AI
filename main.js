'use strict';
const { app, BrowserWindow, Menu, dialog, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { startServer } = require('./embedded_server');
// [Diubah oleh Gemini - 2026-11-21] Dukungan OFFICE_AI_DATA_DIR, IPC pemilih folder aman, & konfirmasi keluar saat agen aktif (Office AI V15)
const { isBlockedPath } = require('./workspace_discovery');
const { evaluateQuitConfirmation } = require('./quit_guard');

const qaMode=process.argv.includes('--office-qa'),qaData=qaMode&&process.env.OFFICE_QA_DATA_DIR;
const envDataDir=String(process.env.OFFICE_AI_DATA_DIR||process.env.OFFICE_DATA_DIR||'').trim()||null;
// Explicit workspace mode keeps all app writes in the folder requested by the user.
const workspaceMode=process.argv.includes('--office-workspace'),workspaceData=workspaceMode?path.join(app.isPackaged?path.resolve(__dirname,'../../../..'):__dirname,'runtime','OfficeAI'):null;
const isolatedData=qaData||envDataDir||workspaceData;
if(isolatedData){app.setPath('userData',path.resolve(isolatedData));app.setPath('crashDumps',path.join(path.resolve(isolatedData),'crashes'));}
app.setName('Office AI');
let officeServer, mainWindow, stopping = false;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('local.OfficeAI');
    // Lokasi tetap ini juga dibaca oleh hook_send.py.
    const dataDir = isolatedData?path.resolve(isolatedData):path.join(app.getPath('appData'), 'OfficeAI');
    await fs.mkdir(dataDir, { recursive: true });
    app.setPath('userData', dataDir);
    officeServer = await startServer({port:qaData?Number(process.env.OFFICE_QA_PORT||0):8770,maxPort:qaData?Number(process.env.OFFICE_QA_PORT||0):8775,collector:qaData?false:{},portFile:path.join(dataDir,'port.txt'),dataDir:isolatedData?path.join(dataDir,'data'):app.isPackaged?path.join(dataDir,'data'):path.join(__dirname,'data')});
    const origin = officeServer.origin;
    // V14-B [Diubah oleh Gemini - 2026-11-21] Izinkan hanya origin Office AI dan loopback Dasbor YouTube tertanam
    const isLocal = url => { try { return new URL(url).origin === origin || Boolean(officeServer.youtubeDashboard?.isAllowedUrl?.(url)); } catch { return false; } };
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isLocal(details.url) });
    });
    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({ width: 1280, height: 800, title: 'Office AI',
      backgroundColor: '#17253a', icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, nodeIntegrationInWorker:false, webSecurity:true, allowRunningInsecureContent:false, webviewTag: false }
    });
    // [Diubah oleh Gemini - 2026-11-21] Handler IPC pilih folder lokal aman (hanya dari jendela & origin Office AI sendiri)
    ipcMain.removeHandler('office:pick-folder');
    ipcMain.handle('office:pick-folder', async (event, opts = {}) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) {
        return { ok: false, canceled: true, error: 'forbidden_sender' };
      }
      try {
        const senderOrigin = new URL(event.senderFrame?.url || '').origin;
        if (senderOrigin !== origin) return { ok: false, canceled: true, error: 'forbidden_origin' };
      } catch {
        return { ok: false, canceled: true, error: 'forbidden_origin' };
      }
      const title = typeof opts?.title === 'string' && opts.title.trim() ? opts.title.trim().slice(0, 120) : 'Select folder';
      const defaultPath = typeof opts?.defaultPath === 'string' && opts.defaultPath.trim() && !isBlockedPath(opts.defaultPath) ? path.resolve(opts.defaultPath.trim()) : undefined;
      const picked = await dialog.showOpenDialog(mainWindow, {
        title,
        defaultPath,
        properties: ['openDirectory']
      });
      if (picked.canceled || !Array.isArray(picked.filePaths) || !picked.filePaths[0]) {
        return { ok: true, canceled: true, path: '' };
      }
      const chosen = path.resolve(picked.filePaths[0]);
      if (isBlockedPath(chosen)) {
        return { ok: false, canceled: false, path: '', error: 'blocked_sensitive_path' };
      }
      return { ok: true, canceled: false, path: chosen };
    });
    // [Diubah oleh Gemini - 2026-11-21] IPC baca status agen/pipeline aktif secara aman + konfirmasi sebelum menutup jendela
    ipcMain.removeHandler('office:runtime-active');
    ipcMain.handle('office:runtime-active', async event => {
      if (!mainWindow || event.sender !== mainWindow.webContents) {
        return { ok: false, activeCount: 0, items: [], error: 'forbidden_sender' };
      }
      try {
        const senderOrigin = new URL(event.senderFrame?.url || '').origin;
        if (senderOrigin !== origin) return { ok: false, activeCount: 0, items: [], error: 'forbidden_origin' };
      } catch {
        return { ok: false, activeCount: 0, items: [], error: 'forbidden_origin' };
      }
      return officeServer?.getActiveRuntime?.() || { ok: true, activeCount: 0, promptCount: 0, shortCount: 0, items: [], skipQuitConfirm: false };
    });
    let closeConfirmed = false, closePromptOpen = false;
    mainWindow.on('close', event => {
      if (closeConfirmed || stopping || qaMode || !officeServer) return;
      const active = officeServer.getActiveRuntime?.();
      const setupSt = officeServer.getSetupState?.() || {};
      if (!active || active.activeCount <= 0 || setupSt.skipQuitConfirm) return;
      event.preventDefault();
      if (closePromptOpen) return;
      closePromptOpen = true;
      (async () => {
        let language = app.getLocale();
        try {
          const curSettings = officeServer.settings?.get?.();
          if (curSettings?.language && curSettings.language !== 'auto') language = curSettings.language;
        } catch {}
        const decision = await evaluateQuitConfirmation({
          active,
          skipQuitConfirm: Boolean(setupSt.skipQuitConfirm),
          language,
          rootDir: __dirname,
          showConfirmDialog: opts => dialog.showMessageBox(mainWindow, opts),
          persistSkipQuitConfirm: val => officeServer.saveSetupState?.({ skipQuitConfirm: Boolean(val) })
        });
        closePromptOpen = false;
        if (decision.allowQuit) {
          closeConfirmed = true;
          mainWindow?.close();
        }
      })().catch(() => { closePromptOpen = false; });
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.on('page-title-updated', event => event.preventDefault());
    mainWindow.on('closed', () => { mainWindow = null; });
    const contents = mainWindow.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const name of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
      contents.on(name, (event, url) => { if (!isLocal(url ?? event.url)) event.preventDefault(); });
    }
    contents.on('will-attach-webview', event => event.preventDefault());
    // Input keyboard dipetakan di renderer agar pintasan pengguna dihormati.
    await mainWindow.loadURL(origin + '/');
  }).catch(async error => {
    const i18n=require('./i18n')(),index=require('./locales/index.json'),catalogs=Object.fromEntries(index.map(l=>[l.code,require('./locales/'+l.code+'.json')]));i18n.configure(catalogs,index);let language=app.getLocale();try{const settings=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'data/settings.json'),'utf8'));if(settings.language!=='auto')language=settings.language;}catch{}i18n.setLanguage(language);await dialog.showMessageBox({type:'error',title:i18n.t('messages.startErrorTitle'),message:i18n.t('messages.startError')});
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (!officeServer || stopping) return;
    event.preventDefault(); stopping = true;
    officeServer.close().catch(error => console.error('Gagal membersihkan server kantor')).finally(() => app.quit());
  });
}
