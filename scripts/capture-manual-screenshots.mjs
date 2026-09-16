import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 4174;
const baseUrl = `http://127.0.0.1:${port}/manual.html`;
const outputDir = "docs/images/current-operation-guide";
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: "ignore",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for the screenshot server.");
}

async function capture(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${outputDir}/${name}.png`, fullPage: true });
}

try {
  await mkdir(outputDir, { recursive: true });
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });

  await page.goto(`${baseUrl}?view=manager`);
  await capture(page, "manager-shifts");
  for (const [tab, file] of [["勤務状況", "manager-attendance"], ["スタッフ", "manager-staff"], ["給与計算", "manager-payroll"], ["設定", "manager-settings"]]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await capture(page, file);
  }

  await page.goto(`${baseUrl}?view=staff`);
  await capture(page, "staff-portal");
  await page.goto(`${baseUrl}?view=shift-request`);
  await capture(page, "staff-shift-request");
  await page.goto(`${baseUrl}?view=shift-swap`);
  await capture(page, "staff-shift-swap");

  await page.setViewportSize({ width: 800, height: 1000 });
  await page.goto(`${baseUrl}?view=terminal`);
  await capture(page, "store-terminal");

  await browser.close();
} finally {
  server.kill("SIGTERM");
}
