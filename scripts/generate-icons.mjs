/**
 * 影幕 YingMu — 品牌图标资产生成脚本
 *
 * 输入（手工 SVG 源，保留在仓库中）：
 *   assets/branding/icons/icon.svg     应用图标（含底板）
 *   assets/branding/logo-mark.svg     独立图形（纯矢量）
 *
 * 输出（派生二进制，由本脚本生成，禁止手改）：
 *   assets/branding/png/icon-{16..1024}.png
 *   assets/branding/icons/yingmu.ico
 *   apps/desktop/public/favicon.ico / logo-mark.svg
 *   apps/desktop/src-tauri/icons/{icon.ico, icon.png, 32x32.png, 128x128.png, 128x128@2x.png}
 *
 * 用法：npm run brand:icons
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_SVG = resolve(ROOT, 'assets/branding/icons/icon.svg');
const MARK_SVG = resolve(ROOT, 'assets/branding/logo-mark.svg');
const PNG_DIR = resolve(ROOT, 'assets/branding/png');
const TAURI_ICONS = resolve(ROOT, 'apps/desktop/src-tauri/icons');
const PUBLIC_DIR = resolve(ROOT, 'apps/desktop/public');

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
}

/** 用矢量密度渲染，避免大尺寸位图由小图插值放大导致模糊 */
async function renderPng(svgBuffer, size) {
  const density = Math.max(72, Math.ceil((72 * size) / 256));
  return sharp(svgBuffer, { density })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** 组装 PNG-in-ICO（Windows Vista+ 支持 256px PNG 条目） */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const directory = [];
  const imageData = [];

  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    const dimension = size >= 256 ? 0 : size;
    dir.writeUInt8(dimension, 0);
    dir.writeUInt8(dimension, 1);
    dir.writeUInt8(0, 2); // palette colors
    dir.writeUInt8(0, 3); // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    directory.push(dir);
    imageData.push(png);
  }

  return Buffer.concat([header, ...directory, ...imageData]);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  ensure(PNG_DIR);
  ensure(TAURI_ICONS);
  ensure(PUBLIC_DIR);

  const iconSvg = readFileSync(ICON_SVG);
  const pngBySize = new Map();

  for (const size of PNG_SIZES) {
    const png = await renderPng(iconSvg, size);
    pngBySize.set(size, png);
    const out = resolve(PNG_DIR, `icon-${size}.png`);
    writeFileSync(out, png);
    console.log(`PNG  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB  -> assets/branding/png/icon-${size}.png`);
  }

  const icoEntries = ICO_SIZES.map((size) => ({ size, png: pngBySize.get(size) }));
  const ico = buildIco(icoEntries);
  writeFileSync(resolve(ROOT, 'assets/branding/icons/yingmu.ico'), ico);
  writeFileSync(resolve(TAURI_ICONS, 'icon.ico'), ico);
  writeFileSync(resolve(PUBLIC_DIR, 'favicon.ico'), ico);
  console.log(`ICO  ${icoEntries.length} entries  ${(ico.length / 1024).toFixed(1)} KB  SHA-256 ${sha256(ico).slice(0, 16)}…`);

  // Tauri 打包所需的 PNG 图标集合
  writeFileSync(resolve(TAURI_ICONS, 'icon.png'), pngBySize.get(512));
  writeFileSync(resolve(TAURI_ICONS, '32x32.png'), pngBySize.get(32));
  writeFileSync(resolve(TAURI_ICONS, '128x128.png'), pngBySize.get(128));
  writeFileSync(resolve(TAURI_ICONS, '128x128@2x.png'), pngBySize.get(256));
  copyFileSync(MARK_SVG, resolve(PUBLIC_DIR, 'logo-mark.svg'));

  console.log('\n图标生成完成。SVG 源文件仍位于 assets/branding/，二进制为派生产物。');
}

main().catch((error) => {
  console.error('图标生成失败：', error);
  process.exitCode = 1;
});
