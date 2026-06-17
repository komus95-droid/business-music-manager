import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const isDev = !app.isPackaged

function dataDir(): string {
  const d = path.join(app.getPath('userData'), 'bmm-data')
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
    width: 1340, height: 860, minWidth: 1024, minHeight: 680,
    title: 'Business Music Manager',
    backgroundColor: '#0F0F12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
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

ipcMain.handle('data:load', (_e, key: string, fb: unknown) => load(key + '.json', fb))
ipcMain.handle('data:save', (_e, key: string, val: unknown) => { save(key + '.json', val); return true })
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
ipcMain.handle('fs:scan', (_e, folder: string) => {
  try {
    if (!fs.existsSync(folder)) return []
    const exts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
    return fs.readdirSync(folder)
      .filter(f => exts.includes(path.extname(f).toLowerCase()))
      .map(f => ({ name: path.basename(f, path.extname(f)), path: path.join(folder, f) }))
  } catch { return [] }
})
ipcMain.handle('shell:data', () => shell.openPath(dataDir()))
