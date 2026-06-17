import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const isDev = !app.isPackaged

function dataDir(): string {
  const d = path.join(app.getPath('userData'), 'bmm-data')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
function mediaDir(): string {
  const d = path.join(dataDir(), 'media')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
function playlistDir(plId: string): string {
  const d = path.join(mediaDir(), 'playlists', plId)
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
function annDir(): string {
  const d = path.join(mediaDir(), 'announcements')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
function dp(f: string) { return path.join(dataDir(), f) }
function load<T>(f: string, fb: T): T {
  try { const p = dp(f); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch {}
  return fb
}
function save(f: string, d: unknown) { fs.writeFileSync(dp(f), JSON.stringify(d, null, 2), 'utf-8') }

function createWindow() {
  const win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 1100, minHeight: 700,
    title: 'Business Music Manager',
    backgroundColor: '#0F0F12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      webSecurity: false // allow local file:// audio
    },
    show: false
  })
  isDev ? win.loadURL('http://localhost:5173') : win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.once('ready-to-show', () => win.show())
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Data
ipcMain.handle('data:load', (_e, key: string, fb: unknown) => load(key + '.json', fb))
ipcMain.handle('data:save', (_e, key: string, val: unknown) => { save(key + '.json', val); return true })

// Dialogs
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('dialog:files', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }]
  })
  return r.canceled ? [] : r.filePaths
})

// Copy files INTO app storage
ipcMain.handle('media:copyToPlaylist', async (_e, plId: string, srcPaths: string[]) => {
  const dir = playlistDir(plId)
  const results: { name: string; path: string; size: number }[] = []
  for (const src of srcPaths) {
    const fname = path.basename(src)
    const dest = path.join(dir, fname)
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
    const stat = fs.statSync(dest)
    results.push({ name: path.basename(fname, path.extname(fname)), path: dest, size: stat.size })
  }
  return results
})
ipcMain.handle('media:copyFolderToPlaylist', async (_e, plId: string, folder: string) => {
  const dir = playlistDir(plId)
  const exts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
  const files = fs.readdirSync(folder).filter(f => exts.includes(path.extname(f).toLowerCase()))
  const results: { name: string; path: string; size: number }[] = []
  for (const f of files) {
    const src = path.join(folder, f)
    const dest = path.join(dir, f)
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
    const stat = fs.statSync(dest)
    results.push({ name: path.basename(f, path.extname(f)), path: dest, size: stat.size })
  }
  return results
})
ipcMain.handle('media:copyAnnouncement', async (_e, annId: string, srcPath: string) => {
  const dir = annDir()
  const fname = annId + path.extname(srcPath)
  const dest = path.join(dir, fname)
  fs.copyFileSync(srcPath, dest)
  const stat = fs.statSync(dest)
  return { path: dest, size: stat.size }
})
ipcMain.handle('media:deletePlaylist', (_e, plId: string) => {
  const dir = path.join(mediaDir(), 'playlists', plId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
  return true
})
ipcMain.handle('media:deleteAnnouncement', (_e, annId: string) => {
  const dir = annDir()
  const files = fs.readdirSync(dir).filter(f => f.startsWith(annId))
  files.forEach(f => fs.unlinkSync(path.join(dir, f)))
  return true
})
ipcMain.handle('shell:data', () => shell.openPath(dataDir()))
