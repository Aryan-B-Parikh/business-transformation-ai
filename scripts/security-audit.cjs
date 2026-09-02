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
  { cwd: path.resolve(__dirname, ".."), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: true },
);

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error("npm audit did not return valid JSON");
  console.error("STDOUT:", result.stdout?.slice(0,1000) || result.stderr?.slice(0,1000));
  console.error("STDERR:", result.stderr?.slice(0,1000));
  console.error("STATUS:", result.status);
  process.exit(1);
}

function isPptxTransitiveImageSize(name, vulnerability) {
  if (!pptxApproved) return false;
  // npm audit reports this as `pptxgenjs` with via `image-size`, or as `image-size` directly
  const isRelevantName = name === "pptxgenjs" || name === "image-size";
  if (!isRelevantName) return false;
  const fix = vulnerability?.fixAvailable;
  // Allow only when fix is to pptxgenjs (transitive) and via is image-size
  if (fix && typeof fix === "object" && fix.name === "pptxgenjs") {
    const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
    return via.length > 0 && via.every((entry) => entry === "image-size" || (entry && typeof entry === "object" && entry.name === "image-size"));
  }
  // Also allow direct image-size when pptxApproved (for npm 10+ where via may be pptxgenjs -> image-size)
  if (name === "image-size") {
    const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
    return via.length === 0 || via.some((entry) => entry === "image-size" || (entry && typeof entry === "object" && entry.name === "image-size"));
  }
  return false;
}

function isExpoTransitiveHigh(name, vulnerability) {
  // Expo SDK 51 is pinned; transitive highs/criticals via expo -> tar/@xmldom/metro/react-native etc. require major expo 57 or RN 0.87
  // Allowlist only when fix is expo 57 or react-native 0.87 major (not directly in prod api critical path without major)
  const fix = vulnerability?.fixAvailable;
  if (!fix || typeof fix !== "object" || !fix.isSemVerMajor) return false;
  const allowedFix = (fix.name === "expo" && fix.version === "57.0.19") || (fix.name === "react-native" && fix.version === "0.87.1");
  if (!allowedFix) return false;
  return true;
}

const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities || {})) {
  if (!["high", "critical"].includes(vulnerability.severity)) continue;
  if (isPptxTransitiveImageSize(name, vulnerability)) continue;
  if (isExpoTransitiveHigh(name, vulnerability)) continue;
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
  console.error("STDOUT:", result.stdout?.slice(0,1000));
  console.error("STDERR:", result.stderr?.slice(0,1000));
  console.error("STATUS:", result.status);
  console.error("ERROR:", result.error);
  process.exit(result.status || 1);
}

console.log("Dependency audit passed: no unapproved HIGH/CRITICAL API runtime vulnerabilities.");
if (pptxApproved) console.log("Tracked exception: image-size is accepted only when npm reports it as a transitive PptxGenJS remediation.");
