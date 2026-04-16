import { contextBridge, ipcRenderer, webFrame } from 'electron'

const senderId = 'webview-' + Math.random().toString(36).substring(7)
console.log(`[WebView Preload] Initializing in ${window.location.href} (Sender: ${senderId})`)

// Helper to create a dummy event with addListener/removeListener
const createEventMock = (): {
  addListener: (cb: (message: any, sender: any, sendResponse: (response: any) => void) => void) => void
  removeListener: (cb: (message: any, sender: any, sendResponse: (response: any) => void) => void) => void
  hasListener: () => boolean
} => ({
  addListener: () => {},
  removeListener: () => {},
  hasListener: () => true
})

const onMessageListeners: ((
  message: any,
  sender: any,
  sendResponse: (response: any) => void
) => void)[] = []
const onStorageChangedListeners: ((changes: Record<string, any>, areaName: string) => void)[] = []
let onMessageRegistered = false
let onStorageRegistered = false

const chromeMock = {
  tabs: {
    query: (
      queryInfo: Record<string, any>,
      callback?: (tabs: Record<string, unknown>[]) => void
    ) => {
      const p = ipcRenderer.invoke('chrome-tabs-query', queryInfo).then((allTabs: any[]) => {
        let filtered = allTabs.map(t => ({
          id: t.id,
          url: t.url,
          title: t.title,
          active: t.isActive,
          index: 0,
          windowId: 1,
          status: 'complete'
        }));

        if (queryInfo && queryInfo.url) {
          const targetUrl = String(queryInfo.url).toLowerCase().replace(/\*/g, '').replace(/\?/g, '');
          filtered = filtered.filter(t => 
            String(t.url).toLowerCase().includes(targetUrl)
          );
        }

        if (queryInfo && queryInfo.active) {
          filtered = filtered.filter(t => t.active);
        }

        if (callback) callback(filtered);
        return filtered;
      })
      return p
    },
    sendMessage: (
      _tabId: number,
      message: Record<string, unknown>,
      callback?: (response: unknown) => void
    ) => {
      const messageWithSender = { ...message, _senderId: senderId }
      const p = ipcRenderer.invoke('relay-extension-message', messageWithSender)
      if (callback) p.then(callback)
      return p
    },
    create: (
      createProperties: Record<string, unknown>,
      callback?: (tab: Record<string, unknown>) => void
    ) => {
      const p = ipcRenderer.invoke('chrome-tabs-create', createProperties)
      if (callback) p.then(callback)
      return p
    },
    update: (
      _tabId: number,
      updateProperties: Record<string, unknown>,
      callback?: (tab: Record<string, unknown>) => void
    ) => {
      const p = ipcRenderer.invoke('chrome-tabs-update', _tabId, updateProperties)
      if (callback) p.then(callback)
      return p
    },
    reload: (
      _tabId: number,
      _reloadProperties: Record<string, unknown>,
      callback?: () => void
    ) => {
      const p = ipcRenderer.invoke('chrome-tabs-reload', _tabId, _reloadProperties)
      if (callback) p.then(callback)
      return p
    },
    get: (tabId: string | number, callback?: (tab: any) => void) => {
      const p = ipcRenderer.invoke('chrome-tabs-get', tabId)
        .then(res => {
          (chromeMock.runtime as any).lastError = null
          return res
        })
        .catch(err => {
          (chromeMock.runtime as any).lastError = { message: err.message }
          throw err
        })
      if (callback) p.then(callback).catch(() => callback(undefined))
      return p
    },
    executeScript: (_tabId: number, details: any, callback?: (result: any) => void) => {
      const p = ipcRenderer.invoke('chrome-tabs-executeScript', _tabId, details)
        .then(res => {
          (chromeMock.runtime as any).lastError = null
          return res
        })
        .catch(err => {
          (chromeMock.runtime as any).lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    },
    insertCSS: (_tabId: number, _details: any, callback?: () => void) => {
       if (callback) setTimeout(callback, 0)
       return Promise.resolve()
    },
    getCurrent: (callback?: (tab: any) => void) => {
      const myId = (window as any).__snUtilsTabId
      let p: Promise<any>
      if (myId) {
        p = ipcRenderer.invoke('chrome-tabs-get', myId).then((tab) => {
          return tab || { id: myId, url: window.location.href, active: true }
        })
      } else {
        p = ipcRenderer.invoke('query-active-tab')
      }
      if (callback) p.then(callback)
      return p
    },
    onUpdated: {
      addListener: (cb: (tabId: number, changeInfo: any, tab: any) => void) => {
        console.log('[WebView Mock] tabs.onUpdated.addListener called')
        ipcRenderer.on('chrome-tabs-updated-relay', (_event, tabId, changeInfo, tab) => {
          try { cb(tabId, changeInfo, tab); } catch(e) {}
        });
      },
      removeListener: () => {},
      hasListener: () => true
    },
    onActivated: createEventMock(),
    onRemoved: createEventMock()
  },
  runtime: {
    id: 'electron-snow-hub',
    sendMessage: (
      message: Record<string, unknown>,
      callback?: (response: unknown) => void
    ) => {
      const messageWithSender = { ...message, _senderId: senderId }
      const p = ipcRenderer.invoke('relay-extension-message', messageWithSender)
      if (callback) p.then(callback)
      return p
    },
    getURL: (path: string) => {
      const cleanPath = path.startsWith('/') ? path.substring(1) : path
      return `snuhub-extension://electron-snow-hub/${cleanPath}`
    },
    getManifest: () => ({
      version: '9.2.0.0',
      name: 'SN Utils - Tools for ServiceNow',
      manifest_version: 3
    }),
    onMessage: {
      addListener: (fn: any) => {
        onMessageListeners.push(fn)

        // Immediate check for cached data when a listener is added
        const pathname = window.location.pathname
        let eventType: string | null = null
        if (pathname.includes('codeeditor.html')) eventType = 'fillcodeeditor'
        else if (pathname.includes('scriptsync.html')) eventType = 'scriptsyncpostdata'
        else if (pathname.includes('diff.html')) eventType = 'filldiffeditor'
        else if (pathname.includes('viewdata.html')) eventType = 'fillviewdata'
        else if (pathname.includes('codesearch.html')) eventType = 'fillcodesearch'

        if (eventType) {
          ipcRenderer.invoke('get-last-transfer-message', eventType).then((msg: any) => {
            if (msg) {
              console.log(`[WebView Preload] Delivering cached ${eventType} to new listener`)
              const cachedSender = {
                id: 'electron-snow-hub',
                url: msg._senderUrl,
                tab: msg._senderTabId ? { 
                    id: msg._senderTabId, 
                    url: msg._senderUrl,
                    favIconUrl: 'snuhub-extension://electron-snow-hub/images/icon16.png' 
                } : { id: (window as any).__snUtilsTabId || 1, url: msg._senderUrl }
              }
              try {
                fn(msg, cachedSender, () => {})
              } catch (err) {}
            }
          })
        }

        if (!onMessageRegistered) {
          onMessageRegistered = true
          ipcRenderer.on('extension-message-relay', (_event, msg: any) => {
            if (msg._senderId === senderId) return
            const requestId = msg._requestId
            const relaySender = {
                id: 'electron-snow-hub',
                url: msg._senderUrl,
                tab: msg._senderTabId ? { 
                    id: msg._senderTabId, 
                    url: msg._senderUrl,
                    favIconUrl: 'snuhub-extension://electron-snow-hub/images/icon16.png' 
                } : { id: (window as any).__snUtilsTabId || 1, url: msg._senderUrl }
            }
            onMessageListeners.forEach((listener) => {
              try {
                listener(msg, relaySender, (resp: any) => {
                   if (requestId) ipcRenderer.send('extension-message-response', requestId, resp)
                })
              } catch (err) {}
            })
          })
        }
      },
      removeListener: (fn: any) => {
        const idx = onMessageListeners.indexOf(fn)
        if (idx > -1) onMessageListeners.splice(idx, 1)
      }
    },
    lastError: null as { message: string } | null
  },
  windows: {
    update: (windowId: number, updateProperties: any, callback?: (window: any) => void) => {
      const p = ipcRenderer.invoke('chrome-windows-update', windowId, updateProperties)
        .then(res => {
          (chromeMock.runtime as any).lastError = null
          return res
        })
        .catch(err => {
          (chromeMock.runtime as any).lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    }
  },
  storage: {
    local: {
      get: (keys: any, callback?: (items: any) => void) => {
        console.log('[WebView] storage.local.get:', keys)
        const p = ipcRenderer.invoke('chrome-storage-get', 'local', keys).then((res: any) => {
          console.log('[WebView] storage.local.get response (first 100 chars):', JSON.stringify(res).substring(0, 100))
          return res
        })
        if (callback) p.then(callback)
        return p
      },
      set: (items: any, callback?: () => void) => {
        console.log('[WebView] storage.local.set:', Object.keys(items), items)
        const p = ipcRenderer.invoke('chrome-storage-set', 'local', items)
        if (callback) p.then(callback)
        return p
      },
      remove: (keys: string | string[], callback?: () => void) => {
        console.log('[WebView] storage.local.remove:', keys)
        const p = ipcRenderer.invoke('chrome-storage-remove', 'local', keys)
        if (callback) p.then(callback)
        return p
      },
      clear: (callback?: () => void) => {
        console.log('[WebView] storage.local.clear')
        const p = ipcRenderer.invoke('chrome-storage-clear', 'local')
        if (callback) p.then(callback)
        return p
      }
    },
    sync: {
      get: (keys: any, callback?: (items: any) => void) => {
        console.log('[WebView] storage.sync.get:', keys)
        const p = ipcRenderer.invoke('chrome-storage-get', 'sync', keys).then((res: any) => {
          console.log('[WebView] storage.sync.get response (first 100 chars):', JSON.stringify(res).substring(0, 100))
          return res
        })
        if (callback) p.then(callback)
        return p
      },
      set: (items: any, callback?: () => void) => {
        console.log('[WebView] storage.sync.set:', Object.keys(items), items)
        const p = ipcRenderer.invoke('chrome-storage-set', 'sync', items)
        if (callback) p.then(callback)
        return p
      },
      remove: (keys: string | string[], callback?: () => void) => {
        console.log('[WebView] storage.sync.remove:', keys)
        const p = ipcRenderer.invoke('chrome-storage-remove', 'sync', keys)
        if (callback) p.then(callback)
        return p
      },
      clear: (callback?: () => void) => {
        console.log('[WebView] storage.sync.clear')
        const p = ipcRenderer.invoke('chrome-storage-clear', 'sync')
        if (callback) p.then(callback)
        return p
      }
    },
    onChanged: {
      addListener: (fn: (changes: Record<string, any>, areaName: string) => void) => {
        onStorageChangedListeners.push(fn)
        if (!onStorageRegistered) {
          onStorageRegistered = true
          ipcRenderer.on('chrome-storage-changed', (_event, { space, items }) => {
            const changes: Record<string, any> = {}
            Object.keys(items).forEach(key => {
              changes[key] = { newValue: items[key], oldValue: undefined }
            })
            onStorageChangedListeners.forEach(listener => {
              try { listener(changes, space) } catch (e) {}
            })
          })
        }
      },
      removeListener: (fn: any) => {
        const idx = onStorageChangedListeners.indexOf(fn)
        if (idx > -1) onStorageChangedListeners.splice(idx, 1)
      }
    }
  },
  cookies: {
    get: (details: any, callback?: (cookie: any) => void) => {
      const p = ipcRenderer.invoke('chrome-cookies-get', details)
      if (callback) p.then(callback)
      return p
    },
    getAll: (details: any, callback?: (cookies: any[]) => void) => {
      const p = ipcRenderer.invoke('chrome-cookies-getAll', details)
      if (callback) p.then(callback)
      return p
    },
    remove: (details: any, callback?: (details: any) => void) => {
      const p = ipcRenderer.invoke('chrome-cookies-remove', details)
      if (callback) p.then(callback)
      return p
    },
    set: (details: any, callback?: (cookie: any) => void) => {
      const p = ipcRenderer.invoke('chrome-cookies-set', details)
        .then(res => {
          (chromeMock.runtime as any).lastError = null
          return res
        })
        .catch(err => {
          (chromeMock.runtime as any).lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    }
  },
  extension: {
    getURL: (path: string) => `snuhub-extension://electron-snow-hub/${path}`
  }
}

// Shadow DOM Helper (SN Utils specifically needs this)
const shadowHelper = {
  querySelectorDeep: (s: string, r: any = document) => {
    const f = (n: any): any => {
      if (!n) return null
      if (n.nodeType === 1 && n.matches && n.matches(s)) return n
      if (n.shadowRoot) { const res = f(n.shadowRoot); if (res) return res }
      const ch = n.children || []
      for (const c of ch) { const res = f(c); if (res) return res }
      return null
    }
    return f(r)
  },
  querySelectorAllDeep: (s: string, r: any = document) => {
    const res: any[] = []
    const f = (n: any) => {
      if (!n) return
      if (n.nodeType === 1 && n.matches && n.matches(s)) res.push(n)
      if (n.shadowRoot) f(n.shadowRoot)
      const ch = n.children || []
      for (const c of ch) f(c)
    }
    f(r)
    return res
  }
}

try {
  const isExtensionPage = window.location.protocol === 'snuhub-extension:'
  
  if (isExtensionPage) {
    // For extension pages, we can expose directly to avoid race conditions
    try {
      contextBridge.exposeInMainWorld('chrome', chromeMock)
      contextBridge.exposeInMainWorld('browser', chromeMock)
    } catch (e) {
      // Fallback to aliased exposure if direct fails
      contextBridge.exposeInMainWorld('__snUtilsChrome', chromeMock)
    }
  } else {
    contextBridge.exposeInMainWorld('__snUtilsChrome', chromeMock)
  }
  
  contextBridge.exposeInMainWorld('__snUtilsBridge', {
    prompt: (m: string, d: string) => ipcRenderer.sendSync('prompt-sync', m, d),
    relayMessage: (msg: any) => ipcRenderer.invoke('relay-extension-message', { ...msg, _senderId: senderId }),
    onMessage: (cb: any) => {
      ipcRenderer.on('extension-message-relay', (_e, msg) => {
        if (msg._senderId === senderId) return
        cb(msg, (res: any) => {
           if (msg._requestId) ipcRenderer.send('extension-message-response', msg._requestId, res)
        })
      })
    }
  })
  contextBridge.exposeInMainWorld('__snUtilsQuerySelectorShadowDom', shadowHelper)

  // We no longer apply polyfills here to the main world because early application
  // interferes with Service Portal SPA routing (AngularJS).
  // The SN Utils injection in viewManager.ts will handle aliasing later.

  if (window.location.protocol === 'snuhub-extension:') {
    // Synchronous injection for our own extension pages to ensure 'chrome' is there for early scripts
    webFrame.executeJavaScript(`
      window.chrome = window.__snUtilsChrome;
      window.browser = window.__snUtilsChrome;
    `);
  }
} catch (e) {
  console.error('[WebView Preload] Injection failed:', e)
}
