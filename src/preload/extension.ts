import { contextBridge, ipcRenderer, webFrame } from 'electron'

const senderId = 'extension-' + Math.random().toString(36).substring(7)

// Helper to create a dummy event with addListener/removeListener
const createEventMock = (name: string) => ({
  addListener: (cb: Function) => {
    console.log(`[ChromeMock] Event listener added: ${name}`)
    // If it's onInstalled, call it immediately with a mock reason
    if (name === 'runtime.onInstalled') {
      setTimeout(() => {
        try {
          cb({ reason: 'install' })
        } catch (e) {
          console.error(`[ChromeMock] Error in onInstalled listener:`, e)
        }
      }, 100)
    }
  },
  removeListener: () => {
    console.log(`[ChromeMock] Event listener removed: ${name}`)
  },
  hasListener: () => true
})

const onMessageListeners: ((
  message: Record<string, unknown>,
  sender: Record<string, unknown>,
  sendResponse: (response: unknown) => void
) => void)[] = []
const onStorageChangedListeners: ((changes: Record<string, any>, areaName: string) => void)[] = []
let onMessageRegistered = false
let onStorageRegistered = false

const chromeMock = {
  tabs: {
    query: (
      queryInfo: Record<string, any>,
      callback?: (tabs: any[]) => void
    ) => {
      console.log('[ChromeMock] tabs.query called', queryInfo)
      const p = ipcRenderer.invoke('chrome-tabs-query', queryInfo).then((allTabs: any[]) => {
        let filtered = allTabs.map(t => ({
          id: t.id,
          url: t.url,
          title: t.title,
          active: t.active,
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

        console.log('[ChromeMock] tabs.query returning count:', filtered.length)
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
      console.log('[ChromeMock] tabs.sendMessage:', message.method || message.type || 'unknown')
      const messageWithSender = { ...message, _senderId: senderId }
      const p = ipcRenderer.invoke('relay-extension-message', messageWithSender)
      if (callback) p.then(callback)
      return p
    },
    create: (
      createProperties: Record<string, unknown>,
      callback?: (tab: Record<string, unknown>) => void
    ) => {
      console.log('[ChromeMock] tabs.create:', createProperties.url)
      const p = ipcRenderer.invoke('chrome-tabs-create', createProperties)
      if (callback) p.then(callback)
      return p
    },
    update: (
      _tabId: number,
      updateProperties: Record<string, unknown>,
      callback?: (tab: any) => void
    ) => {
      console.log('[ChromeMock] tabs.update:', _tabId, updateProperties.url)
      const p = ipcRenderer.invoke('chrome-tabs-update', _tabId, updateProperties)
      if (callback) p.then(callback)
      return p
    },
    reload: (
      _tabId: number,
      _reloadProperties?: Record<string, unknown>,
      callback?: () => void
    ) => {
      console.log('[ChromeMock] tabs.reload:', _tabId)
      const p = ipcRenderer.invoke('chrome-tabs-reload', _tabId, _reloadProperties)
      if (callback) p.then(callback)
      return p
    },
    get: (tabId: number | string, callback?: (tab: any) => void) => {
      console.log('[ChromeMock] tabs.get called', tabId)
      const p = ipcRenderer.invoke('chrome-tabs-get', tabId)
        .then(res => {
          chromeMock.runtime.lastError = null
          return res
        })
        .catch(err => {
          chromeMock.runtime.lastError = { message: err.message }
          throw err
        })
      if (callback) p.then(callback).catch(() => callback(undefined))
      return p
    },
    executeScript: (tabId: number, details: any, callback?: (result: any) => void) => {
      console.log('[ChromeMock] tabs.executeScript called', tabId, details)
      const p = ipcRenderer.invoke('chrome-tabs-executeScript', tabId, details)
        .then(res => {
          chromeMock.runtime.lastError = null
          return res
        })
        .catch(err => {
          chromeMock.runtime.lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    },
    insertCSS: (tabId: number, details: any, callback?: () => void) => {
      console.log('[ChromeMock] tabs.insertCSS called', tabId, details)
      if (callback) setTimeout(callback, 0)
      return Promise.resolve()
    },
    getCurrent: (callback?: (tab: any) => void) => {
      const myId = (window as any).__snUtilsTabId
      let p: Promise<any>
      if (myId) {
        p = ipcRenderer.invoke('chrome-tabs-get', myId).then((tab) => {
          const res = tab || { id: myId, url: window.location.href, active: true }
          return res
        })
      } else {
        p = ipcRenderer.invoke('query-active-tab')
      }
      if (callback) p.then(callback)
      return p
    },
    onUpdated: {
      addListener: (cb: (tabId: number, changeInfo: any, tab: any) => void) => {
        console.log('[ChromeMock] tabs.onUpdated.addListener called')
        ipcRenderer.on('chrome-tabs-updated-relay', (_event, tabId, changeInfo, tab) => {
          try { cb(tabId, changeInfo, tab); } catch(e) {}
        });
      },
      removeListener: () => {},
      hasListener: () => true
    },
    onActivated: createEventMock('tabs.onActivated'),
    onRemoved: createEventMock('tabs.onRemoved')
  },
  windows: {
    create: (
      createData: Record<string, unknown>,
      callback?: (window: Record<string, unknown>) => void
    ) => {
      console.log('[ChromeMock] windows.create:', createData.url)
      const p = ipcRenderer.invoke('chrome-windows-create', createData)
      if (callback) p.then(callback)
      return p
    },
    update: (
      windowId: number,
      updateProperties: Record<string, unknown>,
      callback?: (window: any) => void
    ) => {
      console.log('[ChromeMock] windows.update:', windowId, updateProperties)
      const p = ipcRenderer.invoke('chrome-windows-update', windowId, updateProperties)
        .then(res => {
          chromeMock.runtime.lastError = null
          return res
        })
        .catch(err => {
          chromeMock.runtime.lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    },
    onFocusChanged: createEventMock('windows.onFocusChanged')
  },
  runtime: {
    id: 'electron-snow-hub',
    sendMessage: (
      message: Record<string, unknown>,
      callback?: (response: unknown) => void
    ) => {
      const msgType = message.method || message.type || message.event || message.action || 'unknown'
      console.log('[ChromeMock] runtime.sendMessage:', msgType)
      const messageWithSender = { ...message, _senderId: senderId }
      const p = ipcRenderer.invoke('relay-extension-message', messageWithSender)
      if (callback) p.then(callback)
      return p
    },
    getURL: (path: string) => {
      const cleanPath = path.startsWith('/') ? path.substring(1) : path
      return `snuhub-extension://electron-snow-hub/${cleanPath}`
    },
    getManifest: () => {
      return {
        version: '9.2.0.0',
        name: 'SN Utils - Tools for ServiceNow',
        manifest_version: 3,
        permissions: ['activeTab', 'storage', 'cookies', 'declarativeContent']
      }
    },
    onInstalled: createEventMock('runtime.onInstalled'),
    onStartup: createEventMock('runtime.onStartup'),
    onMessage: {
      addListener: (
        fn: (
          message: Record<string, unknown>,
          sender: Record<string, unknown>,
          sendResponse: (response: unknown) => void
        ) => void
      ) => {
        console.log('[ChromeMock] runtime.onMessage.addListener called')
        onMessageListeners.push(fn)

        if (!onMessageRegistered) {
          onMessageRegistered = true
          ipcRenderer.on('extension-message-relay', (_event, msg: any) => {
            // Echo filtering
            if (msg._senderId === senderId) return

            const msgType = msg.method || msg.type || msg.event || msg.action || 'unknown'
            console.log(`[ChromeMock] [${senderId}] Received relayed message:`, msgType)

            const requestId = msg._requestId
            const cleanMsg = { ...msg }
            delete cleanMsg._requestId
            delete cleanMsg._senderId
            delete cleanMsg._senderUrl
            delete cleanMsg._senderTitle
            delete cleanMsg._senderTabId

            const relaySender = {
                id: 'electron-snow-hub',
                url: msg._senderUrl,
                tab: msg._senderTabId ? { 
                    id: msg._senderTabId, 
                    url: msg._senderUrl,
                    favIconUrl: 'snuhub-extension://electron-snow-hub/images/icon16.png' 
                } : { id: 1, url: msg._senderUrl }
            }

            onMessageListeners.forEach((listener) => {
              try {
                listener(
                  cleanMsg as Record<string, unknown>,
                  relaySender,
                  (resp: any) => {
                    if (requestId) {
                      console.log(`[ChromeMock] [${senderId}] Response for ${msgType}:`, resp)
                      ipcRenderer.send('extension-message-response', requestId, resp)
                    }
                  }
                )
              } catch (err: any) {
                console.error(`[ChromeMock] [${senderId}] Listener error:`, err)
              }
            })
          })
        }
      },
      removeListener: (fn: any) => {
        const idx = onMessageListeners.indexOf(fn)
        if (idx > -1) onMessageListeners.splice(idx, 1)
      }
    },
    onMessageExternal: createEventMock('runtime.onMessageExternal'),
    onConnect: createEventMock('runtime.onConnect'),
    onConnectExternal: createEventMock('runtime.onConnectExternal'),
    lastError: null as { message: string } | null
  },
  action: {
    setBadgeText: (details: any) => console.log('[ChromeMock] action.setBadgeText:', details.text),
    setBadgeBackgroundColor: (details: any) =>
      console.log('[ChromeMock] action.setBadgeBackgroundColor:', details.color),
    onClicked: createEventMock('action.onClicked')
  },
  declarativeContent: {
    PageStateMatcher: function (this: any, options: any) {
      if (options) Object.assign(this, options)
    } as any,
    ShowAction: function () {} as any,
    ShowPageAction: function () {} as any,
    onPageChanged: {
      addRules: (_rules: any, cb?: () => void) => {
        if (cb) setTimeout(cb, 0)
      },
      removeRules: (_rules: any, cb?: () => void) => {
        if (cb) setTimeout(cb, 0)
      }
    }
  },
  commands: {
    onCommand: createEventMock('commands.onCommand')
  },
  contextMenus: {
    create: (details: any, cb?: () => void) => {
      console.log('[ChromeMock] contextMenus.create:', details.title)
      if (cb) setTimeout(cb, 0)
      return details.id
    },
    update: (id: string, _details: any, cb?: () => void) => {
      console.log('[ChromeMock] contextMenus.update:', id)
      if (cb) setTimeout(cb, 0)
    },
    remove: (id: string, cb?: () => void) => {
      console.log('[ChromeMock] contextMenus.remove:', id)
      if (cb) setTimeout(cb, 0)
    },
    removeAll: (cb?: () => void) => {
      console.log('[ChromeMock] contextMenus.removeAll')
      if (cb) setTimeout(cb, 0)
    },
    onClicked: createEventMock('contextMenus.onClicked')
  },
  sidePanel: {
    setOptions: async (opt: any) => console.log('[ChromeMock] sidePanel.setOptions:', opt),
    setPanelBehavior: async (beh: any) => console.log('[ChromeMock] sidePanel.setPanelBehavior:', beh)
  },
  permissions: {
    getAll: (callback: (p: any) => void) => {
      callback({ permissions: ['tabs', 'storage'], origins: ['<all_urls>'] })
    },
    contains: (_p: any, callback: (result: boolean) => void) => {
      callback(true)
    }
  },
  extension: {
    getURL: (path: string) => {
      return `snuhub-extension://electron-snow-hub/${path}`
    },
    getBackgroundPage: () => null
  },
  storage: {
    local: {
      get: (keys: any, callback?: (items: any) => void) => {
        console.log('[ChromeMock] storage.local.get:', keys)
        const p = ipcRenderer.invoke('chrome-storage-get', 'local', keys).then(res => {
          console.log('[ChromeMock] storage.local.get response (first 100 chars):', JSON.stringify(res).substring(0, 100))
          return res
        })
        if (callback) p.then(callback)
        return p
      },
      set: (items: any, callback?: () => void) => {
        console.log('[ChromeMock] storage.local.set:', Object.keys(items), items)
        const p = ipcRenderer.invoke('chrome-storage-set', 'local', items)
        if (callback) p.then(callback)
        return p
      },
      remove: (keys: string | string[], callback?: () => void) => {
        console.log('[ChromeMock] storage.local.remove:', keys)
        const p = ipcRenderer.invoke('chrome-storage-remove', 'local', keys)
        if (callback) p.then(callback)
        return p
      },
      clear: (callback?: () => void) => {
        console.log('[ChromeMock] storage.local.clear')
        const p = ipcRenderer.invoke('chrome-storage-clear', 'local')
        if (callback) p.then(callback)
        return p
      }
    },
    sync: {
      get: (keys: any, callback?: (items: any) => void) => {
        console.log('[ChromeMock] storage.sync.get:', keys)
        const p = ipcRenderer.invoke('chrome-storage-get', 'sync', keys).then(res => {
          console.log('[ChromeMock] storage.sync.get response (first 100 chars):', JSON.stringify(res).substring(0, 100))
          return res
        })
        if (callback) p.then(callback)
        return p
      },
      set: (items: any, callback?: () => void) => {
        console.log('[ChromeMock] storage.sync.set:', Object.keys(items), items)
        const p = ipcRenderer.invoke('chrome-storage-set', 'sync', items)
        if (callback) p.then(callback)
        return p
      },
      remove: (keys: string | string[], callback?: () => void) => {
        console.log('[ChromeMock] storage.sync.remove:', keys)
        const p = ipcRenderer.invoke('chrome-storage-remove', 'sync', keys)
        if (callback) p.then(callback)
        return p
      },
      clear: (callback?: () => void) => {
        console.log('[ChromeMock] storage.sync.clear')
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
      console.log('[ChromeMock] cookies.set called:', details.name)
      const p = ipcRenderer.invoke('chrome-cookies-set', details)
        .then(res => {
          chromeMock.runtime.lastError = null
          return res
        })
        .catch(err => {
          chromeMock.runtime.lastError = { message: err.message }
          return null
        })
      if (callback) p.then(callback)
      return p
    }
  }
}

try {
  contextBridge.exposeInMainWorld('snUtilsChrome', chromeMock)

  try {
    contextBridge.exposeInMainWorld('chrome', chromeMock)
  } catch {
    // console.warn('[ChromeMock] Could not expose as "chrome" directly via contextBridge')
  }

  try {
    contextBridge.exposeInMainWorld('browser', chromeMock)
  } catch {
    // browser might also fail
  }

  webFrame.executeJavaScript(`
    (function() {
      if (typeof window.snUtilsChrome === 'undefined') return;
      
      const mock = window.snUtilsChrome;
      
      if (typeof window.chrome === 'undefined' || !window.chrome.tabs) {
        try {
          window.chrome = mock;
        } catch(e) {
          // If read-only, try Object.defineProperty to force our mock
          try {
            Object.defineProperty(window, 'chrome', { 
              value: mock, 
              writable: true, 
              configurable: true 
            });
          } catch (e2) {
            // Last resort: shallow merge if possible
            if (window.chrome) {
              for (let key in mock) {
                try { window.chrome[key] = mock[key]; } catch(e3) {}
              }
            }
          }
        }
      }

      if (typeof window.browser === 'undefined' || !window.browser.tabs) {
        window.browser = window.chrome || mock;
      }

      // Define constructors that contextBridge might have broken or missed
      if (window.chrome && window.chrome.declarativeContent) {
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
      
      console.log('[ChromeMock] Main-world polyfill applied. chrome.tabs:', !!(window.chrome && window.chrome.tabs));
    })();
  `);

  console.log('[ChromeMock] Polyfills exposed successfully via contextBridge and webFrame')
} catch (e) {
  console.error('[ChromeMock] Failed global exposure:', e)
}
