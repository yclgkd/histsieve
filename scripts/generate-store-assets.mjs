import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, "store-assets", "source");
const assetDir = join(root, "store-assets");
const iconSourcePath = join(root, "src", "ui", "icons", "icon.svg");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const optionsCss = readFileSync(join(root, "src", "ui", "options", "options.css"), "utf8");
const popupCss = readFileSync(join(root, "src", "ui", "popup", "popup.css"), "utf8");

const staleSourceFiles = [
  "icon-16.svg",
  "icon-32.svg",
  "icon-48.svg",
  "icon-128.svg",
  "marquee-1400x560.svg",
  "promo-small-440x280.svg",
  "screenshot-options-1280x800.svg",
  "screenshot-popup-1280x800.svg",
  "icon.svg",
  "marquee-1400x560.html",
  "promo-small-440x280.html",
  "screenshot-options-1280x800.html",
  "screenshot-popup-1280x800.html",
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function cleanGeneratedSources() {
  ensureDir(sourceDir);
  for (const file of staleSourceFiles) {
    rmSync(join(sourceDir, file), { force: true });
  }
}

function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${path} is not a PNG file`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function assertPngSize(path, width, height) {
  const size = pngSize(path);
  if (size.width !== width || size.height !== height) {
    throw new Error(`${path} expected ${width}x${height}, got ${size.width}x${size.height}`);
  }
}

function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) return candidate;
    if (!candidate.includes("/")) {
      try {
        return execFileSync("which", [candidate], { encoding: "utf8" }).trim();
      } catch {
        // Continue trying the next candidate.
      }
    }
  }
  return null;
}

function chromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const executable = findExecutable([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ]);
  if (!executable) {
    throw new Error("Chrome is required to render store screenshots. Set CHROME_PATH if needed.");
  }
  return executable;
}

function renderSvgToPng(svgPath, width, height, outPath) {
  ensureDir(dirname(outPath));
  execFileSync(
    "sips",
    ["-s", "format", "png", "-z", String(height), String(width), svgPath, "--out", outPath],
    { stdio: "ignore" },
  );
  assertPngSize(outPath, width, height);
}

function renderHtml(name, width, height, html, outPath) {
  ensureDir(sourceDir);
  ensureDir(dirname(outPath));
  const htmlPath = join(sourceDir, `${name}.html`);
  writeFileSync(htmlPath, html);
  execFileSync(
    chromeExecutable(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
  assertPngSize(outPath, width, height);
}

function iconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="HistSieve">
  <defs>
    <linearGradient id="bg" x1="18" y1="14" x2="110" y2="116" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2f6feb"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
    <filter id="softShadow" x="-16%" y="-16%" width="132%" height="132%">
      <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0f172a" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#bg)" filter="url(#softShadow)"/>
  <circle cx="40" cy="35" r="6" fill="#bfdbfe"/>
  <circle cx="64" cy="30" r="6" fill="#bfdbfe"/>
  <circle cx="88" cy="35" r="6" fill="#bfdbfe"/>
  <path d="M34 48h60L73 73v27l-18 10V73L34 48z" fill="#ffffff"/>
  <path d="M45 58h38M51 66h27" stroke="#93c5fd" stroke-width="5" stroke-linecap="round"/>
  <path d="M82 83l13 13 24-28" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

function escapeSrcDoc(html) {
  return html.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function hiddenKeywordRow() {
  return `
          <li class="masked">
            <button
              type="button"
              class="keyword-value"
              title="Click to reveal"
              aria-label="Reveal hidden keyword"
            >
              ••••••
            </button>
          </li>`;
}

function optionsDocument({ frame = false } = {}) {
  const frameCss = frame
    ? `
      body { width: 760px; min-height: 740px; overflow: hidden; }
      .page { margin: 28px auto 36px; }
    `
    : `
      body { width: 1280px; min-height: 800px; overflow: hidden; }
      .page { margin-top: 22px; zoom: .78; }
    `;
  const keywordRows = Array.from({ length: 4 }, hiddenKeywordRow).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HistSieve Settings</title>
    <style>
${optionsCss}
${frameCss}
    </style>
  </head>
  <body>
    <main class="page">
      <header class="page__header">
        <div class="page__title">
          <h1>HistSieve Settings</h1>
          <div class="page__summary" aria-label="Active keywords">
            <span>Active keywords</span>
            <strong>4</strong>
          </div>
        </div>
        <label class="enable-toggle">
          <span class="enable-toggle__label">Enable</span>
          <span class="switch">
            <input type="checkbox" checked />
            <span class="slider"></span>
          </span>
        </label>
      </header>

      <section class="card card--cleanup">
        <div class="card__header">
          <h2>Scheduled cleanup</h2>
          <div class="cleanup-meta">
            <span class="label">Last cleanup</span>
            <span class="value">Today, 11:34</span>
          </div>
        </div>

        <label class="row">
          <input type="checkbox" checked />
          <span>Run on a schedule</span>
        </label>

        <label class="row sub">
          <span>Every</span>
          <input type="number" value="24" />
          <span>hours</span>
        </label>

        <label class="row">
          <input type="checkbox" checked />
          <span>Run when the browser starts</span>
        </label>

        <fieldset class="scope">
          <legend>History to delete</legend>
          <div class="row">
            <label class="inline-control">
              <input type="radio" name="scope" checked />
              <span>History older than</span>
            </label>
            <input type="number" value="30" />
            <span>days</span>
          </div>
          <label class="row">
            <input type="radio" name="scope" />
            <span>All browser history</span>
          </label>
        </fieldset>

        <button class="primary" type="button">Delete history older than 30 days</button>
      </section>

      <section class="card">
        <div class="card__header">
          <h2>Keyword rules</h2>
          <div class="kw-io">
            <button id="kwPrivacyToggle" type="button" class="icon-btn" aria-pressed="false">
              Show keywords
            </button>
            <button type="button" class="icon-btn">Import</button>
            <button type="button" class="icon-btn">Export</button>
          </div>
        </div>
        <p class="hint">
          When a visited URL or page title contains any active keyword, the entry is removed from
          your browser history immediately. Matching is case-insensitive.
        </p>

        <form class="kw-form">
          <input type="text" placeholder="e.g. youtube.com" />
          <button type="button" class="primary">Add</button>
        </form>
        <p class="field-error" role="status" aria-live="polite"></p>

        <ul class="kw-list" aria-label="Keyword rules">
${keywordRows}
        </ul>
      </section>

      <footer class="page__footer">
        <span class="page__footer-version">HistSieve v${pkg.version}</span>
        <span class="page__footer-sep">·</span>
        <a
          class="page__footer-link"
          href="https://github.com/yclgkd/histsieve"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.43 7.43 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8a8 8 0 0 0-8-8z"
            />
          </svg>
          <span>View on GitHub</span>
        </a>
      </footer>
    </main>
  </body>
</html>`;
}

