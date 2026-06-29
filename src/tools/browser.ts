import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";

// Lazily-launched singleton headless browser shared by all browser_* tools.
let _browser: any = null;
let _page: any = null;

async function getPage(): Promise<any> {
  if (_page) return _page;
  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Playwright is not installed. Run `npm install`, then `npx playwright install chromium`.",
    );
  }
  _browser = await chromium.launch({ headless: true });
  _page = await _browser.newPage();
  return _page;
}

/** Close the shared browser (called on shutdown). */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    _page = null;
  }
}

async function shotPath(ctx: ToolContext): Promise<string> {
  const dir = path.resolve(ctx.workspace, ".noticode", "captures");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `page-${Date.now()}.png`);
}

export const browserNavigate: NotiTool = {
  name: "browser_navigate",
  description:
    "Open a URL in a headless browser and return the page title, final URL, and a text snapshot of the page.",
  schema: z.object({
    url: z.string().describe("The URL to open."),
    wait_ms: z.number().int().optional().describe("Extra wait after load, in ms."),
  }),
  handler: async (args, ctx) => {
    const page = await getPage();
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (args.wait_ms) await page.waitForTimeout(args.wait_ms);
    const title = await page.title();
    const text = (await page.evaluate(() => document.body?.innerText || "")) as string;
    return `Title: ${title}\nURL: ${page.url()}\n\n${text.slice(0, Math.max(0, ctx.maxOutputChars - 200))}`;
  },
};

export const browserClick: NotiTool = {
  name: "browser_click",
  description: "Click the first element matching a CSS selector on the current page.",
  schema: z.object({
    selector: z.string().describe("CSS selector to click."),
    timeout_ms: z.number().int().optional(),
  }),
  handler: async (args) => {
    const page = await getPage();
    await page.click(args.selector, { timeout: args.timeout_ms ?? 15000 });
    return `Clicked ${args.selector}. Now at ${page.url()}.`;
  },
};

export const browserType: NotiTool = {
  name: "browser_type",
  description: "Type text into the first element matching a CSS selector (e.g. a search box or form field).",
  schema: z.object({
    selector: z.string().describe("CSS selector of the input."),
    text: z.string().describe("Text to type."),
    submit: z.boolean().optional().describe("Press Enter after typing."),
  }),
  handler: async (args) => {
    const page = await getPage();
    await page.fill(args.selector, args.text);
    if (args.submit) await page.press(args.selector, "Enter");
    return `Typed into ${args.selector}${args.submit ? " and submitted" : ""}.`;
  },
};

export const browserEval: NotiTool = {
  name: "browser_eval",
  description:
    "Evaluate a JavaScript expression in the page context and return the result as JSON. Use for scraping or reading DOM values.",
  schema: z.object({
    expression: z.string().describe("A JS expression, e.g. document.title or [...document.querySelectorAll('a')].map(a=>a.href)."),
  }),
  handler: async (args, ctx) => {
    const page = await getPage();
    const result = await page.evaluate((expr: string) => {
      // eslint-disable-next-line no-eval
      const out = eval(expr);
      return out;
    }, args.expression);
    return JSON.stringify(result, null, 2).slice(0, ctx.maxOutputChars);
  },
};

export const browserScreenshot: NotiTool = {
  name: "browser_screenshot",
  description:
    "Take a screenshot of the current browser page and save it as a PNG. Returns the file path (send it with tg_send_photo).",
  schema: z.object({
    full_page: z.boolean().optional().describe("Capture the full scrollable page (default: viewport only)."),
  }),
  handler: async (args, ctx) => {
    const page = await getPage();
    const file = await shotPath(ctx);
    await page.screenshot({ path: file, fullPage: args.full_page ?? false });
    return file;
  },
};
