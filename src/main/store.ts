import Store from 'electron-store'
import { safeStorage } from 'electron'

export interface Instance {
  id: string
  name: string
  url: string
  icon?: string
}

export interface InstanceCredentials {
  username?: string
  passwordEncrypted?: string
}

interface StoreSchema {
  instances: Instance[]
  credentials: Record<string, InstanceCredentials>
  snUtilsStorage?: Record<string, any>
  runInBackground: boolean
}

export const store = new Store<StoreSchema>({
  defaults: {
    instances: [],
    credentials: {},
    snUtilsStorage: { local: {}, sync: {} },
    runInBackground: true
  }
})

export const getInstances = (): Instance[] => {
  return store.get('instances')
}

export const addInstance = (instance: Instance): void => {
  const instances = store.get('instances')
  instances.push(instance)
  store.set('instances', instances)
}

export const editInstance = (id: string, updatedInstance: Partial<Instance>): void => {
  const instances = store.get('instances')
  const index = instances.findIndex((i) => i.id === id)
  if (index !== -1) {
    instances[index] = { ...instances[index], ...updatedInstance }
    store.set('instances', instances)
  }
}

export const deleteInstance = (id: string): void => {
  const instances = store.get('instances')
  store.set(
    'instances',
    instances.filter((i) => i.id !== id)
  )
  
  // Also clean up credentials
  const credentials = store.get('credentials')
  if (credentials[id]) {
    delete credentials[id]
    store.set('credentials', credentials)
  }
}

// Security: safeStorage for passwords

export const saveCredentials = (id: string, username?: string, password?: string): void => {
  const credentials = store.get('credentials') || {}
  
  let passwordEncrypted: string | undefined
  if (password && safeStorage.isEncryptionAvailable()) {
    passwordEncrypted = safeStorage.encryptString(password).toString('base64')
  }

  credentials[id] = {
    username,
    passwordEncrypted
  }
  store.set('credentials', credentials)
}

export const getCredentials = (id: string): { username?: string; password?: string } => {
  const credentials = store.get('credentials') || {}
  const cred = credentials[id]
  
  if (!cred) return {}

  let passwordStr: string | undefined
  if (cred.passwordEncrypted && safeStorage.isEncryptionAvailable()) {
    try {
      passwordStr = safeStorage.decryptString(Buffer.from(cred.passwordEncrypted, 'base64'))
    } catch (error) {
       console.error(`Failed to decrypt password for instance ${id}`, error)
    }
  }

  return {
    username: cred.username,
    password: passwordStr
  }
}


export const getSnUtilsStorage = () => {
  return store.get('snUtilsStorage')
}

export const setSnUtilsStorage = (data: Record<string, any>) => {
  store.set('snUtilsStorage', data)
}
