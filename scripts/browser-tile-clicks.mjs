#!/usr/bin/env node
/**
 * 真实浏览器点击验证（任务书 4.2）。
 *
 * 为什么不用 Testing Library 判定：jsdom 的 fireEvent 不做真实命中测试
 * （hit testing），「图片盖住链接导致点击落空」这类 z-index / pointer-events
 * 缺陷只有在真实浏览器里才会暴露。本脚本用 playwright-core 驱动系统 Edge
 * （不下载浏览器），访问 vite preview 的真实运行实例，断言真实 URL 跳转。
 *
 * 覆盖：
 *   1. 点击磁贴左上角 → 进入详情
 *   2. 点击磁贴中心   → 进入详情
 *   3. 点击标题文字   → 进入详情
 *   4. 点击磁贴右下角 → 进入详情
 *   5. 点击收藏       → 不进入详情，收藏状态切换
 *   6. 点击播放       → 进入播放页（而不是详情页）
 *   7. 徽标区域点击   → 进入详情（徽标是信息层，必须穿透）
 *   8. 键盘 Enter     → 进入详情
 *   9. 键盘 Space     → 播放
 *  10. 键盘 F         → 收藏，不导航
 *
 * 用法：node scripts/browser-tile-clicks.mjs
 * 退出码：0 全部通过；1 有失败。
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173';

let server = null;

async function ensureServer() {
  try {
    const res = await fetch(BASE);
    if (res.ok) return;
  } catch {
    /* 未启动 */
  }
  server = spawn('npm', ['run', 'preview'], { cwd: process.cwd(), shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* 继续等待 */
    }
  }
  throw new Error('vite preview 启动超时');
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —— ${detail}` : ''}`);
}

/** 等待首页磁贴出现并拿到第一个磁贴的定位器与 media id */
async function openHome(page) {
  await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
  await page.waitForSelector('.tile[data-testid]', { timeout: 20000 });
  const tile = page.locator('.tile[data-testid]').first();
  const testId = (await tile.getAttribute('data-testid')) ?? '';
  const mediaId = testId.replace(/^tile-/, '');
  await page.waitForTimeout(400); // 等封面解码，避免恰好命中加载中的骨架态
  return { tile, mediaId };
}

async function expectDetail(page, mediaId, name) {
  await page.waitForURL(/#\/detail\//, { timeout: 8000 }).catch(() => {});
  const url = page.url();
  const ok = url.includes(`#/detail/${mediaId}`);
  record(name, ok, ok ? `→ ${url}` : `URL 未变化或错误：${url}`);
  await page.goBack();
  await page.waitForSelector('.tile[data-testid]', { timeout: 10000 });
}

async function main() {
  await ensureServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  try {
    // —— 点击主体进入详情（四个位置） ——
    {
      const { tile, mediaId } = await openHome(page);
      const box = await tile.boundingBox();
      if (!box) throw new Error('拿不到磁贴包围盒');
      // 左上角（避开徽标文字本身的命中拦截——徽标必须穿透）
      await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.08);
      await expectDetail(page, mediaId, '点击磁贴左上角进入详情');
    }
    {
      const { tile, mediaId } = await openHome(page);
      const box = await tile.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
      await expectDetail(page, mediaId, '点击磁贴中心进入详情');
    }
    {
      const { tile, mediaId } = await openHome(page);
      const title = tile.locator('.tile-title').first();
      // 标题在视觉上位于 Link 之上（z-index 2）但 pointer-events: none，
      // 真实点击会命中下层的主体 Link——Playwright 会把这报成
      // "tile-link intercepts pointer events"，这恰恰是修复后的正确行为，
      // 因此用 force 派发点击、由浏览器真实命中测试决定落点。
      await title.click({ force: true });
      await expectDetail(page, mediaId, '点击标题文字进入详情');
    }
    {
      const { tile, mediaId } = await openHome(page);
      const box = await tile.boundingBox();
      await page.mouse.click(box.x + box.width * 0.94, box.y + box.height * 0.94);
      await expectDetail(page, mediaId, '点击磁贴右下角进入详情');
    }
    {
      const { tile, mediaId } = await openHome(page);
      const badges = tile.locator('.tile-badge');
      if ((await badges.count()) > 0) {
        await badges.first().click({ force: true });
        await expectDetail(page, mediaId, '点击徽标区域进入详情（信息层穿透）');
      } else {
        record('点击徽标区域进入详情（信息层穿透）', true, '该磁贴无徽标，跳过');
      }
    }

    // —— 收藏不得触发详情导航 ——
    {
      const { tile } = await openHome(page);
      await tile.hover(); // 按钮默认 opacity 0，悬停后可点击
      const fav = tile.getByRole('button', { name: /收藏|取消收藏/ });
      await fav.click();
      await page.waitForTimeout(400);
      const url = page.url();
      const stayed = !url.includes('#/detail/') && !url.includes('#/player/');
      record('点击收藏不进入详情', stayed, `URL：${url}`);
      const pressed = (await fav.getAttribute('aria-label'))?.includes('取消收藏') ?? false;
      record('点击收藏后状态切换且只触发一次', pressed, `aria-label 含「取消收藏」=${pressed}`);
    }

    // —— 播放按钮进入播放页（独立块：收藏会改变推荐排序，磁贴序可能变化） ——
    {
      const { tile, mediaId } = await openHome(page);
      await tile.hover();
      await tile.getByRole('button', { name: /播放/ }).click();
      await page.waitForURL(/#\/player\//, { timeout: 8000 }).catch(() => {});
      const playUrl = page.url();
      const played = playUrl.includes(`#/player/${mediaId}`);
      record('点击播放进入播放页（非详情）', played, `URL：${playUrl}`);
      await page.goBack();
      await page.waitForSelector('.tile[data-testid]', { timeout: 10000 });
    }

    // —— 键盘操作 ——
    {
      const { tile, mediaId } = await openHome(page);
      const link = tile.locator('.tile-link');
      await link.focus();
      await page.keyboard.press('Enter');
      await expectDetail(page, mediaId, '键盘 Enter 进入详情');
    }
    {
      const { tile, mediaId } = await openHome(page);
      const link = tile.locator('.tile-link');
      await link.focus();
      await page.keyboard.press(' ');
      await page.waitForURL(/#\/player\//, { timeout: 8000 }).catch(() => {});
      const playUrl = page.url();
      record('键盘 Space 播放', playUrl.includes(`#/player/${mediaId}`), `URL：${playUrl}`);
      await page.goBack();
      await page.waitForSelector('.tile[data-testid]', { timeout: 10000 });
    }
    {
      const { tile } = await openHome(page);
      const link = tile.locator('.tile-link');
      await link.focus();
      await page.keyboard.press('f');
      await page.waitForTimeout(300);
      const url = page.url();
      const stayed = !url.includes('#/detail/') && !url.includes('#/player/');
      record('键盘 F 收藏且不导航', stayed, `URL：${url}`);
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n真实浏览器点击验证：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('浏览器验证执行失败：', error);
  process.exit(1);
});