function popupDocument() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HistSieve</title>
    <style>
${popupCss}
      body { height: 276px; overflow: hidden; }
    </style>
  </head>
  <body>
    <main class="popup">
      <header class="popup__header">
        <h1 class="popup__title">HistSieve</h1>
        <label class="enable-toggle">
          <span class="enable-toggle__label">Enable</span>
          <span class="switch">
            <input type="checkbox" checked />
            <span class="slider"></span>
          </span>
        </label>
      </header>

      <section class="popup__status">
        <div class="row">
          <span class="label">Active keywords</span>
          <span class="value">4</span>
        </div>
        <div class="row">
          <span class="label">Last cleanup</span>
          <span class="value">Today, 11:34</span>
        </div>
      </section>

      <div class="popup__actions">
        <button class="primary" type="button">Delete history older than 30 days</button>
        <button class="ghost" type="button">
          <svg class="ghost__icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M19.14 12.94a7.05 7.05 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.04 7.04 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.05 7.05 0 0 0 0 1.88L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.66.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.24.1.52 0 .66-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.04-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/>
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </main>
  </body>
</html>`;
}

function iframe(srcdoc, width, height) {
  return `<iframe width="${width}" height="${height}" srcdoc="${escapeSrcDoc(srcdoc)}" loading="eager"></iframe>`;
}

function popupScreenshotDocument() {
  const popup = iframe(popupDocument(), 320, 276);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        width: 1280px;
        height: 800px;
        margin: 0;
        overflow: hidden;
        background: #f4f7fb;
        color: #111827;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .browser {
        position: absolute;
        inset: 74px 90px 76px;
        background: #ffffff;
        border: 1px solid #d9e2ec;
        border-radius: 16px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, .09);
        overflow: hidden;
      }
      .toolbar {
        height: 58px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 20px;
        background: #ffffff;
        border-bottom: 1px solid #e5edf6;
      }
      .dot { width: 11px; height: 11px; border-radius: 999px; background: #d9e2ec; }
      .address {
        margin-left: 10px;
        flex: 1;
        height: 34px;
        border-radius: 999px;
        background: #f4f7fb;
        color: #667085;
        display: flex;
        align-items: center;
        padding: 0 18px;
        font-size: 14px;
      }
      .history {
        padding: 46px 56px;
        width: 700px;
      }
      .history h1 {
        margin: 0 0 30px;
        font-size: 34px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      .entry {
        height: 58px;
        display: grid;
        grid-template-columns: 24px 1fr;
        align-items: center;
        gap: 18px;
        border-bottom: 1px solid #edf2f7;
      }
      .entry::before {
        content: "";
        width: 18px;
        height: 18px;
        border-radius: 5px;
        background: #eef4ff;
      }
      .entry span {
        display: block;
        height: 14px;
        border-radius: 999px;
        background: #d9e2ec;
      }
      .entry strong {
        color: #111827;
        font-size: 15px;
        font-weight: 700;
      }
      .removed {
        position: relative;
        color: #667085;
      }
      .removed::after {
        content: "";
        position: absolute;
        left: 42px;
        right: 0;
        top: 50%;
        height: 3px;
        background: #c93333;
        border-radius: 999px;
      }
      .popup-frame {
        position: absolute;
        top: 132px;
        right: 132px;
        width: 320px;
        height: 276px;
        border-radius: 14px;
        overflow: hidden;
        background: #ffffff;
        box-shadow: 0 20px 48px rgba(15, 23, 42, .18);
      }
      iframe {
        display: block;
        border: 0;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <section class="browser" aria-label="Chrome history with HistSieve popup">
      <div class="toolbar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <div class="address">chrome://history</div>
      </div>
      <div class="history">
        <h1>Chrome History</h1>
        <div class="entry"><span style="width: 420px"></span></div>
        <div class="entry removed"><strong>shopping.example.com/deals</strong></div>
        <div class="entry"><span style="width: 520px"></span></div>
        <div class="entry"><span style="width: 360px"></span></div>
        <div class="entry"><span style="width: 470px"></span></div>
      </div>
      <div class="popup-frame">${popup}</div>
    </section>
  </body>
</html>`;
}

