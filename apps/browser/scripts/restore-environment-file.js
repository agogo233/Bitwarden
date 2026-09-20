#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

console.log("Restoring self-host patched files to original state...");

const REPO_ROOT = path.join(__dirname, "../../..");
const ORIG_DIR = path.join(__dirname, ".selfhost-orig");

const FILES = [
  path.join(REPO_ROOT, "libs/common/src/platform/services/default-environment.service.ts"),
  path.join(REPO_ROOT, "apps/browser/src/platform/services/browser-initial-install.service.ts"),
  path.join(
    REPO_ROOT,
    "apps/browser/src/dirt/phishing-detection/services/phishing-data.service.ts",
  ),
  path.join(REPO_ROOT, "libs/common/src/services/audit.service.ts"),
  path.join(REPO_ROOT, "libs/common/src/autofill/constants/index.ts"),
  path.join(REPO_ROOT, "apps/browser/src/manifest.json"),
  path.join(REPO_ROOT, "apps/browser/src/manifest.v3.json"),
];

function origPath(filePath) {
  return path.join(ORIG_DIR, path.relative(REPO_ROOT, filePath).replace(/[/\\]/g, "__"));
}

let restored = 0;

for (const filePath of FILES) {
  const orig = origPath(filePath);
  if (fs.existsSync(orig)) {
    fs.copyFileSync(orig, filePath);
    console.log(`Restored ${path.relative(REPO_ROOT, filePath)}`);
    restored += 1;
    continue;
  }

  if (filePath.endsWith("default-environment.service.ts")) {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes("key: Region.SelfHosted")) {
      content = content.replace(/\n  \{\n\s*key: Region\.SelfHosted,[\s\S]*?\n  \},\n/g, "");
      content = content.replace(
        /const DEFAULT_REGION = Region\.SelfHosted;/,
        "const DEFAULT_REGION = Region.US;",
      );
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Restored ${path.relative(REPO_ROOT, filePath)} via legacy regex`);
      restored += 1;
    }
  }
}

if (restored === 0) {
  console.log("No self-host configuration found, files are already in original state.");
} else {
  console.log("Files restored successfully!");
}
