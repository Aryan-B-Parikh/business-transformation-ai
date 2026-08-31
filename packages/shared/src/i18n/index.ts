import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import es from "./locales/es.json";

export const defaultNS = "translation";
export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  es: { translation: es }
};

export function initI18n(language: string = "en") {
  if (i18n.isInitialized) return i18n;

  i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false // React already safes from XSS
    }
  });

  return i18n;
}

export { i18n };
