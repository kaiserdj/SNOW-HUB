import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Globe, Info, User } from 'lucide-react'

const GithubIcon = (props: React.SVGProps<SVGSVGElement>): React.JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.28 1.15-.28 2.35 0 3.5-.73 1.02-1.08 2.25-1 3.5 0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)

interface GeneralSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GeneralSettings({ open, onOpenChange }: GeneralSettingsProps): React.JSX.Element {
  const { t } = useTranslation()
  const [currentLng, setCurrentLng] = useState<string>('auto')
  const [version, setVersion] = useState<string>('...')

  useEffect(() => {
    window.api.getLanguage().then(setCurrentLng)
    window.api.getAppVersion().then(setVersion)
  }, [])

  const handleLanguageChange = async (lng: string): Promise<void> => {
    setCurrentLng(lng)
    await window.api.setLanguage(lng)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] rounded-[2rem] border-primary/10 shadow-3xl">
        <DialogHeader>
          <DialogTitle className="text-3xl font-black tracking-tight">{t('settings.header')}</DialogTitle>
          <DialogDescription>
            {t('dashboard.instance_desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-8 py-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-primary" />
              <Label className="text-base font-bold">{t('settings.language')}</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={currentLng === 'auto' ? 'default' : 'outline'}
                onClick={() => handleLanguageChange('auto')}
                className="rounded-xl h-12 font-bold"
              >
                Auto
              </Button>
              <Button
                variant={currentLng === 'en' ? 'default' : 'outline'}
                onClick={() => handleLanguageChange('en')}
                className="rounded-xl h-12 font-bold"
              >
                English
              </Button>
              <Button
                variant={currentLng === 'es' ? 'default' : 'outline'}
                onClick={() => handleLanguageChange('es')}
                className="rounded-xl h-12 font-bold"
              >
                Español
              </Button>
            </div>
          </div>

          <div className="bg-muted/30 p-6 rounded-3xl border border-primary/5 space-y-4">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">App Info</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-muted-foreground">{t('settings.version')}</span>
                <span className="font-black font-mono bg-primary/10 px-2 py-1 rounded text-primary">{version}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-muted-foreground">{t('settings.credits')}</span>
                <div className="flex items-center gap-2">
                   <User className="w-4 h-4 text-primary" />
                   <span className="font-bold">{t('settings.creator')}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-center gap-4">
               <a href="https://github.com/kaiserdj/SNOW-HUB" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <GithubIcon className="w-5 h-5" />
               </a>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={() => onOpenChange(false)} className="px-8 rounded-xl font-bold">
            {t('settings.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
