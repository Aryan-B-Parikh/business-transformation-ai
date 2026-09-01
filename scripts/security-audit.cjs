const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Audit the deployable API runtime. The current PptxGenJS release is explicitly
// version-gated because its only HIGH finding is the unpatchable image-size
// advisory; image-size has no published release fixing the current advisory.
const apiDir = path.resolve(__dirname, "../apps/api");

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--omit=dev", "--audit-level=high", "--json"],
  { cwd: apiDir, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(result.stdout || result.stderr || "{}");
} catch {
  console.error("npm audit did not return valid JSON");
  console.error(result.stdout || result.stderr);
  process.exit(1);
}

let pptxApproved = false;
const pptxAudit = report.vulnerabilities?.pptxgenjs;
if (pptxAudit) {
  const installed = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["ls", "pptxgenjs", "--depth=0", "--json"],
    { cwd: apiDir, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  try {
    const tree = JSON.parse(installed.stdout || "{}");
    pptxApproved = tree.dependencies?.pptxgenjs?.version === "4.0.1";
  } catch {
    pptxApproved = false;
  }
}

const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities || {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  if (name === "pptxgenjs" && pptxApproved) continue;
  if (name === "image-size") continue;
  failures.push({
    name,
    severity: vulnerability.severity,
    via: vulnerability.via,
    fixAvailable: vulnerability.fixAvailable,
  });
}

if (failures.length) {
  console.error("Unapproved HIGH/CRITICAL API runtime dependency vulnerabilities:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

if (result.status !== 0 && !report.vulnerabilities) {
  console.error("npm audit failed without a vulnerability report");
  process.exit(result.status || 1);
}

console.log("Dependency audit passed: no unapproved HIGH/CRITICAL API runtime vulnerabilities.");
if (pptxApproved) console.log("Tracked exception: PptxGenJS 4.0.1 transitively declares image-size, which has no published fix for the current advisory.");
