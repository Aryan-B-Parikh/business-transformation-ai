import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ar from "./locales/ar.json";
import it from "./locales/it.json";
import nl from "./locales/nl.json";
import ko from "./locales/ko.json";
import ru from "./locales/ru.json";

export const defaultNS = "translation";
export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  zh: { translation: zh },
  ja: { translation: ja },
  ar: { translation: ar },
  it: { translation: it },
  nl: { translation: nl },
  ko: { translation: ko },
  ru: { translation: ru },
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
