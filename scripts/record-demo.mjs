#!/usr/bin/env node

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import {
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { basename, join, resolve } from 'path';

const DEMO_DIR = resolve('demos');
const APP_URL = process.env.RECORD_DEMO_URL || 'http://localhost:3000';
const VIDEO_BASENAME = 'test-pipeline-autopilot';
const READY_TIMEOUT_MS = 120000;
// Full end-to-end timeout: chat clarification + plan generation + project-page autopilot
const FLOW_TIMEOUT_MS = 900000;
const ACTION_HOLD_MS = 2000;

// CSS injected into every page to hide all scrollbars (for clean video)
const HIDE_SCROLLBARS_CSS = `
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
  * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
`;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url, options = {}, retries = 4, retryDelayMs = 2500) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const data = await response.json().catch(() => null);
      return { response, data };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(retryDelayMs);
    }
  }
  throw lastError || new Error(`Request failed for ${url}`);
}

function resetDemoDir() {
  rmSync(DEMO_DIR, { recursive: true, force: true });
  mkdirSync(DEMO_DIR, { recursive: true });
}

async function waitForAppReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(APP_URL, { redirect: 'manual' });
      if (response.ok || response.status === 307 || response.status === 308) return;
    } catch { /* retry */ }
    await delay(2000);
  }
  throw new Error(`App not reachable at ${APP_URL} within ${READY_TIMEOUT_MS}ms`);
}

async function createProject() {
  const name = `init-ai Demo ${new Date().toISOString().slice(0, 10)}`;
  const description = 'AI-assisted project planner — autopilot demo recording.';
  const { response, data } = await fetchJsonWithRetry(
    `${APP_URL}/api/projects`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    }
  );
  if (!response.ok || !data?.project?.id) {
    throw new Error(`Failed to create project: ${data?.error || response.status}`);
  }
  return { projectId: data.project.id, name: data.project.name };
}

// Full-page screenshot — captures all content regardless of scroll position.
// Used for every screenshot EXCEPT the chat-complete capture (which lives inside
// a Radix ScrollArea that fullPage cannot reach beyond the viewport).
async function screenshotFull(page, filename) {
  await page.screenshot({ path: join(DEMO_DIR, filename), fullPage: true });
}

// Capture full content directly to avoid sticky-header blink/flicker in video.
async function captureFullContent(page, filename) {
  await screenshotFull(page, filename);
  await delay(400);
}

