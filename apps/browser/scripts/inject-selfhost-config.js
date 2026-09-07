#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SELF_HOST_URL = (process.env.SELF_HOST_URL || "").replace(/\/+$/, "");

if (!SELF_HOST_URL) {
  console.log("SELF_HOST_URL not set, skipping self-host config injection");
  process.exit(0);
}

console.log(`Injecting self-host URL: ${SELF_HOST_URL}`);

const REPO_ROOT = path.join(__dirname, "../../..");
const ORIG_DIR = path.join(__dirname, ".selfhost-orig");

const FILES = {
  env: path.join(
    REPO_ROOT,
    "libs/common/src/platform/services/default-environment.service.ts",
  ),
  welcome: path.join(
    REPO_ROOT,
    "apps/browser/src/platform/services/browser-initial-install.service.ts",
  ),
  phishing: path.join(
    REPO_ROOT,
    "apps/browser/src/dirt/phishing-detection/services/phishing-data.service.ts",
  ),
  audit: path.join(REPO_ROOT, "libs/common/src/services/audit.service.ts"),
  fillAssist: path.join(REPO_ROOT, "libs/common/src/autofill/constants/index.ts"),
  manifest: path.join(REPO_ROOT, "apps/browser/src/manifest.json"),
  manifestV3: path.join(REPO_ROOT, "apps/browser/src/manifest.v3.json"),
};

function origPath(filePath) {
  return path.join(ORIG_DIR, path.relative(REPO_ROOT, filePath).replace(/[/\\]/g, "__"));
}

function readOriginal(filePath) {
  const orig = origPath(filePath);
  if (!fs.existsSync(ORIG_DIR)) {
    fs.mkdirSync(ORIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(orig)) {
    fs.copyFileSync(filePath, orig);
  }
  return fs.readFileSync(orig, "utf8");
}

function writePatched(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Patched ${path.relative(REPO_ROOT, filePath)}`);
}

function mustReplace(content, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (!content.includes(pattern)) {
      throw new Error(`Could not find ${label}`);
    }
    return content.split(pattern).join(replacement);
  }
  if (!pattern.test(content)) {
    throw new Error(`Could not find ${label}`);
  }
  return content.replace(pattern, replacement);
}

function injectEnvironment(content) {
  const startMarker = "export const PRODUCTION_REGIONS: RegionConfig[] = [";
  const endMarker = "];\n\n/**\n * The default region when starting the app.";
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error("Could not find PRODUCTION_REGIONS");
  }

  const selfHostedRegionConfig = `  {
    key: Region.SelfHosted,
    domain: "self-hosted",
    urls: {
      base: "${SELF_HOST_URL}",
      api: "${SELF_HOST_URL}/api",
      identity: "${SELF_HOST_URL}/identity",
      icons: "${SELF_HOST_URL}/icons",
      webVault: "${SELF_HOST_URL}",
      notifications: "${SELF_HOST_URL}/notifications",
      events: "${SELF_HOST_URL}/events",
      scim: "${SELF_HOST_URL}/scim",
      send: "${SELF_HOST_URL}",
    },
  },
`;

  content =
    content.slice(0, start + startMarker.length) +
    "\n" +
    selfHostedRegionConfig +
    content.slice(end);

  return mustReplace(
    content,
    /const DEFAULT_REGION = Region\.[A-Za-z]+;/,
    "const DEFAULT_REGION = Region.SelfHosted;",
    "DEFAULT_REGION",
  );
}

function injectWelcome(content) {
  return mustReplace(
    content,
    "      void BrowserApi.createNewTab(WELCOME_PAGE_URL);",
    "      if (WELCOME_PAGE_URL.length < 0) {\n        void BrowserApi.createNewTab(WELCOME_PAGE_URL);\n      } // SELFHOST_SKIP_WELCOME",
    "createNewTab(WELCOME_PAGE_URL)",
  );
}

function injectPhishing(content) {
  return mustReplace(
    content,
    `        exhaustMap((currentMeta) => {
          return this._backgroundUpdate(currentMeta);
        }),`,
    `        exhaustMap((currentMeta) => {
          return of(currentMeta); // SELFHOST_SKIP_PHISHING
        }),`,
    "_backgroundUpdate exhaustMap",
  );
}

function injectAudit(content) {
  const startMarker =
    "  protected async fetchLeakedPasswordCount(password: string): Promise<number> {";
  const start = content.indexOf(startMarker);
  if (start === -1) {
    throw new Error("Could not find fetchLeakedPasswordCount");
  }
  const bodyStart = start + startMarker.length;
  const end = content.indexOf("\n  }", bodyStart);
  if (end === -1) {
    throw new Error("Could not find fetchLeakedPasswordCount end");
  }
  const body = content.slice(bodyStart, end);
  return (
    content.slice(0, bodyStart) +
    "\n    if (password.length < 0) {" +
    body +
    "\n    }\n    return 0; // SELFHOST_SKIP_HIBP" +
    content.slice(end)
  );
}

function injectFillAssist(content) {
  const needle = `export const DEFAULT_FILL_ASSIST_RULES_URL =
  "https://github.com/bitwarden/map-the-web/releases/latest/download";`;
  const replacement = `export const DEFAULT_FILL_ASSIST_RULES_URL =
  "${SELF_HOST_URL}/fill-assist-rules"; // SELFHOST_SKIP_MAP_THE_WEB`;
  return mustReplace(content, needle, replacement, "DEFAULT_FILL_ASSIST_RULES_URL");
}

function injectManifest(content) {
  return mustReplace(
    content,
    '"homepage_url": "https://bitwarden.com"',
    `"homepage_url": "${SELF_HOST_URL}"`,
    "homepage_url",
  );
}

const patches = [
  [FILES.env, injectEnvironment],
  [FILES.welcome, injectWelcome],
  [FILES.phishing, injectPhishing],
  [FILES.audit, injectAudit],
  [FILES.fillAssist, injectFillAssist],
  [FILES.manifest, injectManifest],
  [FILES.manifestV3, injectManifest],
];

for (const [filePath, transform] of patches) {
  const original = readOriginal(filePath);
  writePatched(filePath, transform(original));
}

console.log("Self-host configuration injected successfully!");
