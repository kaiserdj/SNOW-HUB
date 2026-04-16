import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { spawnSync } from 'child_process'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  Session,
  shell,
  Tray,
  WebContentsView
} from 'electron'
import * as fs from 'fs'
import path, { join } from 'path'
import { pathToFileURL } from 'url'
import icon from '../../resources/icon.png?asset'
import { createInstanceWindow } from './instanceWindow'
import { Tab } from './viewManager'
import { initializeSessions } from './sessionManager'
import { openSNUtilsPopup, openSNUtilsSettings } from './snUtilsWindows'

if (is.dev) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
}
import {
  addInstance,
  deleteInstance,
  editInstance,
  getCredentials,
  getInstances,
  saveCredentials,
  store,
  getSnUtilsStorage,
  setSnUtilsStorage
} from './store'
import { viewManager } from './viewManager'

const gotTheLock = app.requestSingleInstanceLock()

// Disable Autofill features to prevent "Autofill.enable" and "Autofill.setAddresses" errors in DevTools.
// These are caused by DevTools trying to use features that are not fully supported or enabled in Electron.
app.commandLine.appendSwitch('disable-autofill')
app.commandLine.appendSwitch(
  'disable-features',
  'AutofillServerCommunication,AutofillShowTypePredictions,AutofillAddressImport,AutofillUploadCard,AutofillDownloadManager'
)
app.commandLine.appendSwitch('disable-blink-features', 'Autofill')

if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window.
  const allWindows = BrowserWindow.getAllWindows()
  const mainWindow = allWindows.find(w => w.getTitle() === 'SNOW Hub Manager')
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    // If manager is closed, recreate it
    createWindow()
  }
})

