import { getInstances } from './store'
export async function loadExtensionsForPartition(_partitionId?: string) {
}
export function initializeSessions() {
   // Load extensions for all existing instances on startup, just in case they are used immediately
   const instances = getInstances()
   for (const instance of instances) {
       loadExtensionsForPartition(`persist:${instance.id}`)
   }
}
