import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bmm', {
  load: (key: string, fb: unknown) => ipcRenderer.invoke('data:load', key, fb),
  save: (key: string, val: unknown) => ipcRenderer.invoke('data:save', key, val),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  pickFiles: () => ipcRenderer.invoke('dialog:files'),
  copyToPlaylist: (plId: string, paths: string[]) => ipcRenderer.invoke('media:copyToPlaylist', plId, paths),
  copyFolderToPlaylist: (plId: string, folder: string) => ipcRenderer.invoke('media:copyFolderToPlaylist', plId, folder),
  copyAnnouncement: (annId: string, src: string) => ipcRenderer.invoke('media:copyAnnouncement', annId, src),
  deletePlaylist: (plId: string) => ipcRenderer.invoke('media:deletePlaylist', plId),
  deleteAnnouncement: (annId: string) => ipcRenderer.invoke('media:deleteAnnouncement', annId),
  openData: () => ipcRenderer.invoke('shell:data'),
})
