import i18next from 'i18next'
import { app } from 'electron'
import en from '../resources/locales/en.json'
import es from '../resources/locales/es.json'
import { store } from './store'

const resources = {
  en: { translation: en },
  es: { translation: es }
}

export async function initI18n(): Promise<void> {
  const savedLanguage = store.get('language')
  let lng = savedLanguage

  if (lng === 'auto') {
    const locale = app.getLocale().split('-')[0]
    lng = resources[locale] ? locale : 'en'
  }

  await i18next.init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })
}

export const t = i18next.t.bind(i18next)
export const changeLanguage = async (lng: string): Promise<void> => {
  if (lng === 'auto') {
    const locale = app.getLocale().split('-')[0]
    const effectiveLng = resources[locale] ? locale : 'en'
    await i18next.changeLanguage(effectiveLng)
  } else {
    await i18next.changeLanguage(lng)
  }
}

export default i18next
