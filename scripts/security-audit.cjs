const { spawnSync } = require("node:child_process");

// The release gate audits deployable API dependencies at HIGH severity.
// image-size is explicitly allowed only for the currently published advisory
// because the advisory database says no patched npm version exists as of 2026-09-02.
// Any other HIGH/CRITICAL finding remains a hard failure.
const allowed = new Set([
  "image-size:GHSA-w3rx-r6r6-pgpr",
  "image-size:GHSA-5p2g-fcmc-qvqq",
]);

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--workspace=@bta/api", "--omit=dev", "--audit-level=high", "--json"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

let report;
try {
  report = JSON.parse(result.stdout || result.stderr || "{}");
} catch {
  console.error("npm audit did not return valid JSON");
  console.error(result.stdout || result.stderr);
  process.exit(1);
}

const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities || {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  const advisories = (vulnerability.via || [])
    .filter((entry) => typeof entry === "object")
    .map((entry) => entry.source ? String(entry.source) : "");
  const relevant = advisories.length ? advisories : ["unknown"];
  for (const advisory of relevant) {
    if (!allowed.has(`${name}:${advisory}`)) {
      failures.push({ name, severity: vulnerability.severity, advisory });
    }
  }
}

if (failures.length) {
  console.error("Unapproved HIGH/CRITICAL production dependency vulnerabilities:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Dependency audit passed: no unapproved HIGH/CRITICAL API runtime vulnerabilities.");
if (report.vulnerabilities && Object.keys(report.vulnerabilities).length) {
  console.log("Known unpatched image-size advisories are explicitly tracked as security exceptions.");
}
