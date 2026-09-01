const { spawnSync } = require("node:child_process");

// Audit deployable API dependencies at HIGH severity. image-size is the sole
// explicit exception because its current advisory has no published patched
// npm release; the parser/export surface is additionally covered by sandbox
// and parser-security tests.
const allowedUnpatched = new Set(["image-size"]);

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
  if (allowedUnpatched.has(name)) continue;
  failures.push({
    name,
    severity: vulnerability.severity,
    via: vulnerability.via,
    fixAvailable: vulnerability.fixAvailable,
  });
}

if (failures.length) {
  console.error("Unapproved HIGH/CRITICAL production dependency vulnerabilities:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Dependency audit passed: no unapproved HIGH/CRITICAL API runtime vulnerabilities.");
console.log("Tracked exception: image-size has no currently published patched npm release.");
