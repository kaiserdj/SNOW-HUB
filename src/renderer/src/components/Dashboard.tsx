import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GeneralSettings } from './GeneralSettings'
import { Button } from './ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './ui/dialog'
import { Plus, Settings, Play, Trash2, Key, MonitorSmartphone, Globe, Search, ArrowRight } from 'lucide-react'

interface Instance {
  id: string
  name: string
  url: string
  icon?: string
}

export function Dashboard(): React.JSX.Element {
  const { t } = useTranslation()
  const [instances, setInstances] = useState<Instance[]>([])
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [icon, setIcon] = useState('')

  async function loadInstances(): Promise<void> {
    const data = await window.api.getInstances()
    setInstances(data)
  }

  function resetForm(): void {
    setName('')
    setUrl('')
    setUsername('')
    setPassword('')
    setIcon('')
    setEditingId(null)
  }

  function handleOpenAdd(): void {
    resetForm()
    setIsAddOpen(true)
  }

  async function handleOpenEdit(instance: Instance): Promise<void> {
    setName(instance.name)
    setUrl(instance.url)
    const creds = await window.api.getCredentials(instance.id)
    setUsername(creds.username || '')
    setPassword(creds.password || '')
    setIcon(instance.icon || '')
    setEditingId(instance.id)
    setIsAddOpen(true)
  }

  async function handleSave(): Promise<void> {
    if (!name || !url) return

    let id = editingId
    if (editingId) {
      await window.api.editInstance(editingId, { name, url, icon })
    } else {
      id = Math.random().toString(36).substring(7)
      await window.api.addInstance({ id, name, url, icon })
    }

    if (id && (username || password)) {
      await window.api.saveCredentials(id, username, password)
    }

    setIsAddOpen(false)
    resetForm()
    loadInstances()
  }

  async function handleDelete(id: string): Promise<void> {
    if (confirm(t('dashboard.delete_confirm'))) {
      await window.api.deleteInstance(id)
      loadInstances()
    }
  }

  function handleOpenInstance(id: string, name: string): void {
    window.api.openInstance(id, name)
  }

  async function handlePickIcon(): Promise<void> {
    const path = await window.api.pickIcon()
    if (path) setIcon(path)
  }

  async function handleCreateShortcut(id: string): Promise<void> {
    const success = await window.api.createDesktopShortcut(id)
    if (success) {
      alert(t('dashboard.shortcut_created'))
    } else {
      alert(t('dashboard.shortcut_error'))
    }
  }

  useEffect(() => {
    void loadInstances()

    const unregEdit = window.api.onContextEdit(async (id) => {
      const allInstances = await window.api.getInstances()
      const instance = allInstances.find((i: Instance) => i.id === id)
      if (instance) {
        handleOpenEdit(instance)
      }
    })

    const unregDelete = window.api.onContextDelete((id) => {
      handleDelete(id)
    })

    return () => {
      unregEdit()
      unregDelete()
    }
  }, [handleDelete])

  const getIconUrl = (path: string): string | null => {
    if (!path) return null
    const normalizedPath = path.replace(/\\/g, '/')
    return `instance-icon://local/${normalizedPath}`
  }

  return (
    <div className="min-h-screen bg-background text-foreground Selection:bg-primary/30">
      <div className="container mx-auto p-8 space-y-12 max-w-7xl">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-primary/10 pb-10">
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{t('dashboard.system_online')}</span>
            </div>
            <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-br from-foreground via-foreground/80 to-muted-foreground bg-clip-text text-transparent">
              {t('dashboard.title')}
            </h1>
            <p className="text-muted-foreground text-xl max-w-2xl font-medium leading-relaxed">
              {t('dashboard.subtitle_part1')}
              <span className="text-foreground border-b-2 border-primary/20">
                {t('dashboard.subtitle_highlight')}
              </span>
              {t('dashboard.subtitle_end')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              className="w-14 h-14 rounded-2xl border-primary/10 hover:bg-primary/5 hover:border-primary/20 transition-all active:scale-95"
              title={t('settings.header')}
            >
              <Settings className="w-6 h-6 text-muted-foreground" />
            </Button>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenAdd} className="group relative gap-3 px-8 h-14 text-lg font-bold shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all rounded-2xl overflow-hidden active:scale-95">
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary group-hover:opacity-90 transition-opacity" />
                <Plus className="relative w-6 h-6" />
                <span className="relative">{t('dashboard.add_instance')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] rounded-[2rem] border-primary/10 shadow-3xl">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black tracking-tight">{editingId ? t('dashboard.edit_instance') : t('dashboard.new_workspace')}</DialogTitle>
                <DialogDescription className="text-base">
                  {t('dashboard.instance_desc')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-8 py-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group cursor-pointer" onClick={handlePickIcon}>
                    <div className="w-32 h-32 rounded-[2.5rem] border-2 border-dashed border-primary/20 flex items-center justify-center overflow-hidden bg-muted/30 group-hover:bg-primary/5 group-hover:border-primary/50 transition-all duration-500 shadow-inner">
                      {icon ? (
                        <img src={getIconUrl(icon) || ''} alt="Preview" className="w-full h-full object-contain p-4 drop-shadow-md" />
                      ) : (
                        <Globe className="w-12 h-12 text-muted-foreground/20 group-hover:text-primary/40 transition-colors" />
                      )}
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground p-3 rounded-2xl shadow-xl scale-75 group-hover:scale-100 transition-transform duration-300">
                      <Search className="w-5 h-5" />
                    </div>
                  </div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('dashboard.branding')}</Label>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name" className="text-sm font-bold pl-1">{t('dashboard.label')}</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Production SP"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 rounded-xl bg-muted/30 border-primary/5 focus:border-primary/30 transition-all text-lg font-semibold"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="url" className="text-sm font-bold pl-1">{t('dashboard.url')}</Label>
                    <Input
                      id="url"
                      placeholder="https://dev12345.service-now.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="h-12 rounded-xl bg-muted/30 border-primary/5 focus:border-primary/30 transition-all text-lg font-semibold"
                    />
                  </div>
                </div>

                <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Key className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-md font-black italic uppercase tracking-tighter text-primary">{t('dashboard.secure_vault')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="user" className="text-[10px] font-black text-primary/60 uppercase tracking-widest pl-1">{t('dashboard.username')}</Label>
                      <Input
                        id="user"
                        placeholder="admin"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-10 rounded-lg bg-background border-primary/10"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pass" className="text-[10px] font-black text-primary/60 uppercase tracking-widest pl-1">{t('dashboard.password')}</Label>
                      <Input
                        id="pass"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 rounded-lg bg-background border-primary/10"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t pt-6 gap-3">
                <Button variant="ghost" onClick={() => setIsAddOpen(false)} className="px-6 rounded-xl font-bold">
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSave} className="px-10 rounded-xl h-12 font-black shadow-lg shadow-primary/20">
                  {t('dashboard.deploy')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {instances.map((instance) => (
            <Card
              key={instance.id}
              className="group relative flex flex-col cursor-context-menu bg-card/40 backdrop-blur-sm border-primary/10 rounded-[2.5rem] overflow-hidden hover:border-primary/40 hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] transition-all duration-500 hover:-translate-y-2"
              onContextMenu={(e) => {
                e.preventDefault()
                window.api.showContextMenu(instance.id)
              }}
            >
              <CardHeader className="flex flex-row items-center gap-5 space-y-0 p-8 pb-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-muted/50 to-muted border border-primary/5 flex items-center justify-center shrink-0 overflow-hidden group-hover:scale-105 group-hover:border-primary/20 transition-all duration-500 shadow-xl shadow-black/5">
                  {instance.icon ? (
                    <img src={getIconUrl(instance.icon) || ''} alt="" className="w-full h-full object-contain p-4 group-hover:p-3 transition-all" />
                  ) : (
                    <Globe className="w-10 h-10 text-muted-foreground/20 group-hover:text-primary/30 transition-colors" />
                  )}
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="inline-block px-2 py-0.5 rounded-md bg-primary/10 text-[9px] font-black tracking-widest text-primary uppercase mb-1">
                    {t('dashboard.verified')}
                  </div>
                  <CardTitle className="text-2xl font-black truncate leading-tight tracking-tight">
                    {instance.name}
                  </CardTitle>
                  <CardDescription className="truncate text-sm font-semibold text-muted-foreground/60 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    {instance.url.replace('https://', '').split('.com')[0]}.com
                  </CardDescription>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 px-8 py-2">
                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-bold text-primary">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    {t('dashboard.isolated')}
                  </div>
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-muted/40 text-[10px] font-bold text-muted-foreground">
                    #{instance.id.substring(0, 4)}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-between border-t border-primary/5 bg-muted/10 p-6 rounded-b-[2.5rem]">
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-11 h-11 rounded-2xl hover:bg-background hover:text-primary shadow-sm active:scale-95 transition-all" 
                    onClick={() => handleOpenEdit(instance)}
                    title={t('main.context.edit_settings')}
                  >
                    <Settings className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-11 h-11 rounded-2xl text-muted-foreground hover:bg-background hover:text-primary shadow-sm active:scale-95 transition-all"
                    onClick={() => handleCreateShortcut(instance.id)}
                    title={t('main.context.create_shortcut')}
                  >
                    <MonitorSmartphone className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-11 h-11 rounded-2xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive shadow-sm active:scale-95 transition-all"
                    onClick={() => handleDelete(instance.id)}
                    title={t('main.context.delete_instance')}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>
                <Button
                  className="group gap-3 h-12 px-6 rounded-2xl font-black shadow-xl shadow-primary/10 hover:shadow-primary/30 transition-all active:scale-95"
                  onClick={() => handleOpenInstance(instance.id, instance.name)}
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span className="hidden sm:inline">{t('dashboard.launch')}</span>
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Button>
              </CardFooter>
            </Card>
          ))}

          {instances.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-24 text-center border-4 border-dashed rounded-[4rem] bg-muted/20 border-primary/5 animate-in fade-in zoom-in duration-1000">
              <div className="relative mb-10">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full animate-pulse" />
                <div className="relative bg-background w-28 h-28 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] flex items-center justify-center border border-primary/10">
                  <Plus className="w-14 h-14 text-primary" />
                </div>
              </div>
              <h3 className="text-4xl font-black tracking-tight mb-4">{t('dashboard.empty_title')}</h3>
              <p className="text-muted-foreground max-w-lg mx-auto text-xl font-medium leading-relaxed mb-10">
                {t('dashboard.empty_desc')}
              </p>
              <Button variant="default" className="px-12 h-16 text-xl font-black rounded-3xl shadow-2xl shadow-primary/40 active:scale-95 transition-all" onClick={handleOpenAdd}>
                {t('dashboard.start_deployment')}
              </Button>
            </div>
          )}
        </section>
      </div>

      <GeneralSettings open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  )
}
