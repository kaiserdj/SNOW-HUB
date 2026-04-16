import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Store
  getInstances: () => ipcRenderer.invoke('get-instances'),
  addInstance: (instance) => ipcRenderer.invoke('add-instance', instance),
  editInstance: (id, instance) => ipcRenderer.invoke('edit-instance', id, instance),
  deleteInstance: (id) => ipcRenderer.invoke('delete-instance', id),
  
  // Credentials
  saveCredentials: (id, username, password) => ipcRenderer.invoke('save-credentials', id, username, password),
  getCredentials: (id) => ipcRenderer.invoke('get-credentials', id),
  
  // Extensions
  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  setExtension: (key, path) => ipcRenderer.invoke('set-extension', key, path),

  // Windows
  openInstance: (id, name) => ipcRenderer.invoke('open-instance', id, name),

  // Tabs
  createTab: (instanceId, url) => ipcRenderer.invoke('create-tab', instanceId, url),
  closeTab: (instanceId, tabId) => ipcRenderer.invoke('close-tab', instanceId, tabId),
  switchTab: (instanceId, tabId) => ipcRenderer.invoke('switch-tab', instanceId, tabId),
  getTabs: (instanceId) => ipcRenderer.invoke('get-tabs', instanceId),
  goBack: (instanceId, tabId) => ipcRenderer.invoke('go-back', instanceId, tabId),
  goForward: (instanceId, tabId) => ipcRenderer.invoke('go-forward', instanceId, tabId),
  reload: (instanceId, tabId) => ipcRenderer.invoke('reload', instanceId, tabId),
  navigate: (instanceId, tabId, url) => ipcRenderer.invoke('navigate', instanceId, tabId, url),
  reorderTab: (instanceId, tabId, newIndex) => ipcRenderer.invoke('reorder-tab', instanceId, tabId, newIndex),
  
  onTabUpdated: (callback) => {
      const handler = (_, instanceId, tab) => callback(instanceId, tab)
      ipcRenderer.on('tab-updated', handler)
      return () => ipcRenderer.removeListener('tab-updated', handler)
  },

  // Context Menu
  showContextMenu: (instanceId) => ipcRenderer.invoke('show-context-menu', instanceId),
  onContextEdit: (callback) => {
      const handler = (_, instanceId) => callback(instanceId)
      ipcRenderer.on('context-action-edit', handler)
      return () => ipcRenderer.removeListener('context-action-edit', handler)
  },
  onContextDelete: (callback) => {
      const handler = (_, instanceId) => callback(instanceId)
      ipcRenderer.on('context-action-delete', handler)
      return () => ipcRenderer.removeListener('context-action-delete', handler)
  },

  // SN Utils
  openSNUtilsPopup: () => ipcRenderer.invoke('open-sn-utils-popup'),
  openSNUtilsSettings: () => ipcRenderer.invoke('open-sn-utils-settings'),

  // New
  pickIcon: () => ipcRenderer.invoke('pick-icon'),
  createDesktopShortcut: (instanceId) => ipcRenderer.invoke('create-desktop-shortcut', instanceId),
  executeJavaScript: (instanceId, tabId, script) => ipcRenderer.invoke('execute-javascript', instanceId, tabId, script)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
