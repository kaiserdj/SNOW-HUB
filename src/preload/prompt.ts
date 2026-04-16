import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('promptBridge', {
  sendResponse: (value) => ipcRenderer.send('prompt-response', value)
})
