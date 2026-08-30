/**
 * TASK-022 — Dashboard UI
 * Tests Dashboard component renders scores and history
 */

import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect } from "vitest";
import { Dashboard } from "../src/components/Dashboard";

describe("Dashboard", () => {
  it("renders scores with bars", () => {
    const scores = { digitalMaturity: 3.5, aiReadiness: 3.2, automationOpportunity: 3.8, projectHealth: 4.0, implementationReadiness: 3.5, solutionQuality: 4.0 };
    render(<Dashboard scores={scores} counts={{ artifacts: 3, roadmapItems: 5, estimates: 3 }} />);
    expect(screen.getByTestId("dashboard")).toBeDefined();
    expect(screen.getByTestId("bar-Digital Maturity")).toBeDefined();
    expect(screen.getAllByText("3.5 / 5").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("dashboard-counts").textContent).toContain("Artifacts: 3");
  });

  it("shows placeholder when no data", () => {
    render(<Dashboard scores={null} />);
    expect(screen.getByTestId("no-dashboard")).toBeDefined();
  });

  it("App includes dashboard section (TASK-022)", async () => {
    const { App } = await import("../src/App");
    const { render: r } = await import("@testing-library/react");
    const view = r(<App />);
    expect(view.getByText("5. Transformation Dashboard (TASK-022)")).toBeDefined();
    expect(view.getByTestId("dashboard")).toBeDefined();
  });
});
