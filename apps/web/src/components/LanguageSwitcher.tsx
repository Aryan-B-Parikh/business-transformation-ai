/**
 * LanguageSwitcher — TASK-030
 * String externalization + language switcher for web + mobile
 */

import { getLanguageOptions, SupportedLanguage, t } from "@bta/shared";
import * as React from "react";

export interface LanguageSwitcherProps {
  value: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
}

export function LanguageSwitcher({ value, onChange }: LanguageSwitcherProps): React.ReactElement {
  const options = getLanguageOptions();
  return (
    <div data-testid="language-switcher">
      <label>
        {t("app.title", value)} — Language:
        <select data-testid="lang-select" value={value} onChange={(e) => onChange(e.target.value as SupportedLanguage)}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default LanguageSwitcher;
