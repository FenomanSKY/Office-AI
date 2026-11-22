// [Diubah oleh Gemini - 2026-11-21] Preload IPC aman Electron untuk pemilih folder native & cek agen aktif sebelum tutup (Office AI V15)
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'officeDesktop',
  Object.freeze({
    isElectron: true,
    pickFolder(opts = {}) {
      const payload = {
        title: typeof opts?.title === 'string' ? opts.title.slice(0, 120) : '',
        defaultPath: typeof opts?.defaultPath === 'string' ? opts.defaultPath.slice(0, 260) : ''
      };
      return ipcRenderer.invoke('office:pick-folder', payload);
    },
    getActiveRuntime() {
      return ipcRenderer.invoke('office:runtime-active');
    }
  })
);
