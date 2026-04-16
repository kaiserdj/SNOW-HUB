import { useState, useEffect, useRef } from 'react'
import { Plus, X, Globe, Lock, Zap, Settings, ArrowLeft, ArrowRight, RotateCw, Copy, Check } from 'lucide-react'

export interface Tab {
  id: number
  url: string
  title: string
  isActive: boolean
  tableName?: string
  sysId?: string
}

export function InstanceView({ instanceId }: { instanceId: string }): React.JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<number | null>(null)
  const [instanceName, setInstanceName] = useState('Loading...')
  const [credentials, setCredentials] = useState<{ username?: string; password?: string }>({})
  const [urlInput, setUrlInput] = useState('')
  const initialTabCreated = useRef(false)
  const isUrlFocused = useRef(false)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [copied, setCopied] = useState(false)
  const lastScrolledTabId = useRef<number | null>(null)
  const isReorderingRef = useRef(false)

  const refreshTabs = async (): Promise<void> => {
    const rawTabs = await window.api.getTabs(instanceId)
    setTabs(rawTabs)
    const active = rawTabs.find((t) => t.isActive)
    if (active) setActiveTabId(active.id)
  }

  useEffect(() => {
    // Initial fetch
    const loadData = async (): Promise<void> => {
      const instances = await window.api.getInstances()
      const inst = instances.find((i) => i.id === instanceId)
      if (inst) {
        setInstanceName(inst.name)
        // Check if there are already tabs before creating one
        const currentTabs = await window.api.getTabs(instanceId)
        if (currentTabs.length === 0 && !initialTabCreated.current) {
          initialTabCreated.current = true
          // Initial tab
          await window.api.createTab(instanceId, inst.url)
        }
      }

      const creds = await window.api.getCredentials(instanceId)
      setCredentials(creds)
    }

    loadData()

    // Refresh interval to catch tab events
    const tf = async (): Promise<void> => {
      if (isReorderingRef.current) return
      const rawTabs = await window.api.getTabs(instanceId)
      setTabs(rawTabs)
      const active = rawTabs.find((t) => t.isActive)
      if (active) {
        setActiveTabId(active.id)
        if (!isUrlFocused.current) {
          setUrlInput(active.url)
        }
      }
    }

    const unreg = window.api.onTabUpdated((id) => {
      if (id === instanceId) {
        tf()
      }
    })

    // Poll just in case we miss an event
    const intv = setInterval(tf, 1000)
    tf()

    return () => {
      unreg()
      clearInterval(intv)
    }
  }, [instanceId])

  const checkScroll = (): void => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current
      setCanScrollLeft(scrollLeft > 5)
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5)
    }
  }

  const scrollTabs = (direction: 'left' | 'right'): void => {
    if (tabsContainerRef.current) {
      const scrollAmount = 200
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  useEffect(() => {
    if (activeTabId && tabsContainerRef.current) {
      if (lastScrolledTabId.current !== activeTabId) {
        const activeTabElement = tabsContainerRef.current.querySelector(`[data-tab-id="${activeTabId}"]`)
        if (activeTabElement) {
          activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
          lastScrolledTabId.current = activeTabId
        }
      }
    }
    checkScroll()
  }, [activeTabId, tabs])

  const handleCreate = async (): Promise<void> => {
    const instances = await window.api.getInstances()
    const inst = instances.find((i) => i.id === instanceId)
    if (inst) {
      await window.api.createTab(instanceId, inst.url)
      refreshTabs()
    }
  }

  const handleClose = async (
    e: React.MouseEvent | React.KeyboardEvent | MouseEvent,
    tabId: number
  ): Promise<void> => {
    if ('stopPropagation' in e) e.stopPropagation()
    await window.api.closeTab(instanceId, tabId)
    refreshTabs()
  }

  const handleSwitch = async (tabId: number): Promise<void> => {
    await window.api.switchTab(instanceId, tabId)
    const rawTabs = await window.api.getTabs(instanceId)
    setTabs(rawTabs)
    const active = rawTabs.find((t) => t.id === tabId)
    if (active) {
      setActiveTabId(active.id)
      setUrlInput(active.url)
    }
  }

  const handleWheel = (e: React.WheelEvent): void => {
    if (tabsContainerRef.current) {
      e.preventDefault()
      // Convert vertical scroll to horizontal
      tabsContainerRef.current.scrollLeft += e.deltaY
    }
  }

  const handleAuxClick = (e: React.MouseEvent, tabId: number): void => {
    // Button 1 is middle click
    if (e.button === 1) {
      handleClose(e, tabId)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Check for Ctrl+W (or Cmd+W on Mac)
      const isCmdOrCtrl = e.ctrlKey || e.metaKey
      if (isCmdOrCtrl && e.key.toLowerCase() === 'w' && activeTabId) {
        e.preventDefault()
        window.api.closeTab(instanceId, activeTabId).then(() => {
          refreshTabs()
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [instanceId, activeTabId])

  const handleCopy = (): void => {
    navigator.clipboard.writeText(urlInput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text)
  }

  const navigateToRecord = (table: string, sysId: string): void => {
    if (!activeTabId) return
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return

    try {
      const url = new URL(activeTab.url)
      const baseUrl = url.origin
      let newUrl = ''

      if (sysId === 'List' || sysId.toLowerCase() === 'list') {
        newUrl = `${baseUrl}/nav_to.do?uri=${encodeURIComponent(`${table}_list.do`)}`
        window.api.navigate(instanceId, activeTabId, newUrl)
      } else {
        // Use SN Utils smart search logic if available, fallback to sys_id.do
        const script = `
          (function() {
            if (typeof snuSearchSysIdTables === 'function') {
              // Intercept the info text to auto-hide the slash command on success
              var originalInfo = window.snuSlashCommandInfoText;
              window.snuSlashCommandInfoText = function(text, isFinal) {
                if (typeof originalInfo === 'function') originalInfo(text, isFinal);
                if (isFinal) {
                  window.snuSlashCommandInfoText = originalInfo; // Restore
                  if (text.includes('Opening')) {
                    setTimeout(function() {
                      if (typeof snuSlashCommandHide === 'function') snuSlashCommandHide();
                    }, 1500); // Wait a bit so the user sees the "Opening" message
                  }
                }
              };
              snuSearchSysIdTables("${sysId}");
            } else {
              window.location.href = "sys_id.do?sys_id=${sysId}";
            }
          })()
        `
        window.api.executeJavaScript(instanceId, activeTabId, script)
      }
    } catch (e) {
      console.error('Navigation failed:', e)
    }
  }

  const handleDragStart = (e: React.DragEvent, tabId: number): void => {
    e.dataTransfer.setData('tabId', tabId.toString())
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetTabId: number): Promise<void> => {
    e.preventDefault()
    const draggedTabId = parseInt(e.dataTransfer.getData('tabId'), 10)
    if (draggedTabId === targetTabId) return

    const draggedIndex = tabs.findIndex((t) => t.id === draggedTabId)
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      isReorderingRef.current = true
      // Optimitic update in UI
      const newTabs = [...tabs]
      const [removed] = newTabs.splice(draggedIndex, 1)
      newTabs.splice(targetIndex, 0, removed)
      setTabs(newTabs)

      // Sync with backend
      await window.api.reorderTab(instanceId, draggedTabId, targetIndex)

      // Small delay to allow backend event to process
      setTimeout(() => {
        isReorderingRef.current = false
      }, 500)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Top Tab Bar */}
      <div
        className="h-10 bg-muted/30 flex items-center pr-2 select-none border-b border-border/50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Instance info */}
        <div className="px-4 border-r border-border h-full flex items-center bg-background/20 backdrop-blur-md">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground mr-2">
            {instanceName}
          </span>
          {credentials.username && (
            <div title={`Credentials ready for ${credentials.username}`}>
              <Lock className="w-3 h-3 text-primary" />
            </div>
          )}
        </div>

        {/* Tabs container */}
        <div className="flex-1 relative h-full flex items-end overflow-hidden group/tabs">
          {/* Left indicator click area */}
          <button
            onClick={() => scrollTabs('left')}
            className={`absolute left-0 bottom-0 top-0 w-8 z-30 bg-gradient-to-r from-muted/80 to-transparent transition-opacity duration-300 flex items-center justify-start pl-1 cursor-pointer hover:from-muted ${canScrollLeft ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          </button>

          <div
            ref={tabsContainerRef}
            onScroll={checkScroll}
            onWheel={handleWheel}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault() // Prevent middle-click autoscroll
            }}
            className="flex-1 flex px-1 h-full items-end gap-1 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, tab.id)}
                onClick={() => handleSwitch(tab.id)}
                onAuxClick={(e) => handleAuxClick(e, tab.id)}
                className={`flex items-center gap-2 group min-w-[32px] sm:min-w-[120px] flex-1 max-w-[200px] h-8 px-2 sm:px-3 rounded-t-md border border-b-0 cursor-default transition-all ${
                  activeTabId === tab.id
                    ? 'bg-background border-border translate-y-[1px] z-10'
                    : 'bg-muted/50 border-transparent hover:bg-muted text-muted-foreground'
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs truncate flex-1 min-w-0">{tab.title}</span>
                <button
                  onClick={(e) => handleClose(e, tab.id)}
                  className={`w-4 h-4 shrink-0 rounded-sm flex items-center justify-center hover:bg-muted-foreground/20 transition-opacity ${
                    activeTabId === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Right indicator click area */}
          <button
            onClick={() => scrollTabs('right')}
            className={`absolute right-0 bottom-0 top-0 w-8 z-30 bg-gradient-to-l from-muted/80 to-transparent transition-opacity duration-300 flex items-center justify-end pr-1 cursor-pointer hover:from-muted ${canScrollRight ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-1" />
          </button>
        </div>

        {/* Fixed New Tab Button */}
        <button
          onClick={handleCreate}
          className="h-8 w-8 min-w-[32px] shrink-0 flex items-center justify-center rounded-md hover:bg-muted/80 text-muted-foreground transition-colors self-end mb-[1px]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="New Tab"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Actions */}
        <div
          className="flex items-center gap-1 ml-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-[1px] h-4 bg-border mx-1 shrink-0" />
          <button
            onClick={() => window.api.openSNUtilsPopup()}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted/80 text-amber-500 transition-colors"
            title="SN Utils Popup"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.api.openSNUtilsSettings()}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted/80 text-muted-foreground transition-colors"
            title="SN Utils Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Address Bar */}
      <div className="h-10 bg-background border-b border-border flex items-center px-4 gap-3 z-20 shadow-sm">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => activeTabId && window.api.goBack(instanceId, activeTabId)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeTabId && window.api.goForward(instanceId, activeTabId)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            title="Forward"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => activeTabId && window.api.reload(instanceId, activeTabId)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:rotate-180"
            title="Refresh"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex items-center bg-muted/40 border border-border/50 rounded-lg px-3 py-1.5 gap-2 focus-within:bg-muted/10 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={urlInput}
            onFocus={(e) => {
              isUrlFocused.current = true
              e.currentTarget.select()
            }}
            onBlur={() => (isUrlFocused.current = false)}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && activeTabId) {
                window.api.navigate(instanceId, activeTabId, urlInput)
                e.currentTarget.blur()
              }
            }}
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground placeholder:text-muted-foreground/50"
            placeholder="Search or enter address"
          />
          
          {/* Mini Bar for Table and SysID */}
          {activeTabId && tabs.find(t => t.id === activeTabId) && (tabs.find(t => t.id === activeTabId)?.tableName || tabs.find(t => t.id === activeTabId)?.sysId) && (
            <div className="flex items-center gap-1.5 ml-2 mr-1 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="w-[1px] h-3.5 bg-border/60 mx-1" />
              
              {tabs.find(t => t.id === activeTabId)?.tableName && (
                <EditableMetadataChip
                  label="T:"
                  value={tabs.find(t => t.id === activeTabId)!.tableName!}
                  onSave={(newTable) => navigateToRecord(newTable, 'List')}
                  onCopy={() => copyToClipboard(tabs.find(t => t.id === activeTabId)!.tableName!)}
                  className="bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary"
                  title="Table Name"
                />
              )}
              
              {tabs.find(t => t.id === activeTabId)?.sysId && (
                <EditableMetadataChip
                  label={tabs.find(t => t.id === activeTabId)?.sysId === 'List' ? 'L:' : 'S:'}
                  value={tabs.find(t => t.id === activeTabId)!.sysId!}
                  onSave={(newSysId) => navigateToRecord(tabs.find(t => t.id === activeTabId)!.tableName!, newSysId)}
                  onCopy={() => copyToClipboard(tabs.find(t => t.id === activeTabId)!.sysId!)}
                  className={tabs.find(t => t.id === activeTabId)?.sysId === 'List'
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  }
                  title={tabs.find(t => t.id === activeTabId)?.sysId === 'List' ? 'List View' : 'SysID'}
                  disableTruncate={tabs.find(t => t.id === activeTabId)?.sysId !== 'List'}
                />
              )}
            </div>
          )}

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-all"
            title="Copy URL"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <div className="min-w-[40px]" />
      </div>

      {/* WebContentsView container filler */}
      <div className="flex-1 bg-background" />
    </div>
  )
}
function EditableMetadataChip({
  label,
  value,
  onSave,
  onCopy,
  className,
  title,
  disableTruncate = false
}: {
  label: string
  value: string
  onSave: (val: string) => void
  onCopy: () => void
  className: string
  title: string
  disableTruncate?: boolean
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      onSave(inputValue)
      setIsEditing(false)
    } else if (e.key === 'Escape') {
      setInputValue(value)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className={`flex items-center h-6 px-1 rounded-md border ${className} transition-all`}>
        <span className="text-[10px] font-bold opacity-60 mr-1 select-none">{label}</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsEditing(false)}
          className="bg-transparent border-none outline-none text-[11px] font-medium w-auto min-w-[40px] max-w-[150px] p-0"
          style={{ width: `${Math.min(Math.max(inputValue.length, 4), 20)}ch` }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      onContextMenu={(e) => {
        e.preventDefault()
        onCopy()
      }}
      className={`flex items-center h-6 px-2 rounded-md border cursor-text transition-all active:scale-95 group/chip ${className}`}
      title={`${title} (Click to edit, Right-click to copy)`}
    >
      <span className="opacity-70 group-hover/chip:opacity-100 mr-1 text-[10px] font-bold select-none">{label}</span>
      <span className={`${disableTruncate ? '' : 'max-w-[120px] truncate'} text-[11px] font-medium ${disableTruncate ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
