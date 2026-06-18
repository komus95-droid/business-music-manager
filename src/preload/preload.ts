import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { IpcApi, ImportTarget, DeleteTarget } from '../shared/ipc';
import type { PersistedStore } from '../shared/store';

const api: IpcApi = {
  loadStore: () => ipcRenderer.invoke(IPC.loadStore),
  saveStore: (store: PersistedStore) => ipcRenderer.invoke(IPC.saveStore, store),
  pickMp3: (opts) => ipcRenderer.invoke(IPC.pickMp3, opts),
  importMp3: (target: ImportTarget, sourcePath: string) => ipcRenderer.invoke(IPC.importMp3, target, sourcePath),
  deleteMedia: (target: DeleteTarget) => ipcRenderer.invoke(IPC.deleteMedia, target),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke(IPC.setAutostart, enabled),
};

contextBridge.exposeInMainWorld('api', api);
