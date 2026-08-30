/**
 * TASK-030 — i18n framework (web)
 * DoD: Switching language changes UI strings
 */

import { t } from "@bta/shared";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect } from "vitest";
import { App } from "../src/App";

describe("TASK-030: i18n UI", () => {
  it("t() returns correct translations", () => {
    expect(t("app.title", "en")).toBe("Business Transformation AI");
    expect(t("app.title", "es")).toBe("IA de Transformación Empresarial");
    expect(t("app.title", "fr")).not.toBe(t("app.title", "en"));
  });

  it("App LanguageSwitcher changes UI strings", async () => {
    render(<App />);
    expect(screen.getByText("Business Transformation AI")).toBeDefined();
    expect(screen.getByText("1. Upload Business Documents")).toBeDefined();
    // Switch to Spanish
    const select = screen.getByTestId("lang-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "es" } });
    expect(screen.getByText("IA de Transformación Empresarial")).toBeDefined();
    expect(screen.getByText("1. Subir Documentos Empresariales")).toBeDefined();
    // Switch to French
    fireEvent.change(select, { target: { value: "fr" } });
    expect(screen.getByText("IA de Transformation d'Entreprise")).toBeDefined();
  });

  it("App shows current lang indicator", () => {
    render(<App />);
    expect(screen.getByTestId("current-lang").textContent).toContain("en");
    const select = screen.getByTestId("lang-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hi" } });
    expect(screen.getByTestId("current-lang").textContent).toContain("hi");
  });

  it("All supported languages are available in switcher", () => {
    render(<App />);
    const select = screen.getByTestId("lang-select") as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThanOrEqual(10);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("en");
    expect(values).toContain("es");
    expect(values).toContain("ja");
    expect(values).toContain("zh");
  });
});
