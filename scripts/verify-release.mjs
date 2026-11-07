#!/usr/bin/env node
/**
 * 影幕 YingMu — 安装包发布校验
 *
 * 校验一个 Windows NSIS 安装包是否「存在、非空、是 PE 文件」，并输出 SHA-256。
 * 供 CI / Release 工作流在上传产物前作为强制闸门调用，也可在本机单独使用。
 *
 * 用法：
 *   node scripts/verify-release.mjs <安装包路径>
 *   node scripts/verify-release.mjs <安装包路径> --sums <SHA256SUMS.txt 路径>
 *   node scripts/verify-release.mjs --help
 *
 * 检查项：
 *   1. 文件存在且为普通文件
 *   2. 体积严格大于 1MB（1024*1024 bytes）
 *   3. 文件头两字节为 MZ（PE 可执行文件）
 *   4. 计算并输出 SHA-256
 *
 * 退出码：0 = 校验通过；1 = 校验失败，禁止发布；2 = 参数错误。
 * 使用 --sums 时，在校验通过后写出标准 sha256sum 格式的一行：
 *   <hex>  <文件名>
 */

import { existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const MIN_SIZE = 1024 * 1024; // 1MB

function usage() {
  console.log('用法: node scripts/verify-release.mjs <安装包路径> [--sums <校验和输出文件>]');
  console.log('      node scripts/verify-release.mjs --help');
}

function fail(msg) {
  console.error('--------------------------------------------');
  console.error('校验失败: ' + msg);
  console.error('结果: 安装包未通过校验，禁止发布（退出码 1）。');
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return 0;
  }

  let sumsFile = null;
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--sums') {
      sumsFile = args[i + 1];
      i += 1;
      if (!sumsFile || sumsFile.startsWith('--')) {
        console.error('参数错误: --sums 缺少输出文件路径');
        return 2;
      }
    } else if (a.startsWith('--')) {
      console.error('参数错误: 未知参数 ' + a);
      usage();
      return 2;
    } else {
      positional.push(a);
    }
  }

  if (positional.length !== 1) {
    console.error('参数错误: 必须且只能传入一个安装包路径');
    usage();
    return 2;
  }
  const target = positional[0];

  console.log('=== 影幕 YingMu · 安装包发布校验 ===');
  console.log('目标文件 : ' + target);

  // 1) 存在且为普通文件
  if (!existsSync(target)) return fail('文件不存在: ' + target);
  const st = statSync(target);
  if (!st.isFile()) return fail('目标不是普通文件: ' + target);

  // 2) 体积 > 1MB
  const size = st.size;
  if (size <= MIN_SIZE) {
    return fail('体积 ' + size + ' bytes，未超过 1MB（' + MIN_SIZE + ' bytes）');
  }

  // 3) PE 头 MZ
  const buf = readFileSync(target);
  if (buf.length < 2 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
    return fail('缺少 PE/MZ 文件头（前两字节不是 MZ）');
  }

  // 4) SHA-256
  const hex = createHash('sha256').update(buf).digest('hex');

  console.log('体积     : ' + size + ' bytes (> 1MB)');
  console.log('PE 头    : MZ (有效)');
  console.log('SHA-256  : ' + hex);

  if (sumsFile) {
    const line = hex + '  ' + basename(target) + '\n';
    writeFileSync(sumsFile, line, 'utf8');
    console.log('校验和已写入 : ' + sumsFile);
    process.stdout.write(line);
  }

  console.log('--------------------------------------------');
  console.log('结果: 校验通过，安装包可用于发布（退出码 0）。');
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error('校验运行失败: ' + (err && err.message ? err.message : String(err)));
  process.exitCode = 1;
}
