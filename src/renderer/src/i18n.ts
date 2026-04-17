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
  if (!lng || lng === 'auto') {
    const systemLng = navigator.language.split('-')[0]
    await i18n.changeLanguage(systemLng)
  } else {
    await i18n.changeLanguage(lng)
  }
})

// Listen for language changes from main process
window.api.onLanguageChanged((lng) => {
  i18n.changeLanguage(lng)
})

export default i18n
