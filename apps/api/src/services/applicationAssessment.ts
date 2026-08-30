/**
 * Deep Existing Application Assessment Engine (Phase 9)
 * Sandboxed, read-only static analysis for Source Repositories, OpenAPI specs, SQL DDL, and Infrastructure manifests.
 * Never executes untrusted submitted code.
 */

export interface SourceCodeAssessmentInput {
  files: Array<{ path: string; content: string }>;
  repositoryUrl?: string;
}

export interface ApplicationAssessmentResult {
  languages: string[];
  frameworks: string[];
  architectureType: "monolith" | "microservices" | "serverless" | "modular-monolith";
  technicalDebtScore: number; // 0 - 100
  securityConcerns: Array<{ severity: "low" | "medium" | "high" | "critical"; issue: string; file?: string }>;
  apiInventory: {
    totalEndpoints: number;
    authMechanisms: string[];
    methods: Record<string, number>;
  };
  databaseTopology: {
    tables: number;
    foreignKeys: number;
    missingIndexRisks: string[];
  };
  infrastructure: {
    hasDocker: boolean;
    hasKubernetes: boolean;
    hasTerraform: boolean;
    cloudProviders: string[];
  };
  modernizationOpportunities: Array<{
    area: string;
    recommendation: string;
    aiOpportunity: string;
    impact: "high" | "medium" | "low";
  }>;
}

export function assessApplicationContext(
  input: SourceCodeAssessmentInput
): ApplicationAssessmentResult {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const securityConcerns: ApplicationAssessmentResult["securityConcerns"] = [];
  const missingIndexRisks: string[] = [];
  const cloudProviders = new Set<string>();

  let hasDocker = false;
  let hasKubernetes = false;
  let hasTerraform = false;
  let totalEndpoints = 0;
  let totalTables = 0;
  let totalFks = 0;
  const methods: Record<string, number> = { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0 };
  const authMechanisms = new Set<string>();

  for (const file of input.files) {
    const p = file.path.toLowerCase();
    const c = file.content;

    // Detect Languages & Frameworks
    if (p.endsWith(".ts") || p.endsWith(".tsx")) languages.add("TypeScript");
    if (p.endsWith(".js") || p.endsWith(".jsx")) languages.add("JavaScript");
    if (p.endsWith(".py")) languages.add("Python");
    if (p.endsWith(".go")) languages.add("Go");
    if (p.endsWith(".java")) languages.add("Java");
    if (p.endsWith(".cs")) languages.add("C# / .NET");

    if (p.includes("package.json")) {
      if (c.includes('"react"')) frameworks.add("React");
      if (c.includes('"next"')) frameworks.add("Next.js");
      if (c.includes('"express"')) frameworks.add("Express");
      if (c.includes('"prisma"')) frameworks.add("Prisma");
    }

    if (p.includes("requirements.txt") || p.includes("pyproject.toml")) {
      if (c.includes("fastapi")) frameworks.add("FastAPI");
      if (c.includes("django")) frameworks.add("Django");
      if (c.includes("flask")) frameworks.add("Flask");
    }

    // Detect Infrastructure
    if (p.includes("dockerfile") || p.includes("docker-compose")) hasDocker = true;
    if (p.endsWith(".k8s.yaml") || p.endsWith(".k8s.yml") || p.includes("helm") || p.includes("kubernetes")) {
      hasKubernetes = true;
    }
    if (p.endsWith(".tf")) {
      hasTerraform = true;
      if (c.includes("aws_")) cloudProviders.add("AWS");
      if (c.includes("azurerm_")) cloudProviders.add("Azure");
      if (c.includes("google_")) cloudProviders.add("GCP");
    }

    // Static SQL DDL Analysis
    if (p.endsWith(".sql") || p.includes("schema")) {
      const tableMatches = c.match(/CREATE\s+TABLE\s+(\w+)/gi);
      if (tableMatches) totalTables += tableMatches.length;

      const fkMatches = c.match(/FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES/gi);
      if (fkMatches) totalFks += fkMatches.length;

      if (c.includes("CREATE TABLE") && !c.includes("CREATE INDEX")) {
        missingIndexRisks.push(`Table definitions in ${file.path} lack explicit indexing`);
      }
    }

    // OpenAPI Analysis
    if (p.includes("openapi") || p.includes("swagger")) {
      const getCount = (c.match(/get:/gi) || []).length;
      const postCount = (c.match(/post:/gi) || []).length;
      const putCount = (c.match(/put:/gi) || []).length;
      const delCount = (c.match(/delete:/gi) || []).length;

      methods.GET += getCount;
      methods.POST += postCount;
      methods.PUT += putCount;
      methods.DELETE += delCount;
      totalEndpoints += getCount + postCount + putCount + delCount;

      if (c.includes("bearerAuth") || c.includes("Bearer")) authMechanisms.add("JWT / Bearer");
      if (c.includes("oauth2")) authMechanisms.add("OAuth2");
      if (c.includes("apiKey")) authMechanisms.add("API Key");
    }

    // Static Security Checks
    if (c.includes("password =") || c.includes("secret =") || c.includes("api_key =")) {
      securityConcerns.push({
        severity: "high",
        issue: "Potential hard-coded secret detected",
        file: file.path,
      });
    }
  }

  const archType: ApplicationAssessmentResult["architectureType"] =
    hasKubernetes || totalEndpoints > 30 ? "microservices" : hasDocker ? "modular-monolith" : "monolith";

  const technicalDebtScore = Math.min(
    100,
    (securityConcerns.length * 15) + (missingIndexRisks.length * 10) + (!hasDocker ? 20 : 0)
  );

  return {
    languages: Array.from(languages),
    frameworks: Array.from(frameworks),
    architectureType: archType,
    technicalDebtScore,
    securityConcerns,
    apiInventory: {
      totalEndpoints,
      authMechanisms: Array.from(authMechanisms),
      methods,
    },
    databaseTopology: {
      tables: totalTables,
      foreignKeys: totalFks,
      missingIndexRisks,
    },
    infrastructure: {
      hasDocker,
      hasKubernetes,
      hasTerraform,
      cloudProviders: Array.from(cloudProviders),
    },
    modernizationOpportunities: [
      {
        area: "Cloud Architecture",
        recommendation: hasDocker
          ? "Deploy containerized services to managed Kubernetes (AKS/EKS) with auto-scaling."
          : "Containerize application tiers with multi-stage Docker builds.",
        aiOpportunity: "Integrate autonomous agent copilot for contextual customer assistance.",
        impact: "high",
      },
      {
        area: "Data & Persistence",
        recommendation: "Implement automated connection pooling and database indexing for foreign keys.",
        aiOpportunity: "Embed pgvector vector indexing for enterprise semantic search and RAG.",
        impact: "high",
      },
    ],
  };
}
