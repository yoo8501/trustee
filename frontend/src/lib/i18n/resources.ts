// RED stub — Sprint 1 TDD
export const resources = {
  ko: { translation: {} },
  en: { translation: {} },
} as const;

export type AppLanguage = keyof typeof resources;
export const supportedLanguages: AppLanguage[] = [];
