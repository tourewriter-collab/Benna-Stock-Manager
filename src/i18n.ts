import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';

let savedLanguage = 'en';
try {
  savedLanguage = localStorage.getItem('language') || 'en';
} catch (error) {
  console.warn('localStorage not available:', error);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('language', lng);
  } catch (error) {
    console.warn('Failed to save language preference:', error);
  }
});

export default i18n;