// /new page uses a Radix ScrollArea and h-screen layout. For one complete chat
// image, temporarily expand those containers so fullPage includes all messages.
async function captureChatCompleteFull(page, filename) {
  await page.evaluate(() => {
    const edits = [];
    const setStyle = (el, prop, value) => {
      edits.push([el, prop, el.style[prop]]);
      el.style[prop] = value;
    };

    const hScreenNodes = Array.from(document.querySelectorAll('.h-screen'));
    for (const el of hScreenNodes) {
      setStyle(el, 'height', 'auto');
      setStyle(el, 'minHeight', 'auto');
      setStyle(el, 'overflow', 'visible');
    }

    const root = document.querySelector('[data-radix-scroll-area-root]');
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    if (root) {
      setStyle(root, 'height', 'auto');
      setStyle(root, 'maxHeight', 'none');
      setStyle(root, 'overflow', 'visible');
    }
    if (viewport) {
      setStyle(viewport, 'height', 'auto');
      setStyle(viewport, 'maxHeight', 'none');
      setStyle(viewport, 'overflow', 'visible');
    }

    window.__demoCaptureStyleEdits = edits;
  });

  await delay(250);
  await screenshotFull(page, filename);

  await page.evaluate(() => {
    const edits = window.__demoCaptureStyleEdits || [];
    for (let i = edits.length - 1; i >= 0; i -= 1) {
      const [el, prop, prev] = edits[i];
      if (el && el.style) {
        el.style[prop] = prev || '';
      }
    }
    window.__demoCaptureStyleEdits = [];
  });
  await delay(250);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function clickTopTab(page, labelRegex) {
  await delay(500);
  await page.getByRole('tab', { name: labelRegex }).first().click();
  await delay(ACTION_HOLD_MS + 600);
}

// Click every plan section tab, smooth-scroll each one, screenshot all
async function captureAllPlanSections(page, screenshots) {
  const tabList = page.locator('[role="tablist"]').nth(1);
  await tabList.waitFor({ state: 'visible', timeout: 15000 });
  const sectionTabs = tabList.locator('[role="tab"]');
  const tabCount = await sectionTabs.count();

  for (let i = 0; i < tabCount; i += 1) {
    const tab = sectionTabs.nth(i);
    const label = (await tab.textContent())?.trim() || `section-${i + 1}`;
    await tab.click();
    await delay(ACTION_HOLD_MS);
    await captureFullContent(page, `plan-${i + 1}-${slugify(label)}.png`);
    screenshots.push(`plan-${i + 1}-${slugify(label)}.png`);
  }
}

async function convertVideoToGif(inputPath, outputPath) {
  return new Promise((resolveGif) => {
    const ffmpeg = spawn(
      'ffmpeg',
      ['-y', '-i', inputPath, '-vf', 'fps=10,scale=1280:-1', '-loop', '0', outputPath],
      { stdio: 'ignore' }
    );
    ffmpeg.on('close', (code) => resolveGif(code === 0));
    ffmpeg.on('error', () => resolveGif(false));
  });
}

function persistVideo(sourcePath, targetPath) {
  try {
    renameSync(sourcePath, targetPath);
  } catch {
    copyFileSync(sourcePath, targetPath);
  }
}

function writeReport({ projectName, mediaFile, screenshots, exportFile }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>init-ai Test Pipeline Recording</title>
  <style>
    body {
      margin: 0;
      font-family: "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 32px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    .panel {
      background: #111827;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }
    h1, h2 { margin-top: 0; }
    video, img { width: 100%; border-radius: 12px; border: 1px solid #334155; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    a { color: #67e8f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="panel">
      <h1>init-ai test pipeline recording</h1>
      <p>Project: ${projectName}</p>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <p>Export artifact: <a href="${exportFile}">${exportFile}</a></p>
    </div>
    <div class="panel">
      <h2>Video</h2>
      ${mediaFile.endsWith('.gif') ? `<img src="${mediaFile}" alt="Recorder demo">` : `<video controls src="${mediaFile}"></video>`}
    </div>
    <div class="panel">
      <h2>Screenshots</h2>
      <div class="grid">
        ${screenshots.map((f) => `<div><img src="${f}" alt="${f}"><p>${f}</p></div>`).join('\n        ')}
      </div>
    </div>
  </div>
</body>
</html>`;
  writeFileSync(join(DEMO_DIR, 'report.html'), html);
}

async function recordDemo() {
  resetDemoDir();
  console.log(`Waiting for app at ${APP_URL} ...`);
  await waitForAppReady();

  console.log('Creating project ...');
  const { projectId, name } = await createProject();

  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
    args: ['--mute-audio', '--start-maximized'],
  });
  const context = await browser.newContext({
    viewport: null,
    recordVideo: { dir: DEMO_DIR, size: { width: 1920, height: 1080 } },
    acceptDownloads: true,
  });

  // Inject scrollbar-hiding CSS before any page content loads
  await context.addInitScript((css) => {
    const inject = () => {
      if (document.getElementById('__demo-hide-scrollbars')) return;
      const s = document.createElement('style');
      s.id = '__demo-hide-scrollbars';
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', inject)
      : inject();
  }, HIDE_SCROLLBARS_CSS);

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const screenshots = [];
  const exportFile = 'autopilot-export.zip';
  let rawVideoPath = null;
  let mediaFile = `${VIDEO_BASENAME}.webm`;

  try {
    // ── 1. Interactive chat on /new (real autopilot: Q&A + option selection) ─
    console.log('Starting interactive chat autopilot on /new ...');
    await page.goto(`${APP_URL}/new?projectId=${projectId}&testMode=true`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for the chat phase to reach the "ready to generate" state.
    // In testMode this can quickly redirect, so we race between button visibility
    // and project-page URL navigation.
    console.log('Waiting for chat phase completion ...');
    let chatCaptured = false;

    await Promise.race([
      (async () => {
        await page.getByRole('button', { name: /Generate Plan/i }).waitFor({
          state: 'visible',
          timeout: FLOW_TIMEOUT_MS,
        });
        await delay(300);
        // Single complete chat screenshot with full conversation content.
        await captureChatCompleteFull(page, 'proj-chat-complete.png');
        screenshots.push('proj-chat-complete.png');
        chatCaptured = true;
      })(),
      page.waitForURL(`**/project/${projectId}**`, { timeout: FLOW_TIMEOUT_MS }),
    ]);

    // If redirect won the race before we captured chat, retry quickly if still on /new.
    if (!chatCaptured && page.url().includes('/new')) {
      const canCapture = await page
        .getByRole('button', { name: /Generate Plan/i })
        .isVisible()
        .catch(() => false);
      if (canCapture) {
        await captureChatCompleteFull(page, 'proj-chat-complete.png');
        screenshots.push('proj-chat-complete.png');
        chatCaptured = true;
      }
    }

    // Ensure we are now on project page.
    console.log('Waiting for plan generation and navigation ...');
    await page.waitForURL(`**/project/${projectId}**`, { timeout: FLOW_TIMEOUT_MS });
    await delay(ACTION_HOLD_MS);

    // ── 2. Project-page autopilot (steps 5–10, no screenshots) ───────────────
    console.log('Waiting for autopilot to complete on project page ...');
    await page.getByText(/E2E Autopilot Complete/i).waitFor({
      state: 'visible',
      timeout: FLOW_TIMEOUT_MS,
    });
    await delay(ACTION_HOLD_MS);

    // ── 3. Commits tab ────────────────────────────────────────────────────────
    console.log('Capturing commits tab ...');
    await clickTopTab(page, /^📦\s*Commits/i);
    await captureFullContent(page, 'proj-commits-tab.png');
    screenshots.push('proj-commits-tab.png');

    // ── 4. Context tab ────────────────────────────────────────────────────────
    console.log('Capturing context tab ...');
    await clickTopTab(page, /^📝\s*Context/i);
    await captureFullContent(page, 'proj-context-tab.png');
    screenshots.push('proj-context-tab.png');

    // ── 5. All plan sections ──────────────────────────────────────────────────
    console.log('Switching plan sections (all) ...');
    await clickTopTab(page, /^📋\s*Plan/i);
    await captureAllPlanSections(page, screenshots);

    // ── 6. Export ZIP ─────────────────────────────────────────────────────────
    console.log('Running export ...');
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: /Export ZIP/i }).click();
    const download = await downloadPromise;
    await download.saveAs(join(DEMO_DIR, exportFile));
    await delay(ACTION_HOLD_MS);

    // ── 7. Dashboard — captured last so plan is visible on the project card ───
    console.log('Capturing dashboard (post plan generation) ...');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await delay(ACTION_HOLD_MS);
    await captureFullContent(page, '01-dashboard.png');
    screenshots.push('01-dashboard.png');
  } finally {
    const video = page.video();
    if (video) rawVideoPath = await video.path();

    await page.close();
    await context.close();
    await browser.close();

    if (rawVideoPath) {
      const finalVideoPath = join(DEMO_DIR, `${VIDEO_BASENAME}.webm`);
      persistVideo(rawVideoPath, finalVideoPath);
      const gifPath = join(DEMO_DIR, `${VIDEO_BASENAME}.gif`);
      const gifCreated = await convertVideoToGif(finalVideoPath, gifPath);
      mediaFile = gifCreated ? basename(gifPath) : basename(finalVideoPath);
    }
  }

  writeReport({ projectName: name, mediaFile, screenshots, exportFile });
  console.log('Recording complete. Files saved to demos/.');
  console.log(`Main media: ${mediaFile}`);
}

recordDemo().catch((error) => {
  console.error(error);
  process.exit(1);
});
