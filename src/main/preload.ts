import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bmm', {
  load: (key: string, fb: unknown) => ipcRenderer.invoke('data:load', key, fb),
  save: (key: string, val: unknown) => ipcRenderer.invoke('data:save', key, val),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  pickFiles: () => ipcRenderer.invoke('dialog:files'),
  scanFolder: (p: string) => ipcRenderer.invoke('fs:scan', p),
  openData: () => ipcRenderer.invoke('shell:data'),
})
