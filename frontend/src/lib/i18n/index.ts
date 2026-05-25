import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, supportedLanguages } from './resources';

function detectInitialLanguage(): string {
  if (typeof navigator === 'undefined') return 'ko';
  const candidate = (navigator.language || 'ko').toLowerCase();
  if (candidate.startsWith('ko')) return 'ko';
  if (candidate.startsWith('en')) return 'en';
  return 'ko';
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: detectInitialLanguage(),
    fallbackLng: 'ko',
    supportedLngs: supportedLanguages,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
export { resources, supportedLanguages } from './resources';
export type { AppLanguage } from './resources';
export { resolveErrorMessage } from './resolveErrorMessage';