function smallPromoDocument() {
  const options = iframe(optionsDocument({ frame: true }), 760, 740);
  const logo = iconSvg();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        width: 440px;
        height: 280px;
        margin: 0;
        overflow: hidden;
        background: #f4f7fb;
        color: #111827;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .brand {
        position: absolute;
        left: 28px;
        top: 38px;
        width: 160px;
      }
      .logo {
        width: 58px;
        height: 58px;
        margin-bottom: 14px;
      }
      .logo svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
        line-height: 1;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #475467;
        font-size: 14px;
        line-height: 1.45;
      }
      .shot {
        position: absolute;
        right: -42px;
        top: 22px;
        width: 265px;
        height: 238px;
        overflow: hidden;
        border: 1px solid #d9e2ec;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 14px 34px rgba(15, 23, 42, .12);
      }
      .shot > div {
        width: 760px;
        height: 740px;
        transform: scale(.35);
        transform-origin: top left;
      }
      iframe { display: block; border: 0; }
    </style>
  </head>
  <body>
    <div class="brand">
      <div class="logo">${logo}</div>
      <h1>HistSieve</h1>
      <p>Keyword and schedule controls for local Chrome history cleanup.</p>
    </div>
    <div class="shot"><div>${options}</div></div>
  </body>
</html>`;
}

function marqueeDocument() {
  const options = iframe(optionsDocument({ frame: true }), 760, 740);
  const popup = iframe(popupDocument(), 320, 276);
  const logo = iconSvg();
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        width: 1400px;
        height: 560px;
        margin: 0;
        overflow: hidden;
        background: #f4f7fb;
        color: #111827;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .copy {
        position: absolute;
        left: 96px;
        top: 98px;
        width: 390px;
      }
      .logo {
        width: 96px;
        height: 96px;
        margin-bottom: 28px;
      }
      .logo svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      h1 {
        margin: 0 0 18px;
        font-size: 68px;
        line-height: .95;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #475467;
        font-size: 27px;
        line-height: 1.3;
      }
      .options-shot {
        position: absolute;
        top: 42px;
        right: 44px;
        width: 524px;
        height: 370px;
        overflow: hidden;
        border: 1px solid #d9e2ec;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 22px 58px rgba(15, 23, 42, .14);
      }
      .options-shot > div {
        width: 760px;
        height: 740px;
        transform: scale(.69);
        transform-origin: top left;
      }
      .popup-shot {
        position: absolute;
        right: 570px;
        bottom: 40px;
        width: 320px;
        height: 276px;
        overflow: hidden;
        border-radius: 14px;
        background: #ffffff;
        box-shadow: 0 18px 42px rgba(15, 23, 42, .18);
      }
      iframe { display: block; border: 0; }
    </style>
  </head>
  <body>
    <section class="copy">
      <div class="logo">${logo}</div>
      <h1>HistSieve</h1>
      <p>Local Chrome history cleanup<br />by keyword, schedule, or age.</p>
    </section>
    <div class="options-shot"><div>${options}</div></div>
    <div class="popup-shot">${popup}</div>
  </body>
</html>`;
}

function writeIconSource() {
  const svg = iconSvg();
  ensureDir(dirname(iconSourcePath));
  ensureDir(sourceDir);
  writeFileSync(iconSourcePath, svg);
  writeFileSync(join(sourceDir, "icon.svg"), svg);
}

cleanGeneratedSources();
writeIconSource();

for (const size of [16, 32, 48, 128]) {
  renderSvgToPng(iconSourcePath, size, size, join(root, "src", "ui", "icons", `icon${size}.png`));
}

renderHtml(
  "promo-small-440x280",
  440,
  280,
  smallPromoDocument(),
  join(assetDir, "promo-small-440x280.png"),
);
renderHtml(
  "screenshot-options-1280x800",
  1280,
  800,
  optionsDocument(),
  join(assetDir, "screenshot-options-1280x800.png"),
);
renderHtml(
  "screenshot-popup-1280x800",
  1280,
  800,
  popupScreenshotDocument(),
  join(assetDir, "screenshot-popup-1280x800.png"),
);
renderHtml(
  "marquee-1400x560",
  1400,
  560,
  marqueeDocument(),
  join(assetDir, "marquee-1400x560.png"),
);

console.log("Store assets generated.");
