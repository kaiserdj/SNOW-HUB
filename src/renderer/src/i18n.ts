import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../resources/locales/en.json'
import es from '../../resources/locales/es.json'

const resources = {
  en: { translation: en },
  es: { translation: es }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default, will be overridden by getLanguage
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

// Initialize language from store
window.api.getLanguage().then(async (lng) => {
  if (lng === 'auto') {
    // If auto, the main process will have already decided or we can detect here too
    // But since we want consistency, we'll ask the main process what the effective language is
    // Actually, let's just use the logic in main.tsx to set it
  } else {
    await i18n.changeLanguage(lng)
  }
})

// Listen for language changes from main process
window.api.onLanguageChanged((lng) => {
  i18n.changeLanguage(lng)
})

export default i18n
