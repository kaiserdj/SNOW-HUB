import { BrowserWindow, app, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

export function openSNUtilsPopup(): void {
  const popupWindow = new BrowserWindow({
    width: 850,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    autoHideMenuBar: true,
    title: 'SN Utils Popup',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false,
      preload: app.isPackaged
        ? join(__dirname, '../preload/extension.js')
        : join(__dirname, '../../out/preload/extension.js')
    }
  })
  
  console.log('[SN Utils] Opening Popup Window')
  popupWindow.on('closed', () => console.log('[SN Utils] Popup Window closed'))
  popupWindow.webContents.on('did-finish-load', () => {
    if (is.dev) {
      popupWindow.webContents.openDevTools({ mode: 'detach' })
    }
    popupWindow.webContents.insertCSS(`
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #86ed78; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #009156; }
      body { 
        width: 100% !important; 
        height: 100% !important; 
        overflow-x: hidden !important;
      }
      #content { width: 100% !important; margin: 0 !important; }
      .nav-tabs { border-bottom: none !important; }
    `)
  })
  
  popupWindow.loadURL('snuhub-extension://electron-snow-hub/popup.html')
}

export function openSNUtilsSettings(url?: string): void {
  const settingsWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    title: 'SN Utils Settings',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false,
      preload: app.isPackaged
        ? join(__dirname, '../preload/extension.js')
        : join(__dirname, '../../out/preload/extension.js')
    }
  })
  
  console.log('[SN Utils] Opening Settings Window:', url || 'default')

  // Handle "Save before Close" confirmation
  settingsWindow.on('close', async (e) => {
    if (settingsWindow.isDestroyed()) return
    
    // Check if dirty before closing
    try {
      const isDirty = await settingsWindow.webContents.executeJavaScript(
        'window.snuIsDirty ? window.snuIsDirty() : false'
      )

      if (isDirty) {
        e.preventDefault()
        
        const { response } = await dialog.showMessageBox(settingsWindow, {
          type: 'warning',
          buttons: ['Guardar', 'No guardar', 'Cancelar'],
          defaultId: 0,
          cancelId: 2,
          title: 'Cambios sin guardar',
          message: 'Tienes cambios sin guardar. ¿Deseas guardarlos antes de salir?',
          noLink: true
        })

        if (response === 0) { // Save
          await settingsWindow.webContents.executeJavaScript('window.snuSave ? window.snuSave() : null')
          // Small delay to allow storage to sync
          setTimeout(() => {
            if (!settingsWindow.isDestroyed()) settingsWindow.destroy()
          }, 300)
        } else if (response === 1) { // Don't Save
          settingsWindow.destroy()
        }
        // response === 2 (Cancel) - do nothing
      }
    } catch (err) {
      console.error('[SN Utils] Error during close check:', err)
      // In case of error, just close to avoid getting stuck
    }
  })

  settingsWindow.on('closed', () => console.log('[SN Utils] Settings Window closed'))
  settingsWindow.webContents.on('did-finish-load', () => {
    if (is.dev) {
      settingsWindow.webContents.openDevTools({ mode: 'detach' })
    }
    settingsWindow.webContents.insertCSS(`
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #86ed78; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #009156; }
    `)
  })
  
  const targetUrl = url || 'snuhub-extension://electron-snow-hub/settingeditor.html'
  settingsWindow.loadURL(targetUrl)
}
