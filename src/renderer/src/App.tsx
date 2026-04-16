import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { InstanceView } from './components/InstanceView'

function App(): React.JSX.Element {
  const [view, setView] = useState<'dashboard' | 'instance' | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)

  useEffect(() => {
    // Add dark mode by default
    document.documentElement.classList.add('dark')

    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view')
    const idParam = params.get('id')

    if (viewParam === 'instance' && idParam) {
      setView('instance')
      setInstanceId(idParam)
    } else {
      setView('dashboard')
    }
  }, [])

  if (!view) return <div className="min-h-screen bg-background text-foreground flex items-center justify-center">{window.api ? '' : 'Loading...'}</div>

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <InstanceView instanceId={instanceId!} />
      )}
    </div>
  )
}

export default App
