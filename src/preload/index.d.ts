import { ElectronAPI } from '@electron-toolkit/preload'

export interface Instance {
  id: string
  name: string
  url: string
  icon?: string
}

export interface Tab {
  id: number
  url: string
  title: string
  isActive: boolean
  tableName?: string
  sysId?: string
}

export interface IApi {
  getInstances: () => Promise<Instance[]>
  addInstance: (instance: Instance) => Promise<void>
  editInstance: (id: string, instance: Partial<Instance>) => Promise<void>
  deleteInstance: (id: string) => Promise<void>
  saveCredentials: (id: string, username?: string, password?: string) => Promise<void>
  getCredentials: (id: string) => Promise<{ username?: string, password?: string }>
  getExtensions: () => Promise<{ snowUtils?: string, dashlane?: string }>
  setExtension: (key: 'snowUtils' | 'dashlane', path: string) => Promise<void>
  openInstance: (id: string, name: string) => Promise<void>
  createTab: (instanceId: string, url: string) => Promise<Tab | null>
  closeTab: (instanceId: string, tabId: number) => Promise<void>
  switchTab: (instanceId: string, tabId: number) => Promise<void>
  getTabs: (instanceId: string) => Promise<Tab[]>
  goBack: (instanceId: string, tabId: number) => Promise<void>
  goForward: (instanceId: string, tabId: number) => Promise<void>
  reload: (instanceId: string, tabId: number) => Promise<void>
  navigate: (instanceId: string, tabId: number, url: string) => Promise<void>
  reorderTab: (instanceId: string, tabId: number, newIndex: number) => Promise<void>
  onTabUpdated: (callback: (instanceId: string, tab: Tab) => void) => () => void
  showContextMenu: (instanceId: string) => Promise<void>
  onContextEdit: (callback: (instanceId: string) => void) => () => void
  onContextDelete: (callback: (instanceId: string) => void) => () => void
  openSNUtilsPopup: () => Promise<void>
  openSNUtilsSettings: () => Promise<void>
  pickIcon: () => Promise<string | null>
  createDesktopShortcut: (instanceId: string) => Promise<boolean>
  executeJavaScript: (instanceId: string, tabId: number, script: string) => Promise<any>
  getLanguage: () => Promise<string>
  setLanguage: (lang: string) => Promise<void>
  getAppVersion: () => Promise<string>
  onLanguageChanged: (callback: (lang: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IApi
  }
}
