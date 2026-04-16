import { BrowserWindow, nativeImage, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { viewManager } from './viewManager'
import { loadExtensionsForPartition } from './sessionManager'
import { Instance, editInstance, store } from './store'

async function downloadFavicon(instanceId: string, url: string): Promise<string | null> {
  try {
    const userDataPath = store.path.replace('config.json', '')
    const iconsDir = join(userDataPath, 'icons')
    if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true })

    const iconPath = join(iconsDir, `${instanceId}.ico`)
    if (existsSync(iconPath)) return iconPath

    const domain = new URL(url).origin
    const faviconUrl = `${domain}/favicon.ico`

    const response = await net.fetch(faviconUrl)
    if (response.ok) {
      const buffer = await response.arrayBuffer()
      writeFileSync(iconPath, Buffer.from(buffer))
      return iconPath
    }
  } catch (e) {
    console.error(`Failed to download favicon for ${instanceId}:`, e)
  }
  return null
}

export async function createInstanceWindow(instance: Instance): Promise<BrowserWindow> {
  const { id: instanceId, name: instanceName, url: instanceUrl, icon: existingIcon } = instance
  const partitionId = `persist:${instanceId}`
  
  // Ensure extensions are loaded for this session
  await loadExtensionsForPartition(partitionId)

  let iconPath = existingIcon
  if (!iconPath && instanceUrl) {
    iconPath = await downloadFavicon(instanceId, instanceUrl) || undefined
    if (iconPath) {
      editInstance(instanceId, { icon: iconPath })
    }
  }

  const instanceWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: instanceName,
    autoHideMenuBar: true,
    ...(iconPath && existsSync(iconPath) ? { icon: nativeImage.createFromPath(iconPath) } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      v8CacheOptions: 'bypassHeatCheck',
      spellcheck: false
    }
  })

  // Group windows separately in Windows taskbar
  if (process.platform === 'win32') {
    instanceWindow.setAppDetails({
      appId: `com.snowhub.instance.${instanceId}`,
      relaunchCommand: process.execPath,
      relaunchDisplayName: instanceName
    })
  }

  // Force the window title to be the instance name initially
  instanceWindow.setTitle(`${instanceName} - SNOW Hub`)

  instanceWindow.on('ready-to-show', () => {
    instanceWindow.show()
  })

  // We load the same React index.html but tell the frontend it's an instance view
  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}?view=instance&id=${instanceId}`
    : `file://${join(__dirname, '../renderer/index.html')}?view=instance&id=${instanceId}`

  instanceWindow.loadURL(url)
  
  // Register with ViewManager
  viewManager.registerInstance(instanceId, instanceWindow, partitionId)

  // Cleanup
  instanceWindow.on('closed', () => {
    viewManager.unregisterInstance(instanceId)
  })

  return instanceWindow
}
