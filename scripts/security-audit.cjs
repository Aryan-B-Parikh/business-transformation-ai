const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const apiDir = path.resolve(__dirname, "../apps/api");
const apiPackage = JSON.parse(fs.readFileSync(path.join(apiDir, "package.json"), "utf8"));
const declaredPptx = String(apiPackage.dependencies?.pptxgenjs || "");
const pptxApproved = ["4.0.1", "^4.0.1"].includes(declaredPptx);

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

// PptxGenJS 4.0.1 declares image-size, but the current HIGH image-size
// advisories have no patched release. npm's suggested remediation downgrades
// PptxGenJS to 1.1.5, which is incompatible with the supported export stack.
// Keep the exception strictly scoped to the declared PptxGenJS package and a
// vulnerability whose complete dependency chain is image-size. A standalone
// image-size vulnerability, or any other package carrying it, must still fail.
const isImageSizeViaPptx = (name, vulnerability) => {
  if (!pptxApproved || name !== "pptxgenjs") return false;
  const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
  return via.length > 0 && via.every((entry) =>
    entry === "image-size" || (entry && typeof entry === "object" && entry.name === "image-size"),
  );
};

const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities || {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  if (isImageSizeViaPptx(name, vulnerability)) continue;
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
if (pptxApproved) console.log("Tracked exception: PptxGenJS 4.0.1 -> image-size advisories only; standalone image-size advisories remain blocking.");
