import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const zipName = `histsieve-v${pkg.version}.zip`;
const zipPath = join(releaseDir, zipName);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${relative(root, path)} is not a PNG file`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walkFiles(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateDist() {
  const manifestPath = join(distDir, "manifest.json");
  assert(existsSync(manifestPath), "dist/manifest.json is missing");

  const manifest = readJson(manifestPath);
  assert(manifest.manifest_version === 3, "manifest_version must be 3");
  assert(
    manifest.version === pkg.version,
    `manifest version must match package version ${pkg.version}`,
  );
  assert(manifest.default_locale === "en", "default_locale must be en");
  assert(manifest.background?.service_worker, "background service worker is missing");

  const expectedPermissions = ["alarms", "history", "storage"];
  const actualPermissions = [...(manifest.permissions ?? [])].sort();
  assert(
    JSON.stringify(actualPermissions) === JSON.stringify(expectedPermissions),
    `unexpected permissions: ${actualPermissions.join(", ")}`,
  );

  for (const locale of ["en", "zh_CN"]) {
    assert(
      existsSync(join(distDir, "_locales", locale, "messages.json")),
      `${locale} locale is missing`,
    );
  }

  const expectedIcons = { 16: 16, 32: 32, 48: 48, 128: 128 };
  for (const [key, expectedSize] of Object.entries(expectedIcons)) {
    const iconRel = manifest.icons?.[key];
    assert(typeof iconRel === "string", `icon ${key} is missing from manifest`);
    const iconPath = join(distDir, iconRel);
    assert(existsSync(iconPath), `icon file is missing: ${iconRel}`);
    const { width, height } = pngSize(iconPath);
    assert(
      width === expectedSize && height === expectedSize,
      `icon ${key} must be ${expectedSize}x${expectedSize}`,
    );
  }

  const sourceMaps = walkFiles(distDir).filter((file) => file.endsWith(".map"));
  assert(
    sourceMaps.length === 0,
    `release build contains sourcemaps: ${sourceMaps.map((f) => relative(root, f)).join(", ")}`,
  );
}

function zipDist() {
  mkdirSync(releaseDir, { recursive: true });
  rmSync(zipPath, { force: true });
  const result = spawnSync("zip", ["-qr", zipPath, ".", "-x", "*.map"], {
    cwd: distDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("zip failed. Install Info-ZIP or run on a CI image that includes zip.");
  }
}

run(pnpm, ["build"], { env: { HISTSIEVE_RELEASE: "1" } });
validateDist();
zipDist();

console.log(`Created ${relative(root, zipPath)}`);
