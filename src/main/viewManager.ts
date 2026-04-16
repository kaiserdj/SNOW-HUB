import { BrowserWindow, WebContentsView, session, app, Menu, WebFrameMain, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { openSNUtilsPopup } from './snUtilsWindows'
import { getInstances, getSnUtilsStorage, getCredentials } from './store'
import { t } from './i18n'

export interface Tab {
  id: number
  url: string
  title: string
  isActive: boolean
  tableName?: string
  sysId?: string
}

export interface InstanceWindowData {
  browserWindow: BrowserWindow
  tabs: Map<number, { view: WebContentsView; data: Tab }>
  activeTabId: number | null
  sessionId: string
}

export class ViewManager {
  // Maps instanceId -> InstanceWindowData
  private instances = new Map<string, InstanceWindowData>()
  private snUtilsScriptAll: string | null = null
  private snUtilsScriptParent: string | null = null
  private snUtilsScriptTinycon: string | null = null
  private snUtilsScriptPurify: string | null = null
  private snUtilsScriptInject: string | null = null
  private snUtilsScriptInjectNext: string | null = null
  private onTabUpdated: ((tabId: number, changeInfo: any, tabData: any) => void) | null = null
  private lastFocusedInstanceId: string | null = null

  constructor() {
    this.preloadSNUtils()
  }

  public setBroadcastHandler(handler: (tabId: number, changeInfo: any, tabData: any) => void): void {
    this.onTabUpdated = handler
  }

  private preloadSNUtils(): void {
    try {
      const isPackaged = app.isPackaged
      const bundledExtensionsDir = isPackaged
        ? join(process.resourcesPath, 'extensions')
        : join(app.getAppPath(), 'extensions')

      const contentScriptAllPath = join(bundledExtensionsDir, 'snowUtils', 'content_script_all_frames.js')

      if (fs.existsSync(contentScriptAllPath)) {
        this.snUtilsScriptAll = fs.readFileSync(contentScriptAllPath, 'utf-8')
      }
      const contentScriptParentPath = join(bundledExtensionsDir, 'snowUtils', 'content_script_parent.js')
      if (fs.existsSync(contentScriptParentPath)) {
        this.snUtilsScriptParent = fs.readFileSync(contentScriptParentPath, 'utf-8')
      }

      const tinyconPath = join(bundledExtensionsDir, 'snowUtils', 'js', 'Tinycon.js')
      if (fs.existsSync(tinyconPath)) {
        this.snUtilsScriptTinycon = fs.readFileSync(tinyconPath, 'utf-8')
      }

      const purifyPath = join(bundledExtensionsDir, 'snowUtils', 'js', 'purify.min.js')
      if (fs.existsSync(purifyPath)) {
        this.snUtilsScriptPurify = fs.readFileSync(purifyPath, 'utf-8')
      }

      const injectPath = join(bundledExtensionsDir, 'snowUtils', 'inject.js')
      if (fs.existsSync(injectPath)) {
        this.snUtilsScriptInject = fs.readFileSync(injectPath, 'utf-8')
      }

      const injectNextPath = join(bundledExtensionsDir, 'snowUtils', 'inject_next.js')
      if (fs.existsSync(injectNextPath)) {
        this.snUtilsScriptInjectNext = fs.readFileSync(injectNextPath, 'utf-8')
      }
      console.log('SN Utils content scripts preloaded')
    } catch (err) {
      console.error('Failed to preload SN Utils script:', err)
    }
  }

  public getInstances(): Map<string, InstanceWindowData> {
    return this.instances
  }

  private buildInjectionScript(isTop: boolean, tabId: number, snusettings: any = {}): string {
    return `
      (async () => {
        if (!document || !document.documentElement) return;
        if (window.__snUtilsInjected || document.documentElement.hasAttribute('data-snutils-injected')) return;
        window.__snUtilsInjected = true;
        document.documentElement.setAttribute('data-snutils-injected', 'true');

        window.snusettings = ${JSON.stringify(snusettings)} || {};
        console.log('[SN Utils] Injected settings into ' + window.location.href + ' (isTop: ' + ${isTop} + ')');
        window.snusettings.extensionUrl = "snuhub-extension://electron-snow-hub/";
        window.snusettings.isSNOWHub = true; // Flag for special handling if needed

        // Wait for bridge and chrome polyfill to be available from preload
        let retry = 0;
        while ((!window.__snUtilsBridge || !window.__snUtilsChrome) && retry < 100) {
          // If we are in an iframe, try to borrow from parent if the parent is ready
          try {
            if (window.parent && window.parent !== window && window.parent.__snUtilsChrome && window.parent.__snUtilsBridge) {
              console.log('[SN Utils Bridge] Using parent bridge fallback for ' + (window.name || 'frame'));
              window.__snUtilsChrome = window.parent.__snUtilsChrome;
              window.__snUtilsBridge = window.parent.__snUtilsBridge;
              window.__snUtilsQuerySelectorShadowDom = window.parent.__snUtilsQuerySelectorShadowDom;
              break; // Success!
            }
          } catch (e) { /* same-origin policy might block access to parent */ }
          
          await new Promise(r => setTimeout(r, 100));
          retry++;
        }

        const chrome = window.__snUtilsChrome;
        const bridge = window.__snUtilsBridge;
        
        // Robust Aliasing: Bridge from Isolated World to Main World
        (function() {
          const deepSafeAssign = (target, source) => {
            if (!target || !source) return;
            const keys = Object.getOwnPropertyNames(source);
            for (const key of keys) {
              if (key === 'default' || key === '__esModule') continue;
              try {
                const descriptor = Object.getOwnPropertyDescriptor(target, key);
                if (descriptor && descriptor.configurable === false && descriptor.writable === false) continue;

                const sourceVal = source[key];
                if (typeof sourceVal === 'object' && sourceVal !== null && target[key] && typeof target[key] === 'object') {
                  deepSafeAssign(target[key], sourceVal);
                } else {
                  target[key] = sourceVal;
                }
              } catch(e) { /* ignore read-only etc */ }
            }
          };

          try {
            if (bridge) window.snUtilsBridge = bridge;
            if (window.__snUtilsQuerySelectorShadowDom) {
              try {
                const desc = Object.getOwnPropertyDescriptor(window, 'querySelectorShadowDom');
                if (!desc || desc.configurable || desc.writable) {
                  window.querySelectorShadowDom = window.__snUtilsQuerySelectorShadowDom;
                }
              } catch(e) {}
            }
            
            if (chrome) { 
              if (!window.chrome) {
                window.chrome = chrome;
              } else {
                try {
                  deepSafeAssign(window.chrome, chrome);
                } catch(e) {
                  console.warn('[SN Utils Bridge] Failed to merge chrome object, skipping partials');
                }
              }
              if (!window.browser) window.browser = window.chrome;
            } else if (window.name === 'gsft_main' || window.self === window.top) {
              console.warn('[SN Utils Bridge] __snUtilsChrome still missing after 10s retry loop');
            }
          } catch (e) { console.error('[SN Utils Bridge] Aliasing failed', e); }
        })();

        // Forcibly polyfill prompt() using the synchronous bridge
        window.prompt = function(message, defaultValue) {
          if (window.snUtilsBridge && typeof window.snUtilsBridge.prompt === 'function') {
            return window.snUtilsBridge.prompt(message, defaultValue || "");
          }
          return defaultValue || "";
        };

        // Initialize functional stubs if everything failed or is partially broken
        const noopStub = () => {};
        const storageStub = { get: (k, cb) => cb && cb({}), set: (i, cb) => cb && cb(), remove: noopStub, clear: noopStub };
        const runtimeStub = { 
          sendMessage: noopStub, 
          onMessage: { addListener: noopStub, removeListener: noopStub, hasListener: () => false }, 
          getURL: (p) => {
            const path = p.startsWith('/') ? p.substring(1) : p;
            return "snuhub-extension://electron-snow-hub/" + path;
          },
          getManifest: () => ({ version: '9.2.0.0', name: 'SN Utils (Stub)', manifest_version: 3 }),
          id: 'electron-snow-hub'
        };

        if (!window.chrome) window.chrome = {};
        if (!window.chrome.runtime) {
           window.chrome.runtime = runtimeStub;
        } else {
           if (!window.chrome.runtime.onMessage) try { window.chrome.runtime.onMessage = runtimeStub.onMessage; } catch(e) {}
           if (!window.chrome.runtime.sendMessage) try { window.chrome.runtime.sendMessage = runtimeStub.sendMessage; } catch(e) {}
           if (!window.chrome.runtime.getURL) try { window.chrome.runtime.getURL = runtimeStub.getURL; } catch(e) {}
           if (!window.chrome.runtime.getManifest) try { window.chrome.runtime.getManifest = runtimeStub.getManifest; } catch(e) {}
           if (!window.chrome.runtime.id) try { window.chrome.runtime.id = runtimeStub.id; } catch(e) {}
        }
        
        if (!window.chrome.storage) {
           window.chrome.storage = { sync: storageStub, local: storageStub };
        } else {
           if (!window.chrome.storage.sync) try { window.chrome.storage.sync = storageStub; } catch(e) {}
           if (!window.chrome.storage.local) try { window.chrome.storage.local = storageStub; } catch(e) {}
        }

        if (!window.chrome.extension) window.chrome.extension = { getURL: window.chrome.runtime.getURL };
        if (!window.browser) window.browser = window.chrome;

        // Skip SN Utils on login pages or when session is not active
        const isLoginPage = location.pathname.includes('login.do') || 
                           location.pathname.includes('login_redirect.do') ||
                           document.title.toLowerCase().includes('login');
        
        if (isLoginPage) {
          console.log('[SN Utils Bridge] Skipping injection on login page');
          return;
        }

        const isNextUI = location.pathname.startsWith('/now/') || location.pathname.startsWith('/x/');

        // Functional stubs for SN Utils
        window.getFromSyncStorageGlobal = (key, cb) => {
           if (window.chrome && window.chrome.storage) window.chrome.storage.sync.get(key, cb);
           else if (cb) cb({});
        };
        window.setToChromeStorageGlobal = (key, val) => {
           if (window.chrome && window.chrome.storage) window.chrome.storage.local.set({ [key]: val });
        };
        
        window.__snUtilsDispatchMessage = (msg, sendResponse) => {
           // This is used by our bridged onMessage to talk back to our polyfill
        };

        // We ONLY use the one script to boot original extension loaders
        const globalEval = (code) => {
          if (!code) return;
          try {
            (0, eval)(code);
          } catch (e) {
            console.error('[SN Utils] Global injection error:', e);
          }
        };
        globalEval(${JSON.stringify(this.snUtilsScriptPurify || '')});
        globalEval(${JSON.stringify(this.snUtilsScriptInject || '')});
        if (isNextUI) {
          globalEval(${JSON.stringify(this.snUtilsScriptInjectNext || '')});
        }
        globalEval(${JSON.stringify(this.snUtilsScriptAll || '')});
        if (${isTop}) {
          globalEval(${JSON.stringify(this.snUtilsScriptTinycon || '')});
          globalEval(${JSON.stringify(this.snUtilsScriptParent || '')});
        }

        // We DONT eval inject.js here because content_script_all_frames.js already does it via addScript().
        // However, we MUST ensure snuSettingsAdded is called when inject.js loads.
        // Since we already set window.snusettings above, the onload in addScript will handle it.

        if (typeof snuSettingsAdded === 'function') {
          try {
            snuSettingsAdded();
            console.log('[SN Utils] Initialized in ' + (${isTop} ? 'Main' : 'Frame (' + window.name + ')'));
            
            // Dispatch update event if instance tag config exists
            if (window.snusettings && window.snusettings.instancetag) {
              const details = {
                  "action": "updateInstaceTagConfig",
                  "instaceTagConfig": { tagEnabled: true }, // Simple trigger
              };
              document.dispatchEvent(new CustomEvent('snuProcessEvent', { detail: details }));
            }
          } catch (e) { console.error('[SN Utils] Init error:', e); }
        }

        // Bridge for extension messages
        if (window.snUtilsBridge && window.snUtilsBridge.onMessage) {
          window.snUtilsBridge.onMessage((msg, sendResponse) => {
            if (typeof window.__snUtilsDispatchMessage === 'function') {
               window.__snUtilsDispatchMessage(msg, sendResponse);
            }
          });
        }
        window.__snUtilsTabId = ${tabId};
      })()
    `
  }

  private async handleFrameInjected(
    view: WebContentsView,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number,
    instanceId: string
  ): Promise<void> {
    if (view.webContents.isDestroyed()) return
    const tabId = view.webContents.id
    
    const instanceData = this.instances.get(instanceId)
    if (!instanceData) return

    try {
      // Robust Frame Lookup using recursion on the main frame tree
      const findFrame = (root: WebFrameMain): WebFrameMain | null => {
        if (root.processId === frameProcessId && root.routingId === frameRoutingId) return root
        for (const child of root.frames) {
          const found = findFrame(child)
          if (found) return found
        }
        return null
      }

      let targetFrame = isMainFrame ? view.webContents.mainFrame : findFrame(view.webContents.mainFrame)
      
      if (!targetFrame && !isMainFrame) {
        // Fallback: try to find by URL if IDs didn't match (sometimes happens in quick navigations)
        const findByUrl = (root: WebFrameMain): WebFrameMain | null => {
            if (root.url.includes('.service-now.com/') && !root.parent) return null; // skip main
            if (root.url.includes('.service-now.com/')) return root;
            for (const child of root.frames) {
                const found = findByUrl(child);
                if (found) return found;
            }
            return null;
        }
        targetFrame = findByUrl(view.webContents.mainFrame);
        if (targetFrame) console.log(`[SN Utils] Frame found via URL fallback: ${targetFrame.url}`);
      }

      if (!targetFrame) {
        if (!isMainFrame) console.warn(`[SN Utils] Frame not found for IDs: ${frameProcessId}, ${frameRoutingId}`);
        return
      }

      const frameUrl = targetFrame.url
      console.log(`[SN Utils] handleFrameInjected: [${isMainFrame ? 'TOP' : 'IFRAME'}] URL: ${frameUrl || 'empty'}`)
      
      if (!frameUrl || frameUrl === 'about:blank') return
      const isServiceNow = frameUrl.includes('.service-now.com/') || frameUrl.includes('localhost')
      const isExtension = frameUrl.startsWith('snuhub-extension:')

      if (isServiceNow) {
        const storage = getSnUtilsStorage() || {}
        const snusettingsSync = storage.sync?.snusettings || {}
        const snusettingsLocal = storage.local?.snusettings || {}
        const snusettings = { ...snusettingsSync, ...snusettingsLocal }
        
        await targetFrame
          .executeJavaScript(this.buildInjectionScript(isMainFrame, tabId, snusettings))
          .catch((err: unknown) => {
            const errMsg = err instanceof Error ? err.message : String(err)
            if (!errMsg.includes('blocked') && !errMsg.includes('destroyed')) {
              console.error('[SN Utils] executeJavaScript error in frame:', errMsg)
            }
          })
      } else if (isExtension) {
        await targetFrame
          .executeJavaScript(`window.__snUtilsTabId = ${tabId};`)
          .catch(() => {})
      }
      this.checkAndInjectCredentials(view, instanceId)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('Error in handleFrameInjected:', message)
    }
  }

  public registerInstance(instanceId: string, win: BrowserWindow, sessionId: string): void {
    this.instances.set(instanceId, {
      browserWindow: win,
      tabs: new Map(),
      activeTabId: null,
      sessionId
    })

    // Handle resizing and focus
    win.on('resize', () => {
      this.resizeActiveView(instanceId)
    })
    // Register with ViewManager - set last focused immediately if first one
    if (this.instances.size === 0) {
      this.lastFocusedInstanceId = instanceId
    }

    win.on('focus', () => {
      console.log('[ViewManager] Instance focused:', instanceId)
      this.lastFocusedInstanceId = instanceId
    })
  }

  public unregisterInstance(instanceId: string): void {
    const data = this.instances.get(instanceId)
    if (data) {
      data.tabs.clear()
      this.instances.delete(instanceId)
    }
  }

  public createTab(instanceId: string | null, url: string): Tab | null {
    const targetId = instanceId || this.lastFocusedInstanceId || Array.from(this.instances.keys())[0]
    if (!targetId) {
      console.error('[ViewManager] createTab: No instance ID provided and no fallback found')
      return null
    }

    const data = this.instances.get(targetId)
    if (!data) {
      console.error(`[ViewManager] createTab: Instance index not found for ID: ${targetId}`)
      return null
    }

    const sess = session.fromPartition(data.sessionId)
    const preloadPath = app.isPackaged
      ? join(__dirname, '../preload/webview.js')
      : join(__dirname, '../../out/preload/webview.js')

    const view = new WebContentsView({
      webPreferences: {
        session: sess,
        preload: preloadPath,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: true, // Improved support for bridges in iframes
        contextIsolation: true,
        sandbox: true,
        spellcheck: false
      }
    })

    const tabId = view.webContents.id

    view.webContents.loadURL(url)
    
    // Catch shortcuts when focusing the webview
    view.webContents.on('before-input-event', (event, input) => {
      const isCmdOrCtrl = input.control || input.meta
      if (isCmdOrCtrl && input.key.toLowerCase() === 'w' && input.type === 'keyDown') {
        event.preventDefault()
        this.closeTab(targetId, tabId)
      }
    })
    
    view.webContents.on('context-menu', (_, props) => {
      const template: Electron.MenuItemConstructorOptions[] = []

      // Link Actions
      if (props.linkURL) {
        template.push({
          label: t('main.webview_context.open_new_tab'),
          click: () => this.createTab(targetId, props.linkURL)
        })
        template.push({
          label: t('main.webview_context.copy_link'),
          click: () => clipboard.writeText(props.linkURL)
        })
        template.push({ type: 'separator' })
      }

      // Image Actions
      if (props.mediaType === 'image') {
        template.push({
          label: t('main.webview_context.copy_image'),
          click: () => {
            view.webContents.copyImageAt(props.x, props.y)
          }
        })
        template.push({
          label: t('main.webview_context.save_image'),
          click: () => view.webContents.downloadURL(props.srcURL)
        })
        template.push({ type: 'separator' })
      }

      // Selection Actions (Search / GoTo)
      if (props.selectionText) {
        const selection = props.selectionText.trim()
        const instanceUrl = view.webContents.getURL()
        let origin = ''
        try {
          origin = new URL(instanceUrl).origin
        } catch (e) {
          // Fallback if URL is invalid
        }

        template.push({
          label: t('main.webview_context.search_selection', { selection: selection.length > 20 ? selection.substring(0, 20) + '...' : selection }),
          submenu: [
            {
              label: t('main.webview_context.instance_search'),
              click: () => {
                const searchUrl = `${origin}/nav_to.do?uri=${encodeURIComponent(`textsearch.do?sysparm_search=${selection}`)}`
                this.createTab(targetId, searchUrl)
              }
            },
            {
              label: t('main.webview_context.codesearch'),
              click: async () => {
                const g_ck = await view.webContents.executeJavaScript('window.g_ck').catch(() => null)
                const instance = new URL(origin).host.replace('.service-now.com', '')
                const searchUrl = `snuhub-extension://electron-snow-hub/codesearch.html?query=${encodeURIComponent(selection)}&url=${encodeURIComponent(origin)}&instance=${encodeURIComponent(instance)}&g_ck=${encodeURIComponent(g_ck || '')}`
                this.createTab(targetId, searchUrl)
              }
            },
            {
              label: t('main.webview_context.open_script_include'),
              click: () => {
                const searchUrl = `${origin}/nav_to.do?uri=${encodeURIComponent(`sys_script_include_list.do?sysparm_query=name=${selection}`)}`
                this.createTab(targetId, searchUrl)
              }
            },
            {
              label: t('main.webview_context.table_list'),
              click: () => {
                const searchUrl = `${origin}/nav_to.do?uri=${encodeURIComponent(`${selection}_list.do`)}`
                this.createTab(targetId, searchUrl)
              }
            },
            {
              label: t('main.webview_context.property'),
              click: () => {
                const searchUrl = `${origin}/nav_to.do?uri=${encodeURIComponent(`sys_properties_list.do?sysparm_query=name=${selection}`)}`
                this.createTab(targetId, searchUrl)
              }
            }
          ]
        })
        template.push({ type: 'separator' })
      }

      // Standard Edit / Selection Actions
      if (props.isEditable) {
        template.push({ role: 'undo' })
        template.push({ role: 'redo' })
        template.push({ type: 'separator' })
        template.push({ role: 'cut' })
        template.push({ role: 'copy' })
        template.push({ role: 'paste' })
        template.push({ type: 'separator' })
      } else if (props.selectionText) {
        template.push({ role: 'copy' })
        template.push({ type: 'separator' })
      }

      // Navigation Actions
      template.push({
        label: t('main.webview_context.back'),
        enabled: view.webContents.navigationHistory.canGoBack(),
        click: () => view.webContents.navigationHistory.goBack()
      })
      template.push({
        label: t('main.webview_context.forward'),
        enabled: view.webContents.navigationHistory.canGoForward(),
        click: () => view.webContents.navigationHistory.goForward()
      })
      template.push({
        label: t('main.webview_context.refresh'),
        click: () => view.webContents.reload()
      })
      template.push({ type: 'separator' })

      // SN Utils Tools
      template.push({
        label: t('main.webview_context.sn_utils.title', 'SN Utils'),
        submenu: [
          {
            label: t('main.webview_context.sn_utils.technical_names'),
            click: () => {
              const script = 'if(typeof snuAddTechnicalNames === "function") snuAddTechnicalNames();'
              const exec = (inner: WebFrameMain) => {
                inner.executeJavaScript(script).catch(() => {})
                for (const f of inner.frames) exec(f)
              }
              exec(view.webContents.mainFrame)
            }
          },
          {
            label: t('main.webview_context.sn_utils.pop_out'),
            click: () => this.handlePopOut(targetId, tabId)
          },
          {
            label: t('main.webview_context.sn_utils.unhide_fields'),
            click: () => {
              const script = 'if(typeof unhideFields === "function") unhideFields();'
              const exec = (inner: WebFrameMain) => {
                inner.executeJavaScript(script).catch(() => {})
                for (const f of inner.frames) exec(f)
              }
              exec(view.webContents.mainFrame)
            }
          },
          {
            label: t('main.webview_context.sn_utils.cancel_transactions'),
            click: () => {
              const origin = new URL(view.webContents.getURL()).origin
              this.createTab(targetId, `${origin}/cancel_my_transactions.do`)
            }
          },
          {
            label: t('main.webview_context.sn_utils.updates_today'),
            click: () => {
              const origin = new URL(view.webContents.getURL()).origin
              this.createTab(targetId, `${origin}/sys_update_xml_list.do?sysparm_query=sys_updated_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()^ORDERBYDESCsys_updated_on`)
            }
          },
          {
            label: t('main.webview_context.sn_utils.update_versions'),
            click: () => {
              const origin = new URL(view.webContents.getURL()).origin
              this.createTab(targetId, `${origin}/sys_update_version_list.do?sysparm_query=ORDERBYDESCsys_recorded_at`)
            }
          },
          {
            label: t('main.webview_context.sn_utils.stats'),
            click: () => {
              const origin = new URL(view.webContents.getURL()).origin
              this.createTab(targetId, `${origin}/stats.do`)
            }
          },
          { type: 'separator' },
          {
            label: t('main.webview_context.sn_utils.clear_cache'),
            click: () => {
              const script = 'if(typeof snuClearCache === "function") snuClearCache();'
              const exec = (inner: WebFrameMain) => {
                inner.executeJavaScript(script).catch(() => {})
                for (const f of inner.frames) exec(f)
              }
              exec(view.webContents.mainFrame)
            }
          },
          {
            label: t('main.webview_context.sn_utils.clear_cookies'),
            click: () => {
                const origin = new URL(view.webContents.getURL()).origin
                sess.clearStorageData({ storages: ['cookies'] }).then(() => {
                    view.webContents.loadURL(`${origin}/login.do`)
                })
            }
          },
          { type: 'separator' },
          {
            label: t('main.webview_context.sn_utils.goto_list_sysid'),
            click: async () => {
              const findGFormData = async (frame: WebFrameMain): Promise<{ tableName: string, sysId: string } | null> => {
                try {
                  const data = await frame.executeJavaScript(`
                    (function() {
                      if (typeof g_form !== "undefined") {
                        return {
                          tableName: g_form.getTableName(),
                          sysId: g_form.getUniqueValue()
                        };
                      }
                      return null;
                    })()
                  `).catch(() => null) as { tableName: string, sysId: string } | null;
                  
                  if (data && data.tableName && data.sysId && data.sysId !== '-1') {
                    return data;
                  }

                  for (const childFrame of frame.frames) {
                    const result = await findGFormData(childFrame);
                    if (result) return result;
                  }
                } catch (e) {
                  // Ignore frame errors
                }
                return null;
              };

              const result = await findGFormData(view.webContents.mainFrame);
              if (result) {
                const origin = new URL(view.webContents.getURL()).origin;
                const url = `${origin}/nav_to.do?uri=${encodeURIComponent(`${result.tableName}_list.do?sysparm_query=sys_id=${result.sysId}`)}`;
                view.webContents.loadURL(url);
              }
            }
          },
          {
            label: t('main.webview_context.sn_utils.open_popup'),
            click: () => openSNUtilsPopup()
          },
          {
            label: t('main.webview_context.sn_utils.open_scriptsync'),
            click: () => {
              this.createTab(targetId, 'snuhub-extension://electron-snow-hub/scriptsync.html')
            }
          }
        ]
      })

      template.push({ type: 'separator' })
      template.push({
        label: t('main.webview_context.inspect'),
        click: () => {
          view.webContents.inspectElement(props.x, props.y)
        }
      })

      const menu = Menu.buildFromTemplate(template)
      menu.popup({ window: data.browserWindow })
    })
    
    // Intercept popups vs new tabs
    view.webContents.setWindowOpenHandler((details) => {
      const isServiceNow =
        details.url.includes('.service-now.com/') || details.url.includes('localhost')
      const isPopup =
        details.features &&
        (details.features.includes('width=') || details.features.includes('resizable='))

      if (isServiceNow && isPopup) {
        const instances = getInstances()
        const instance = instances.find((i) => i.id === targetId)
        const iconPath = instance?.icon
        const instanceName = instance?.name || 'ServiceNow'

        console.log('[ViewManager] Allowing ServiceNow popup with branding:', details.url)
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            title: `${instanceName} - SNOW Hub`,
            icon:
              iconPath && fs.existsSync(iconPath)
                ? nativeImage.createFromPath(iconPath)
                : undefined,
            webPreferences: {
              session: sess,
              preload: preloadPath,
              sandbox: true,
              contextIsolation: true,
              spellcheck: false
            }
          }
        }
      }

      console.log('[ViewManager] Redirecting new window to tab:', details.url)
      this.createTab(instanceId, details.url)
      return { action: 'deny' }
    })

    // Group popup windows with the instance window in Windows taskbar
    view.webContents.on('did-create-window', (childWindow) => {
      if (process.platform === 'win32') {
        const instances = getInstances()
        const instance = instances.find((i) => i.id === targetId)
        if (instance) {
          console.log('[ViewManager] Setting AppUserModelID for popup:', instance.name)
          childWindow.setAppDetails({
            appId: `com.snowhub.instance.${targetId}`,
            relaunchCommand: process.execPath,
            relaunchDisplayName: instance.name
          })
        }
      }
    })
    
    // Relay console messages for debugging (Modern API)
    view.webContents.on('console-message', (event) => {
      const levels: Record<number, string> = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' }
      console.log(`[WebView Console ${levels[event.level] || event.level}] (${tabId}): ${event.message}`)
    })

    // Inject SN Utils on every frame load (Main and iframes)
    view.webContents.on('did-frame-finish-load', async (_event, isMain, procId, routId) => {
      this.handleFrameInjected(view, isMain, procId, routId, targetId)
    })
    
    // Also catch navigation within frames (e.g. from about:blank to real URL)
    view.webContents.on('did-frame-navigate', async (_event, _url, _httpResponseCode, _httpStatusText, isMain, procId, routId) => {
      this.handleFrameInjected(view, isMain, procId, routId, targetId)
    })

    // Send update notification. Injection is already handled by did-frame-finish-load.
    view.webContents.on('did-finish-load', () => {
      
      const t = data.tabs.get(tabId)
      if (t && this.onTabUpdated) {
        this.onTabUpdated(tabId, { status: 'complete' }, t.data)
      }
    })

    const tabData: Tab = {
      id: tabId,
      url: url,
      title: 'Loading...',
      isActive: false
    }

    data.tabs.set(tabId, { view, data: tabData })
    data.browserWindow.contentView.addChildView(view)

    // Sync Title dynamically
    view.webContents.on('page-title-updated', (_, title) => {
      const t = data.tabs.get(tabId)
      if (t) {
        t.data.title = title
        data.browserWindow.webContents.send('tab-updated', targetId, t.data)
        if (this.onTabUpdated) this.onTabUpdated(tabId, { title: title }, t.data)
        
        // Update window title if this is the active tab
        if (data.activeTabId === tabId) {
          const instances = getInstances()
          const instance = instances.find((i) => i.id === targetId)
          const instanceName = instance ? instance.name : 'Instance'
          data.browserWindow.setTitle(`${instanceName} - SNOW Hub`)
        }
      }
    })

    // Navigation tracking
    const syncUrl = () => {
      if (view.webContents.isDestroyed()) return
      const t = data.tabs.get(tabId)
      if (t) {
        const newUrl = view.webContents.getURL()
        t.data.url = newUrl
        
        // Extract record info
        const recordInfo = this.extractRecordInfo(newUrl)
        t.data.tableName = recordInfo.tableName
        t.data.sysId = recordInfo.sysId

        data.browserWindow.webContents.send('tab-updated', targetId, t.data)
        if (this.onTabUpdated) this.onTabUpdated(tabId, { url: t.data.url, tableName: t.data.tableName, sysId: t.data.sysId }, t.data)
      }
    }

    view.webContents.on('did-navigate', syncUrl)
    view.webContents.on('did-navigate-in-page', syncUrl)
    view.webContents.on('did-frame-navigate', (_event, _url, _httpResponseCode, _httpStatusText, isMainFrame) => {
      if (isMainFrame) syncUrl()
    })
    view.webContents.on('did-redirect-navigation', syncUrl)

    view.webContents.on('did-start-navigation', (event) => {
      if (event.isMainFrame) {
        // No longer need to clear a global set
      }
    })

    // Automatically switch to the new tab
    this.switchTab(targetId, tabId)
    
    return tabData
  }

  public switchTab(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return

    const targetTab = data.tabs.get(tabId)
    if (!targetTab) return

    // Hide all tabs
    data.tabs.forEach((tab, id) => {
      tab.data.isActive = (id === tabId)
    })

    data.activeTabId = tabId
    
    // Update window title when switching tabs
    const activeTab = data.tabs.get(tabId)
    if (activeTab) {
      const instances = getInstances()
      const instance = instances.find((i) => i.id === instanceId)
      const instanceName = instance ? instance.name : 'Instance'
      data.browserWindow.setTitle(`${instanceName} - SNOW Hub`)
    }

    // Notify renderer that tabs have changed (active state)
    data.browserWindow.webContents.send('tab-updated', instanceId)

    this.resizeActiveView(instanceId)
    
    // Explicitly focus the webview when switching to it
    targetTab.view.webContents.focus()
  }

  public closeTab(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return

    const targetTab = data.tabs.get(tabId)
    if (!targetTab) return

    data.browserWindow.contentView.removeChildView(targetTab.view)
    data.tabs.delete(tabId)

    // If active tab closed, switch to the last available tab or clear
    if (data.activeTabId === tabId) {
      const remainingTabs = Array.from(data.tabs.keys())
      if (remainingTabs.length > 0) {
        this.switchTab(instanceId, remainingTabs[remainingTabs.length - 1])
      } else {
        data.activeTabId = null
      }
    }

    // If no tabs left, automatically open a new one with the instance URL
    if (data.tabs.size === 0) {
      const instances = getInstances()
      const instance = instances.find((i) => i.id === instanceId)
      if (instance) {
        this.createTab(instanceId, instance.url)
      }
    }
  }

  public getTabs(instanceId: string): Tab[] {
    const data = this.instances.get(instanceId)
    if (!data) return []

    return Array.from(data.tabs.values()).map((t) => t.data)
  }

  public goBack(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return
    const tab = data.tabs.get(tabId)
    if (tab && tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack()
    }
  }

  public goForward(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return
    const tab = data.tabs.get(tabId)
    if (tab && tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward()
    }
  }

  public reload(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return
    const tab = data.tabs.get(tabId)
    if (tab) {
      tab.view.webContents.reload()
    }
  }

  public navigate(instanceId: string, tabId: number, url: string): void {
    const data = this.instances.get(instanceId)
    if (!data) return
    const tab = data.tabs.get(tabId)
    if (tab) {
      let targetUrl = url
      const isSpecial =
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('snuhub-extension://') ||
        url.startsWith('data:') ||
        url.startsWith('blob:')

      if (!isSpecial) {
        targetUrl = 'https://' + url
      }
      tab.view.webContents.loadURL(targetUrl)
    }
  }

  public async executeJavaScript(instanceId: string, tabId: number, script: string): Promise<any> {
    const data = this.instances.get(instanceId)
    if (data) {
      const tab = data.tabs.get(tabId)
      if (tab) {
        return tab.view.webContents.executeJavaScript(script)
      }
    }
    return null
  }

  public reorderTab(instanceId: string, tabId: number, newIndex: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return

    const entries = Array.from(data.tabs.entries())
    const oldIndex = entries.findIndex(([id]) => id === tabId)
    if (oldIndex === -1) return

    const [removed] = entries.splice(oldIndex, 1)
    entries.splice(newIndex, 0, removed)

    // Reconstruct Map to preserve order
    data.tabs.clear()
    for (const [id, value] of entries) {
      data.tabs.set(id, value)
    }

    // Notify renderer
    data.browserWindow.webContents.send('tab-updated', instanceId, removed[1].data)
  }

  public handlePopOut(instanceId: string, tabId: number): void {
    const data = this.instances.get(instanceId)
    if (!data) return
    const tab = data.tabs.get(tabId)
    if (!tab) return

    const urlStr = tab.view.webContents.getURL()
    try {
      const u = new URL(urlStr)
      const baseUrl = u.origin
      let newUrl = ''

      const navToIdx = u.href.indexOf('nav_to.do?uri=')
      const polarisIdx = u.href.indexOf('now/nav/ui/classic/params/target/')

      if (navToIdx > -1) {
        // Pop Out: from nav_to.do to direct URL
        newUrl = baseUrl + '/' + decodeURIComponent(u.search.substring(5))
      } else if (polarisIdx > -1) {
        // Pop Out: from Next Experience to direct URL
        const pth = decodeURIComponent(
          u.pathname.replace('/now/nav/ui/classic/params/target/', '') + u.search
        )
        newUrl = baseUrl + (pth.startsWith('/') ? pth : '/' + pth)
      } else {
        // Pop In: from direct URL to nav_to.do
        const pathName = u.pathname.replace(/^\//, '')
        newUrl = `${baseUrl}/nav_to.do?uri=${encodeURIComponent(pathName + u.search)}`
      }

      console.log('[ViewManager] Popping:', urlStr, '->', newUrl)
      tab.view.webContents.loadURL(newUrl)
    } catch (e) {
      console.error('[ViewManager] Pop failed:', e)
    }
  }

  public notifyTechnicalNames(): void {
    const script = 'if(typeof snuToggleTechnicalNames === "function") snuToggleTechnicalNames();'
    this.instances.forEach((inst) => {
      inst.tabs.forEach((tab) => {
        tab.view.webContents.executeJavaScript(script).catch(() => {})
      })
    })
  }

  private resizeActiveView(instanceId: string): void {
    const data = this.instances.get(instanceId)
    if (!data || !data.activeTabId) return

    const activeTab = data.tabs.get(data.activeTabId)
    if (!activeTab) return

    const bounds = data.browserWindow.getContentBounds()
    
    // Make sure we bring it to front
    // We basically resize all to 0 except the active one to keep memory but hide visual
    data.tabs.forEach((tab, id) => {
      if (id !== data.activeTabId) {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    })

    // Offset Y by 80px for our React Title/Tab Bar + Address Bar
    activeTab.view.setBounds({
      x: 0,
      y: 80,
      width: bounds.width,
      height: bounds.height - 80
    })
  }

  // Global accessors for extension bridge
  public getActiveTabGlobal(): Tab | null {
    // 1. Try currently focused window
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const instancesArr = Array.from(this.instances.values())
    
    let foundData: InstanceWindowData | undefined
    if (focusedWindow) {
      foundData = instancesArr.find((d) => d.browserWindow === focusedWindow)
    }

    if (!foundData && this.lastFocusedInstanceId) {
      foundData = this.instances.get(this.lastFocusedInstanceId)
      if (foundData) console.log('[ViewManager] Using fallback focus instance:', this.lastFocusedInstanceId);
    }

    if (foundData && foundData.activeTabId) {
      const tabData = foundData.tabs.get(foundData.activeTabId)
      if (tabData) {
        return tabData.data
      }
    }
    
    for (const data of instancesArr) {
        if (data.activeTabId) {
          const tabData = data.tabs.get(data.activeTabId)
          if (tabData) return tabData.data
        }
    }
    console.log('[ViewManager] No active tab found in any instance');
    return null
  }

  public getAllTabsGlobal(): Tab[] {
    const allTabs: Tab[] = []
    this.instances.forEach((data) => {
      data.tabs.forEach((t) => {
        allTabs.push(t.data)
      })
    })
    return allTabs
  }

  public getTabByIdGlobal(tabId: number): Tab | null {
    for (const instData of this.instances.values()) {
      const tab = instData.tabs.get(tabId)
      if (tab) return tab.data
    }
    return null
  }

  public getActiveViewGlobal(): WebContentsView | null {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const instancesArr = Array.from(this.instances.values())
    
    let foundData: InstanceWindowData | undefined
    if (focusedWindow) {
      foundData = instancesArr.find((d) => d.browserWindow === focusedWindow)
    }

    if (!foundData && this.lastFocusedInstanceId) {
      foundData = this.instances.get(this.lastFocusedInstanceId)
    }

    if (foundData && foundData.activeTabId) {
      const tabData = foundData.tabs.get(foundData.activeTabId)
      if (tabData) return tabData.view
    }

    for (const data of instancesArr) {
      if (data.activeTabId) {
        const tabData = data.tabs.get(data.activeTabId)
        if (tabData) return tabData.view
      }
    }
    return null
  }

  private async checkAndInjectCredentials(view: WebContentsView, instanceId: string): Promise<void> {
    const creds = getCredentials(instanceId)
    if (!creds || !creds.username || !creds.password) return

    const injectScript = `
      (function() {
        // Robust selector list including common SN login fields
        const userSelectors = ['#user_name', 'input[name="user_name"]', 'input[id="user_name"]', '#username'];
        const passSelectors = ['#user_password', 'input[name="user_password"]', 'input[id="user_password"]', '#password'];
        
        function tryFill() {
          let userField = null;
          let passField = null;
          
          for (const s of userSelectors) { userField = document.querySelector(s); if (userField) break; }
          for (const s of passSelectors) { passField = document.querySelector(s); if (passField) break; }
          
          if (userField && passField) {
            if (!userField.value) {
              userField.value = ${JSON.stringify(creds.username)};
              userField.dispatchEvent(new Event('input', { bubbles: true }));
              userField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (!passField.value) {
              passField.value = ${JSON.stringify(creds.password)};
              passField.dispatchEvent(new Event('input', { bubbles: true }));
              passField.dispatchEvent(new Event('change', { bubbles: true }));
            }
            console.log('[Auto-fill] Fields populated');
            return true;
          }
          return false;
        }

        // Retry a few times as SN pages can be slow/dynamic
        let attempts = 0;
        const interval = setInterval(() => {
          if (tryFill() || attempts > 10) {
            clearInterval(interval);
          }
          attempts++;
        }, 1000);
      })();
    `

    // Only inject if we think it's a login-related page or the URL is short (home)
    if (view && !view.webContents.isDestroyed()) {
      const url = view.webContents.getURL() || '';
      if (url.includes('login') || url.includes('auth') || (url.length > 0 && url.length < 50)) {
         view.webContents.executeJavaScript(injectScript).catch(() => {})
      }
    }
  }
  private extractRecordInfo(urlStr: string): { tableName?: string; sysId?: string } {
    try {
      const url = new URL(urlStr)
      let tableName: string | undefined
      let sysId: string | undefined

      // Handle Polaris / Next Experience
      // Pattern: /now/nav/ui/classic/params/target/table_name.do%3Fsys_id%3D...
      if (url.pathname.includes('/now/nav/ui/classic/params/target/')) {
        const targetPart = decodeURIComponent(url.pathname.split('/target/')[1])
        const targetUrl = new URL(targetPart, url.origin)
        return this.extractRecordInfo(targetUrl.href)
      }

      // Handle nav_to.do
      if (url.pathname.includes('nav_to.do')) {
        const uri = url.searchParams.get('uri')
        if (uri) {
          const targetUrl = new URL(uri, url.origin)
          return this.extractRecordInfo(targetUrl.href)
        }
      }

      // Handle standard .do URLs
      // incident.do?sys_id=...
      const doMatch = url.pathname.match(/\/([^/]+)\.do$/)
      if (doMatch) {
         const possibleTable = doMatch[1]
         if (possibleTable.endsWith('_list')) {
           tableName = possibleTable.replace('_list', '')
           sysId = 'List'
         } else {
           tableName = possibleTable
           sysId = url.searchParams.get('sys_id') || undefined
           if (!sysId && url.searchParams.has('sysparm_query')) {
             const query = url.searchParams.get('sysparm_query')
             const sysIdMatch = query?.match(/sys_id=([a-f0-9]{32})/)
             if (sysIdMatch) sysId = sysIdMatch[1]
           }
         }
      }

      // Filter out non-table names (ServiceNow UI pages that end in .do but aren't tables)
      const blacklistedPages = ['home', 'stats', 'login', 'auth_redirect', 'welcome']
      if (tableName && blacklistedPages.includes(tableName)) {
        tableName = undefined
        sysId = undefined
      }

      return { tableName, sysId }
    } catch (e) {
      return {}
    }
  }

  broadcast(channel: string, ...args: any[]) {
    this.instances.forEach(data => {
      data.tabs.forEach(tab => {
        if (!tab.view.webContents.isDestroyed()) {
          tab.view.webContents.send(channel, ...args)
        }
      })
    })
  }
}

export const viewManager = new ViewManager()
