import { z } from "zod";

// 1. Business Analysis Schema
export const BusinessAnalysisOutputSchema = z.object({
  executiveSummary: z.string().min(10),
  businessObjectives: z.array(z.string()),
  currentState: z.string(),
  futureState: z.string(),
  painPoints: z.array(z.string()),
  gapAnalysis: z.object({
    processGaps: z.array(z.string()),
    technologyGaps: z.array(z.string()),
    dataGaps: z.array(z.string()),
  }),
  digitalMaturityScore: z.number().min(1).max(5),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type BusinessAnalysisOutput = z.infer<typeof BusinessAnalysisOutputSchema>;

// 2. Solution Recommendation Schema
export const RecommendationOutputSchema = z.object({
  problem: z.string(),
  recommendation: z.string(),
  businessValue: z.array(z.string()),
  automationOpportunities: z.array(z.string()),
  aiOpportunities: z.array(z.string()),
  technologyStack: z.array(z.string()),
  buildVsBuy: z.enum(["build", "buy", "hybrid"]),
  implementationApproach: z.enum(["phased", "big-bang", "pilot-first"]),
  confidenceScore: z.number().min(0).max(1),
});
export type RecommendationOutput = z.infer<typeof RecommendationOutputSchema>;

// 3. Solution Architecture (HLD/LLD) Schema
export const ArchitectureOutputSchema = z.object({
  title: z.string(),
  systemContext: z.string(),
  components: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      tech: z.string(),
    })
  ),
  dataStores: z.array(z.string()),
  securityBoundaries: z.array(z.string()),
  diagramSpec: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string() })),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  }),
});
export type ArchitectureOutput = z.infer<typeof ArchitectureOutputSchema>;

// 4. Process / BPMN Workflow Schema
export const ProcessWorkflowOutputSchema = z.object({
  processName: z.string(),
  steps: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      actor: z.string(),
      action: z.string(),
      automationPotential: z.enum(["high", "medium", "low", "none"]),
    })
  ),
  decisionPoints: z.array(
    z.object({
      id: z.string(),
      condition: z.string(),
      outcomes: z.array(z.string()),
    })
  ),
});
export type ProcessWorkflowOutput = z.infer<typeof ProcessWorkflowOutputSchema>;

// 5. UX Wireframe & User Journey Schema
export const UxWireframeOutputSchema = z.object({
  appType: z.string(),
  screens: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      purpose: z.string(),
      components: z.array(z.string()),
      navigationTargets: z.array(z.string()),
    })
  ),
  primaryUserJourney: z.array(z.string()),
});
export type UxWireframeOutput = z.infer<typeof UxWireframeOutputSchema>;

// 6. Data Model / API Schema
export const DataModelOutputSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      attributes: z.array(z.object({ name: z.string(), type: z.string(), primaryKey: z.boolean().optional() })),
    })
  ),
  relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
    })
  ),
  sqlDdl: z.string(),
  openApiEndpoints: z.array(
    z.object({
      path: z.string(),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
      summary: z.string(),
    })
  ),
});
export type DataModelOutput = z.infer<typeof DataModelOutputSchema>;

// 7. Roadmap & Planning Schema
export const PlanningOutputSchema = z.object({
  phases: z.array(
    z.object({
      name: z.string(),
      durationWeeks: z.number(),
      milestones: z.array(z.string()),
      dependencies: z.array(z.string()),
    })
  ),
  effortEstimate: z.object({
    totalPersonWeeks: z.number(),
    costRange: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  deliveryRisks: z.array(
    z.object({
      risk: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      mitigation: z.string(),
    })
  ),
});
export type PlanningOutput = z.infer<typeof PlanningOutputSchema>;