// Register chrome-extension as a privileged scheme
// This is required to load extension assets from within HTTPS ServiceNow pages
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'snuhub-extension',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
      bypassCSP: true
    }
  },
  {
    scheme: 'instance-icon',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

let tray: Tray | null = null

const pendingRequests = new Map<string, (resp: unknown) => void>()
const lastTransferMessages = new Map<string, any>()
let backgroundWindow: BrowserWindow | null = null

function initializeSNUtilsBackground(): void {
  if (backgroundWindow) return

  backgroundWindow = new BrowserWindow({
    show: is.dev,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false,
      preload: app.isPackaged
        ? join(__dirname, '../preload/extension.js')
        : join(__dirname, '../../out/preload/extension.js')
    },
    title: 'SN Utils Background',
    icon
  })

  if (is.dev) {
    backgroundWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Use a data URL to load the background script
  const bgHtml = `<!DOCTYPE html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: snuhub-extension:; connect-src *;">
    <script>
      (function() {
        window.isBackgroundWorker = true;
        var init = function() {
          if (window.snUtilsChrome) {
            console.log('[Background] Initializing chrome polyfill...');
            try { 
              window.chrome = window.snUtilsChrome; 
              window.browser = window.snUtilsChrome;
            } catch(e) { 
              console.warn('[Background] Polyfill ready via Object.assign');
              if (!window.chrome) window.chrome = {};
              Object.assign(window.chrome, window.snUtilsChrome);
              window.browser = window.snUtilsChrome;
            }
            
            // Fix missing constructors
            if (window.chrome) {
               if (!window.chrome.declarativeContent) window.chrome.declarativeContent = {};
               window.chrome.declarativeContent.PageStateMatcher = function(opts) {
                 if (opts) {
                   for (var k in opts) {
                     this[k] = opts[k];
                   }
                 }
               };
               window.chrome.declarativeContent.ShowAction = function() {};
               window.chrome.declarativeContent.ShowPageAction = function() {};
            }

            console.log('[Background] Polyfill ready. Loading background.js...');
            var s = document.createElement('script');
            s.src = "snuhub-extension://electron-snow-hub/background.js";
            (document.head || document.documentElement).appendChild(s);
          } else {
            console.log('[Background] Waiting for snUtilsChrome...');
            setTimeout(init, 10);
          }
        };
        init();
      })();
    </script>
    </head><body>
  </body></html>`
  const dataUrl = `data:text/html;base64,${Buffer.from(bgHtml).toString('base64')}`

  backgroundWindow.loadURL(dataUrl)
  console.log('[SN Utils] Background worker initialized')
}

function createWindow(): void {
  initializeSNUtilsBackground()
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'SNOW Hub Manager',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('snuhub-extension://')) {
      // Let ViewManager handle internal links
      console.log('[Main] Internal extension URL opened:', details.url)
      return { action: 'allow' }
    }
    shell.openExternal(details.url).catch(console.error)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.snowhub.dashboard')

  // Helper to setup a session with our protocol handler and CORS headers
  const setupSession = (sess: Session): void => {
    // 1. Register protocol for this session
    sess.protocol.handle('snuhub-extension', async (request) => {
      try {
        const url = new URL(request.url)
        if (url.hostname === 'electron-snow-hub') {
          let cleanPath = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname
          cleanPath = cleanPath.split('?')[0].split('#')[0]

          const baseDir = app.isPackaged
            ? path.join(process.resourcesPath, 'extensions')
            : path.join(app.getAppPath(), 'extensions')

          const extensionPath = path.normalize(path.join(baseDir, 'snowUtils', cleanPath))

          if (!fs.existsSync(extensionPath)) {
            if (extensionPath.endsWith('.map')) return new Response('', { status: 200 })
            console.warn(`[Protocol] 404: ${extensionPath}`)
            return new Response('Not Found', { status: 404 })
          }

          console.log(`[Protocol] Serving (${sess.getStoragePath() || 'default'}): ${request.url}`)
          return net.fetch(pathToFileURL(extensionPath).toString())
        }
      } catch (e) {
        console.error('[Protocol] Error:', e)
      }
      return new Response('Not Found', { status: 404 })
    })

    // 2. Setup Headers (CORS Bypass and Origin Spoofing for extensions)
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const requestHeaders = { ...details.requestHeaders }

      // Detect if this request comes from our extension
      const origin =
        requestHeaders['Origin'] ||
        requestHeaders['origin'] ||
        details.referrer ||
        (details as { originUrl?: string }).originUrl

      // If a request to ServiceNow originates from our extension,
      // spoof the Origin and Referer to match the ServiceNow instance.
      if (details.url.includes('.service-now.com/') && origin?.startsWith('snuhub-extension://')) {
        try {
          const url = new URL(details.url)
          requestHeaders['Origin'] = url.origin
          requestHeaders['Referer'] = url.origin + '/'
          requestHeaders['Sec-Fetch-Site'] = 'same-origin'
          requestHeaders['X-Requested-With'] = 'XMLHttpRequest'

          // CRITICAL: Manually inject cookies if Chromium is stripping them due to SameSite policies.
          // Electron's webRequest often doesn't send cookies to custom protocols by default.
          if (!requestHeaders['Cookie'] && !requestHeaders['cookie']) {
            sess.cookies
              .get({ url: details.url })
              .then((cookies) => {
                if (cookies.length > 0) {
                  const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
                  requestHeaders['Cookie'] = cookieStr
                }
                callback({ requestHeaders })
              })
              .catch(() => callback({ requestHeaders }))
            return
          }
        } catch {
          /* ignore */
        }
      }
      callback({ requestHeaders })
    })

    sess.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders }
      const isServiceNow = details.url.includes('.service-now.com/')

      if (isServiceNow) {
        responseHeaders['Access-Control-Allow-Origin'] = ['snuhub-extension://electron-snow-hub']
        responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
        responseHeaders['Access-Control-Allow-Headers'] = [
          'Origin, X-Requested-With, Content-Type, Accept, X-UserToken, x-usertoken, Authorization, Cache-Control, Pragma, X-JSON'
        ]
        responseHeaders['Access-Control-Allow-Credentials'] = ['true']

        // Rewrite Set-Cookie to allow storage and future transmission from extension pages
        if (responseHeaders['Set-Cookie'] || responseHeaders['set-cookie']) {
          const key = responseHeaders['Set-Cookie'] ? 'Set-Cookie' : 'set-cookie'
          const cookies = responseHeaders[key] as string[]
          responseHeaders[key] = cookies.map((c) => {
            if (!c.toLowerCase().includes('samesite=none')) {
              // Remove conflicting SameSite/Secure if present, then force new ones
              const parts = c.split(';')
              const filteredParts = parts.filter(
                (p) =>
                  !p.trim().toLowerCase().startsWith('samesite=') &&
                  !p.trim().toLowerCase().startsWith('secure')
              )
              const base = filteredParts.join(';')
              return `${base.trim()}; SameSite=None; Secure`
            }
            return c
          })
        }

        // Force 200 OK for OPTIONS preflights to bypass server-side blocks
        if (details.method === 'OPTIONS' && details.statusCode !== 200) {
          callback({
            responseHeaders,
            statusLine: 'HTTP/1.1 200 OK'
          })
          return
        }
      }

      callback({ responseHeaders })
    })
  }

  // Handle session creation to register protocol and headers
  setupSession(session.defaultSession)
  app.on('session-created', (sess) => {
    setupSession(sess)
  })

  // Register other protocols globally
  protocol.handle('instance-icon', (request) => {
    try {
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)
      if (process.platform === 'win32' && filePath.startsWith('/') && filePath.includes(':')) {
        filePath = filePath.substring(1)
      }
      if (fs.existsSync(filePath)) {
        return net.fetch(pathToFileURL(filePath).toString())
      }
    } catch (e) {
      console.error('[Protocol] Error handling instance-icon:', e)
    }
    return new Response('Not Found', { status: 404 })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    window.webContents.on('console-message', (event) => {
      const levels: Record<number, string> = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' }
      const winTitle = window.getTitle() || 'Unknown Window'
      console.log(
        `[Window Console ${levels[event.level] || event.level}] (${winTitle}): ${event.message}`
      )
    })

    // Check if we should quit when this window closes
    window.on('closed', () => {
      const runInBackground = store.get('runInBackground')
      if (!runInBackground) {
        const allWindows = BrowserWindow.getAllWindows()
        // Filter out the background window
        const mainWindows = allWindows.filter((w) => w !== backgroundWindow)
        if (mainWindows.length === 0) {
          app.quit()
        }
      }
    })
  })


  // Initialize Sessions and extensions
  initializeSessions()

  // --- IPC HOOKS ---

  // Store Instances
  ipcMain.handle('get-instances', () => getInstances())
  ipcMain.handle('add-instance', (_, instance) => addInstance(instance))
  ipcMain.handle('edit-instance', (_, id, instance) => editInstance(id, instance))
  ipcMain.handle('delete-instance', (_, id) => deleteInstance(id))


  // Store Credentials
  ipcMain.handle('save-credentials', (_, id, username, password) =>
    saveCredentials(id, username, password)
  )
  ipcMain.handle('get-credentials', (_, id) => getCredentials(id))


  // New: Retrieve cached transfer data (for codeeditor/scriptsync)
  ipcMain.handle('get-last-transfer-message', (_, eventType: string) => {
    console.log('[IPC] get-last-transfer-message:', eventType)
    return lastTransferMessages.get(eventType) || null
  })

  // Window Management
  const createShortcut = async (instanceId: string): Promise<boolean> => {
    const instances = getInstances()
    const instance = instances.find((i) => i.id === instanceId)
    if (!instance) return false

    const desktopPath = app.getPath('desktop')
    const shortcutPath = path.join(desktopPath, `${instance.name}.lnk`)

    return shell.writeShortcutLink(shortcutPath, 'create', {
      target: process.execPath,
      args: `--open-instance=${instanceId}`,
      description: `Open ${instance.name} in SNOW Hub`,
      icon: instance.icon || undefined,
      iconIndex: 0,
      appUserModelId: `com.snowhub.instance.${instanceId}`
    })
  }

  ipcMain.handle('open-instance', (_, id) => {
    const instances = getInstances()
    const instance = instances.find((i) => i.id === id)
    if (instance) createInstanceWindow(instance)
  })

  ipcMain.handle('pick-icon', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico'] }]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('create-desktop-shortcut', async (_, instanceId) => {
    return await createShortcut(instanceId)
  })

  // Tabs Management
  ipcMain.handle('create-tab', (_, instanceId, url) => {
    return viewManager.createTab(instanceId, url)
  })

  ipcMain.handle('close-tab', (_, instanceId, tabId) => {
    viewManager.closeTab(instanceId, tabId)
  })

  ipcMain.handle('switch-tab', (_, instanceId, tabId) => {
    viewManager.switchTab(instanceId, tabId)
  })

  ipcMain.handle('get-tabs', (_, instanceId) => {
    return viewManager.getTabs(instanceId)
  })

  ipcMain.handle('go-back', (_, instanceId, tabId) => {
    viewManager.goBack(instanceId, tabId)
  })

  ipcMain.handle('go-forward', (_, instanceId, tabId) => {
    viewManager.goForward(instanceId, tabId)
  })

  ipcMain.handle('reload', (_, instanceId, tabId) => {
    viewManager.reload(instanceId, tabId)
  })

  ipcMain.handle('navigate', (_, instanceId, tabId, url) => {
    viewManager.navigate(instanceId, tabId, url)
  })

  ipcMain.handle('reorder-tab', (_, instanceId, tabId, newIndex) => {
    viewManager.reorderTab(instanceId, tabId, newIndex)
  })

  ipcMain.handle('execute-javascript', (_, instanceId, tabId, script) => {
    return viewManager.executeJavaScript(instanceId, tabId, script)
  })

  // SN Utils specialized windows
  ipcMain.handle('open-sn-utils-popup', () => {
    openSNUtilsPopup()
  })

  ipcMain.handle('open-sn-utils-settings', () => {
    openSNUtilsSettings()
  })

  // Chrome Tabs/Windows Bridge for background scripts
  ipcMain.handle('chrome-tabs-update', (_, tabId, updateProperties) => {
    const instances = viewManager.getInstances()
    
    // Find the instance and tab
    let targetTab: Tab | null = null
    let targetInstId: string | null = null
    
    const numericTabId = typeof tabId === 'number' ? tabId : parseInt(String(tabId), 10)
    
    for (const [instId, instData] of instances.entries()) {
      if (!isNaN(numericTabId) && instData.tabs.has(numericTabId)) {
        targetTab = instData.tabs.get(numericTabId)!.data
        targetInstId = instId
        break
      }
    }

    // Fallback to active tab ONLY if tabId was not provided (null or undefined)
    if (!targetTab && (tabId === null || tabId === undefined)) {
      targetTab = viewManager.getActiveTabGlobal()
      if (targetTab) {
        for (const [instId, instData] of instances.entries()) {
          if (instData.tabs.has(targetTab.id)) {
             targetInstId = instId
             break
          }
        }
      }
    }

    if (!targetTab || !targetInstId) {
        console.warn(`[IPC] chrome-tabs-update: Target tab not found for ID: ${tabId}`)
        return null
    }

    if (updateProperties.active) {
      viewManager.switchTab(targetInstId, targetTab.id)
    }

    if (updateProperties.url) {
      viewManager.navigate(targetInstId, targetTab.id, updateProperties.url)
    }

    return targetTab
  })

  ipcMain.handle('chrome-tabs-reload', () => {
    const activeTab = viewManager.getActiveTabGlobal()
    if (!activeTab) return
    const instances = viewManager.getInstances()
    for (const [instId, instData] of instances.entries()) {
      if (instData.tabs.has(activeTab.id)) {
        viewManager.reload(instId, activeTab.id)
        break
      }
    }
  })

  ipcMain.handle('chrome-windows-create', (_, createData) => {
    console.log('[IPC] chrome-windows-create:', createData)
    if (createData.url) {
      const instancesMap = viewManager.getInstances()
      const firstInstId = instancesMap.keys().next().value
      if (firstInstId) {
        const tab = viewManager.createTab(firstInstId, createData.url)
        if (tab) {
          return { id: tab.id, tabs: [{ id: tab.id, url: tab.url }] }
        }
      }
    }
    return { id: 1 }
  })

  ipcMain.handle('chrome-tabs-create', (_, createData) => {
    console.log('[IPC] chrome-tabs-create:', createData)

    // NEW: If it's an internal extension page like settings, open in a separate window
    // so it has a native close button as requested by the user.
    if (createData.url && (createData.url as string).includes('settingeditor.html')) {
        openSNUtilsSettings(createData.url as string)
        return { id: 999, url: createData.url, active: true } 
    }

    const instancesMap = viewManager.getInstances()
    const firstInstId = instancesMap.keys().next().value
    if (firstInstId && createData.url) {
        const tab = viewManager.createTab(firstInstId, createData.url)
        return tab ? { id: tab.id, url: tab.url, active: true } : null
    }
    return null
  })

  // Extension Bridge IPCs

  ipcMain.handle('query-active-tab', () => {
    const activeTab = viewManager.getActiveTabGlobal()
    if (!activeTab) return null
    return {
      id: activeTab.id,
      url: activeTab.url,
      title: activeTab.title,
      active: true,
      windowId: 1
    }
  })

  ipcMain.handle('chrome-tabs-query', (_, queryInfo) => {
    // If querying for active tab in current window, use our optimized global search
    if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
      const activeTab = viewManager.getActiveTabGlobal()
      if (activeTab) {
        return [{
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          active: true,
          windowId: 1
        }]
      }
    }

    // Default: return all tabs (renderer will filter if needed)
    return viewManager.getAllTabsGlobal().map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.isActive,
      windowId: 1
    }))
  })

  viewManager.setBroadcastHandler((tabId, changeInfo, tabData) => {
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('chrome-tabs-updated-relay', tabId, changeInfo, tabData)
      }
    })
    viewManager.broadcast('chrome-tabs-updated-relay', tabId, changeInfo, tabData)
  })

  // Hook into viewManager events
  
  ipcMain.handle('chrome-tabs-get', (_, tabId: string | number) => {
    const numericId = typeof tabId === 'number' ? tabId : parseInt(String(tabId), 10)
    const tabData = isNaN(numericId) ? null : viewManager.getTabByIdGlobal(numericId)
    if (!tabData) return null
    return {
      id: tabData.id,
      url: tabData.url,
      title: tabData.title,
      active: tabData.isActive,
      status: 'complete',
      windowId: 1
    }
  })

  ipcMain.handle('chrome-tabs-executeScript', async (_, tabId, details) => {
    console.log(`[IPC] chrome-tabs-executeScript for tab ${tabId}`)
    const numericId = typeof tabId === 'number' ? tabId : parseInt(String(tabId), 10)
    if (isNaN(numericId)) return []

    // Find the view for this tab ID
    const instances = viewManager.getInstances()
    let targetView: WebContentsView | null = null
    for (const instData of instances.values()) {
      if (instData.tabs.has(numericId)) {
        targetView = instData.tabs.get(numericId)!.view
        break
      }
    }

    if (targetView && details.code) {
      try {
        const result = await targetView.webContents.executeJavaScript(details.code)
        return [result]
      } catch (e) {
        console.error(`[IPC] Error in chrome-tabs-executeScript:`, e)
        throw e
      }
    }
    return []
  })

  ipcMain.handle('chrome-windows-update', (_, _windowId, updateProperties) => {
    console.log(`[IPC] chrome-windows-update:`, updateProperties)
    if (updateProperties.focused) {
      // Find which instance window has focus (or which one owns the tab if windowId was specific,
      // but usually snutils uses current window)
      const activeView = viewManager.getActiveViewGlobal()
      if (activeView) {
        const instances = viewManager.getInstances()
        for (const instData of instances.values()) {
          const tabs = Array.from(instData.tabs.values())
          if (tabs.some(t => t.view === activeView)) {
            instData.browserWindow.focus()
            break
          }
        }
      }
    }
    return { id: 1 }
  })

  // Chrome Storage Persistence
  const handleStorageGet = (space: string, keys: any) => {
    const rawData = getSnUtilsStorage()
    const snUtilsData = (rawData as Record<string, Record<string, unknown>>) || {}
    const storageSpace = snUtilsData[space] || {}

    console.log(`[Storage] GET ${space} (Keys: ${JSON.stringify(keys)})`)

    if (keys === null || keys === undefined || keys === '' || (Array.isArray(keys) && keys.length === 0)) {
      return storageSpace
    }

    if (typeof keys === 'string') {
      const res: Record<string, unknown> = {}
      if (keys in storageSpace) {
        res[keys] = storageSpace[keys]
      }
      return res
    }

    if (Array.isArray(keys)) {
      const result: Record<string, unknown> = {}
      keys.forEach((k) => {
        if (k in storageSpace) {
          result[k] = storageSpace[k]
        }
      })
      return result
    }

    if (typeof keys === 'object') {
      const result = { ...keys } as Record<string, unknown>
      Object.keys(keys).forEach((k) => {
        if (k in storageSpace) {
          result[k] = storageSpace[k]
        }
      })
      return result
    }

    return storageSpace
  }

  const handleStorageSet = (space: string, items: Record<string, unknown>) => {
    const snUtilsData = getSnUtilsStorage() || {}
    const currentSpace = snUtilsData[space] || {}
    const newSpace = { ...currentSpace, ...items }
    
    console.log(`[Storage] SET ${space}. Keys:`, Object.keys(items))
    
    snUtilsData[space] = newSpace
    setSnUtilsStorage(snUtilsData)
    
    // Broadcast change for chrome.storage.onChanged
    const update = { space, items }
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('chrome-storage-changed', update)
      }
    })

    viewManager.getInstances().forEach((inst) => {
      if (!inst.browserWindow.isDestroyed()) {
        inst.tabs.forEach((tab) => {
          if (!tab.view.webContents.isDestroyed()) {
            tab.view.webContents.send('chrome-storage-changed', update)
          }
        })
      }
    })

    return true
  }

  const handleStorageRemove = (space: string, keys: string | string[]) => {
    const spacePath = `snUtilsStorage.${space}`
    const storageSpace = (store.get(spacePath) as Record<string, unknown>) || {}

    console.log(`[Storage] REMOVE ${spacePath} keys:`, keys)

    if (typeof keys === 'string') {
      delete storageSpace[keys]
    } else if (Array.isArray(keys)) {
      keys.forEach((k) => delete storageSpace[k])
    }

    store.set(spacePath, storageSpace)

    // Broadcast change
    const update = { space, items: {}, removedKeys: Array.isArray(keys) ? keys : [keys] }
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('chrome-storage-changed', update)
    })

    return true
  }

  ipcMain.handle('chrome-storage-get', (_, space, keys) => handleStorageGet(space, keys))
  ipcMain.handle('chrome-storage-set', (_, space, items) => handleStorageSet(space, items))
  ipcMain.handle('chrome-storage-remove', (_, space, keys) => handleStorageRemove(space, keys))
  ipcMain.handle('chrome-storage-clear', (_, space) => {
    const spacePath = `snUtilsStorage.${space}`
    console.log(`[Storage] CLEAR ${spacePath}`)
    store.set(spacePath, {})
    return true
  })

  // Chrome Cookies Bridge
  ipcMain.handle('chrome-cookies-get', async (_, details) => {
    const origin = details.url ? new URL(details.url).origin : 'unknown'
    console.log(`[IPC] chrome-cookies-get for ${details.name} on ${origin}`)

    // 1. Try to find the session that matches the URL if provided
    if (details.url) {
      try {
        const instances = viewManager.getInstances()
        console.log(`[IPC] Searching across ${instances.size} instance sessions`)
        for (const [id, data] of instances.entries()) {
          const sess = session.fromPartition(data.sessionId)
          const cookies = await sess.cookies.get(details)
          if (cookies.length > 0) {
            console.log(`[IPC] Found ${details.name} in session for instance ${id}`)
            return cookies[0]
          }
        }
      } catch (e) {
        console.error('[IPC] Error in chrome-cookies-get instance search:', e)
      }
    }

    // 2. Fallback to active view's session
    const view = viewManager.getActiveViewGlobal()
    if (view) {
      console.log('[IPC] Falling back to active view session search')
      const cookies = await view.webContents.session.cookies.get(details)
      if (cookies.length > 0) return cookies[0]
    }

    console.log(`[IPC] Cookie ${details.name} not found in any session`)
    return null
  })

  ipcMain.handle('chrome-cookies-getAll', async (_, details) => {
    console.log(`[IPC] chrome-cookies-getAll for ${details.url || 'all URLs'}`)
    // If URL is provided, try to find the session that has cookies for this URL
    if (details.url) {
      try {
        const instances = viewManager.getInstances()
        for (const data of instances.values()) {
          const sess = session.fromPartition(data.sessionId)
          const cookies = await sess.cookies.get(details)
          if (cookies.length > 0) return cookies
        }
      } catch (e) { /* ignore */ }
    }

    const view = viewManager.getActiveViewGlobal()
    if (!view) return []
    return await view.webContents.session.cookies.get(details)
  })

  ipcMain.handle('chrome-cookies-set', async (_, details) => {
    // Find the right session for the URL
    if (details.url) {
      const instances = viewManager.getInstances()
      const urlOrigin = new URL(details.url).origin
      
      for (const data of instances.values()) {
        const sess = session.fromPartition(data.sessionId)
        // Check if this instance's active tab or any tab matches the origin
        const tabs = Array.from(data.tabs.values())
        const matches = tabs.some(t => {
          try { return new URL(t.data.url).origin === urlOrigin } catch(e) { return false }
        })

        if (matches) {
          try {
            await sess.cookies.set(details)
            const cookies = await sess.cookies.get({
              url: details.url,
              name: details.name
            })
            return cookies[0]
          } catch (e) {
            console.error('[IPC] chrome-cookies-set error in matched session:', e)
          }
        }
      }
    }

    const view = viewManager.getActiveViewGlobal()
    if (!view) return null
    try {
      await view.webContents.session.cookies.set(details)
      const cookies = await view.webContents.session.cookies.get({
        url: details.url,
        name: details.name
      })
      return cookies[0]
    } catch (e) {
      console.error('[IPC] chrome-cookies-set error:', e)
      return null
    }
  })

  ipcMain.handle('chrome-cookies-remove', async (_, details) => {
    if (details.url) {
      const instances = viewManager.getInstances()
      const urlOrigin = new URL(details.url).origin
      for (const data of instances.values()) {
        const sess = session.fromPartition(data.sessionId)
        const tabs = Array.from(data.tabs.values())
        const matches = tabs.some(t => {
          try { return new URL(t.data.url).origin === urlOrigin } catch(e) { return false }
        })
        if (matches) {
          await sess.cookies.remove(details.url, details.name)
        }
      }
    }

    const view = viewManager.getActiveViewGlobal()
    if (!view) return null
    await view.webContents.session.cookies.remove(details.url, details.name)
    return details
  })

  ipcMain.handle('relay-extension-message', (event, message) => {
    const sender = event.sender
    const senderTitle = sender.getTitle()
    const senderUrl = sender.getURL()
    const msgType = message.method || message.event || message.type || message.action || 'unknown'

    if (msgType === 'unknown') {
      console.log(
        `[IPC] relay-extension-message from "${senderTitle}" (${senderUrl}) - Unknown payload:`,
        JSON.stringify(message)
      )
    } else {
      console.log(`[IPC] relay-extension-message from "${senderTitle}" (${senderUrl}): ${msgType}`)
    }

    // Cache transfer messages so pages can request them on load/reload
    if (['fillcodeeditor', 'scriptsyncpostdata', 'filldiffeditor', 'fillviewdata', 'fillcodesearch'].includes(msgType)) {
      console.log(`[IPC] Caching transfer message: ${msgType}`)
      message._senderTabId = event.sender.id
      message._senderUrl = senderUrl
      lastTransferMessages.set(msgType, message)
    }

    if (msgType === 'storageGet') {
      const res = handleStorageGet(message.space as string, message.keys)
      console.log(`[IPC] storageGet response keys:`, Object.keys(res || {}))
      return res
    }
    if (msgType === 'storageSet') {
      return handleStorageSet(message.space as string, message.items as Record<string, unknown>)
    }
    if (msgType === 'storageRemove') {
      return handleStorageRemove(message.space as string, message.keys as string | string[])
    }

    // Mock responses for background events
    if (msgType === 'checkisservicenowinstance') {
      return true
    }

    const requestId = Math.random().toString(36).substring(7)
    message._requestId = requestId
    message._senderUrl = senderUrl
    message._senderTitle = senderTitle
    message._senderTabId = event.sender.id

    return new Promise((resolve) => {
      let resolved = false

      pendingRequests.set(requestId, (resp) => {
        if (resolved) return
        resolved = true
        pendingRequests.delete(requestId)
        resolve(resp)
      })

      // Broadcast to EVERYONE but filter the sender in the recipient side
      const allWindows = BrowserWindow.getAllWindows()
      console.log(`[IPC] Broadcasting ${msgType} to all windows and WebViews`)
      allWindows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('extension-message-relay', message)
        }
      })
      viewManager.broadcast('extension-message-relay', message)

      const instancesMap = viewManager.getInstances()
      let viewCount = 0
      instancesMap.forEach((inst) => {
        if (!inst.browserWindow.isDestroyed()) {
          inst.tabs.forEach((tab) => {
            if (!tab.view.webContents.isDestroyed()) {
              tab.view.webContents.send('extension-message-relay', message)
              viewCount++
            }
          })
        }
      })
      console.log(`[IPC] Broadcasting ${msgType} to ${viewCount} views`)

      // Safety timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          pendingRequests.delete(requestId)
          resolve({ success: true, relayed: true })
        }
      }, 1500)
    })
  })

  ipcMain.on('extension-message-response', (_, requestId, response) => {
    const resolve = pendingRequests.get(requestId)
    if (resolve) {
      pendingRequests.delete(requestId)
      resolve(response)
    }
  })

  ipcMain.on('prompt-sync', (event, message, defaultValue) => {
    console.log('[IPC] prompt-sync called:', message)
    try {
      let result: string | null = null
      const cleanMsg = message.replace(/"/g, "'").replace(/\n/g, ' ')
      const cleanDef = defaultValue.replace(/"/g, "'").replace(/\n/g, ' ')

      if (process.platform === 'win32') {
        const psScript = `
          Add-Type -AssemblyName Microsoft.VisualBasic
          [Microsoft.VisualBasic.Interaction]::InputBox("${cleanMsg}", "SN Utils Prompt", "${cleanDef}")
        `
        const spawnResult = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
          encoding: 'utf-8'
        })
        result = spawnResult.stdout ? spawnResult.stdout.trim() : ''
      } else if (process.platform === 'darwin') {
        const osaScript = `display dialog "${cleanMsg}" default answer "${cleanDef}" with title "SN Utils Prompt" buttons {"Cancel", "OK"} default button "OK"`
        const spawnResult = spawnSync('osascript', ['-e', osaScript], { encoding: 'utf-8' })
        if (spawnResult.status === 0) {
          const match = spawnResult.stdout.match(/text returned:(.*), button returned:OK/)
          result = match ? match[1].trim() : ''
        }
      } else {
        // Linux / Others (assuming zenity)
        const spawnResult = spawnSync(
          'zenity',
          ['--entry', `--text=${cleanMsg}`, `--entry-text=${cleanDef}`, '--title=SN Utils Prompt'],
          { encoding: 'utf-8' }
        )
        if (spawnResult.status === 0) {
          result = spawnResult.stdout ? spawnResult.stdout.trim() : ''
        }
      }

      console.log('[IPC] prompt-sync result:', result)
      // SN Utils expectation: null for cancel, string for OK
      event.returnValue =
        result === '' && (message.includes('Filter') || message.includes('/')) ? null : result
    } catch (e) {
      console.error('[IPC] prompt-sync error:', e)
      event.returnValue = null
    }
  })

  ipcMain.handle('show-context-menu', (event, instanceId) => {
    if (event.sender.isDestroyed()) return

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Launch Instance',
        click: () => {
          const instances = getInstances()
          const inst = instances.find((i) => i.id === instanceId)
          if (inst) createInstanceWindow(inst)
        }
      },
      {
        label: 'Crear acceso directo en el escritorio',
        click: () => {
          createShortcut(instanceId)
        }
      },
      { type: 'separator' },
      {
        label: 'Edit Settings',
        click: () => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('context-action-edit', instanceId)
          }
        }
      },
      {
        label: 'Delete Instance',
        click: () => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('context-action-delete', instanceId)
          }
        }
      }
    ]
    const menu = Menu.buildFromTemplate(template)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      menu.popup({ window: win })
    }
  })

  // Check for command line arguments
  const openInstanceIdArg = process.argv.find((arg) => arg.startsWith('--open-instance='))
  const openInstanceId = openInstanceIdArg?.split('=')[1]

  if (openInstanceId) {
    const instances = getInstances()
    const instance = instances.find((i) => i.id === openInstanceId)
    if (instance) {
      createInstanceWindow(instance)
    } else {
      createWindow()
    }
  } else {
    // Start with Dashboard
    createWindow()
  }

  // Setup Tray
  tray = new Tray(icon)
  tray.setToolTip('SNOW Hub')
  tray.on('click', () => {
    const allWindows = BrowserWindow.getAllWindows()
    const mainWindow = allWindows.find(w => w.getTitle() === 'SNOW Hub Manager')
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
  const updateTray = (): void => {
    const instances = getInstances()
    const menuTemplate: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
      {
        label: 'Mostrar Dashboard',
        click: () => {
          const allWindows = BrowserWindow.getAllWindows()
          const mainWindow = allWindows.find(w => w.getTitle() === 'SNOW Hub Manager')
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          } else {
            createWindow()
          }
        }
      },
      { type: 'separator' }
    ]

    instances.forEach((inst) => {
      menuTemplate.push({
        label: `Abrir ${inst.name}`,
        click: () => createInstanceWindow(inst)
      })
    })
    
    menuTemplate.push({ type: 'separator' })
    
    menuTemplate.push({
      label: 'Ejecutar en segundo plano',
      type: 'checkbox',
      checked: store.get('runInBackground'),
      click: (menuItem) => {
        store.set('runInBackground', menuItem.checked)
        // If we just disabled it and no main windows are open, we should probably quit
        if (!menuItem.checked) {
          const allWindows = BrowserWindow.getAllWindows()
          const mainWindows = allWindows.filter(w => w !== backgroundWindow)
          if (mainWindows.length === 0) {
            app.quit()
          }
        }
      }
    })

    menuTemplate.push({ type: 'separator' }, { label: 'Salir', click: () => app.quit() })
    tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate))
  }

  updateTray()
  // Refresh tray whenever an instance changes
  // Note: a more robust event emitter is preferred, but for this prototype we refresh here for simplicity

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // This is only called when ALL windows are closed.
  // Since we have a background window, this might not fire unless we close it.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})



// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
