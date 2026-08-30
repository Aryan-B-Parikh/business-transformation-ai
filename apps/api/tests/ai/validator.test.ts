import { describe, it, expect } from "vitest";
import {
  BusinessAnalysisOutputSchema,
  RecommendationOutputSchema,
  ArchitectureOutputSchema,
} from "../../src/ai/schemas";
import { validateAndRepairAIOutput } from "../../src/ai/validator";

describe("Phase 7: AI Output Validation & Automated Repair Loop", () => {
  it("validates compliant business analysis AI outputs", () => {
    const validAnalysis = {
      executiveSummary: "Autonomous AI-Driven Customer Service Platform Modernization.",
      businessObjectives: ["Reduce response latency by 80%", "Automate 60% of Tier 1 tickets"],
      currentState: "Legacy ticketing queue with manual dispatch.",
      futureState: "Event-driven AI triage with pgvector RAG.",
      painPoints: ["High triage overhead", "Slow customer resolution"],
      gapAnalysis: {
        processGaps: ["Manual routing"],
        technologyGaps: ["No semantic search"],
        dataGaps: ["Unindexed knowledge base"],
      },
      digitalMaturityScore: 3.5,
      risks: ["Integration latency with legacy backend"],
      assumptions: ["SOPs are available in PDF format"],
    };

    const result = validateAndRepairAIOutput(BusinessAnalysisOutputSchema, validAnalysis);
    expect(result.success).toBe(true);
    expect(result.data?.digitalMaturityScore).toBe(3.5);
  });

  it("repairs malformed AI output via repair callback", () => {
    const malformedRecommendation = {
      problem: "Slow ticket routing",
      recommendation: "Deploy AI Router",
      businessValue: ["Instant triage"],
      automationOpportunities: ["Tier 1 routing"],
      aiOpportunities: ["Intent classification"],
      technologyStack: ["FastAPI", "PostgreSQL"],
      buildVsBuy: "invalid_option", // Should be build, buy, or hybrid
      implementationApproach: "phased",
      confidenceScore: 0.9,
    };

    const result = validateAndRepairAIOutput(
      RecommendationOutputSchema,
      malformedRecommendation,
      (err) => ({
        ...malformedRecommendation,
        buildVsBuy: "build", // Repaired
      })
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.data?.buildVsBuy).toBe("build");
  });

  it("fails safely if AI output cannot be repaired", () => {
    const invalidArchitecture = {
      title: "HLD",
      // missing components, systemContext, etc.
    };

    const result = validateAndRepairAIOutput(ArchitectureOutputSchema, invalidArchitecture);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
