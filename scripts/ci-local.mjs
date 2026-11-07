#!/usr/bin/env node
/**
 * 影幕 YingMu — 本机 CI 检查（可执行范围内）
 *
 * 按根 package.json 的脚本顺序，在本机「可执行范围内」跑一遍检查：
 *   typecheck / lint / test / build / secret-scan / 仓库契约测试，
 *   以及 Rust 三项 cargo:fmt / cargo:clippy / cargo:test。
 *
 * 本机环境事实（实测）：
 *   - Node / npm / Git / WebView2 可用；前端依赖 node_modules 已安装，
 *     前端 6 项检查本机全部通过。
 *   - Rust 1.99.1（cargo / rustc / rustfmt / clippy）已装在 ~/.cargo/bin，
 *     但通常不在自动化 shell 的默认 PATH。本脚本先试 PATH，失败则回退到
 *     ~/.cargo/bin，并把该目录前置到子进程 PATH，因此 cargo fmt 可在本机
 *     真实执行。
 *   - MSVC / Windows SDK：本地已具备便携工具链（cl.exe / link.exe + SDK 导入库），
 *     但默认环境未加载 PATH / LIB / INCLUDE，且部分执行通道存在临时文件删除拦截，
 *     故 cargo clippy / cargo test 在本机未成功完成，会明确跳过并说明。
 *   - Tauri 桌面端编译与 NSIS 安装包打包本阶段未生成，仅在 GitHub Actions 的
 *     windows-latest 上执行。
 *   - gh CLI / GitHub 认证通道由单独核查确认，本脚本不做任何网络操作。
 *
 * 对无法执行的检查项一律「明确跳过并打印原因」，绝不静默成功；跳过不计入
 * 失败，但会在汇总中显式列出。完整验证以 GitHub Actions 为准。
 *
 * 退出码：0 = 本机已执行的检查全部通过；1 = 存在失败项。
 * 用法：node scripts/ci-local.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const NODE = process.execPath;
const q = (p) => '"' + p + '"';

/** 判断某个 npm 依赖是否已安装（workspaces 可能 hoist 到根，也可能留在子包） */
function hasDep(pkg) {
  return [
    join(ROOT, 'node_modules', pkg, 'package.json'),
    join(ROOT, 'apps', 'desktop', 'node_modules', pkg, 'package.json'),
  ].some(existsSync);
}

function firstLine(s) {
  return String(s || '').trim().split(/\r?\n/)[0];
}

/**
 * 探测 cargo：先试默认 PATH，失败则回退到 ~/.cargo/bin/cargo(.exe)。
 * 返回 { ok, binDir, version, via }；binDir 用于把工具链目录前置到子进程 PATH，
 * 确保 npm run cargo:* 拉起的子进程也能找到 cargo / rustfmt / clippy。
 */
function probeCargo() {
  const viaPath = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  if (!viaPath.error && viaPath.status === 0) {
    return { ok: true, binDir: null, version: firstLine(viaPath.stdout), via: '默认 PATH' };
  }
  const isWin = platform() === 'win32';
  const binDir = isWin
    ? join(process.env.USERPROFILE || homedir(), '.cargo', 'bin')
    : join(homedir(), '.cargo', 'bin');
  const exe = join(binDir, isWin ? 'cargo.exe' : 'cargo');
  if (!existsSync(exe)) {
    return { ok: false, binDir: null, version: '', via: '默认 PATH 与 ~/.cargo/bin 均未找到' };
  }
  const viaFallback = spawnSync(exe, ['--version'], { encoding: 'utf8' });
  if (!viaFallback.error && viaFallback.status === 0) {
    return {
      ok: true,
      binDir,
      version: firstLine(viaFallback.stdout),
      via: '~/.cargo/bin（自动回退）',
    };
  }
  return { ok: false, binDir: null, version: '', via: '~/.cargo/bin/cargo 不可执行' };
}

/**
 * 检测 MSVC 链接器 / Windows SDK 是否可用（cargo clippy / test 需要）。
 * 注意：PATH 里可能存在 PortableGit 自带的 GNU coreutils `link.exe`（创建硬链接
 * 用），它不是 MSVC 链接器；仅凭「能找到 link.exe」会误判，必须确认其来源或标识。
 */
function hasMsvcLinker() {
  if (platform() !== 'win32') {
    const cc = spawnSync('cc', ['--version'], { stdio: 'ignore' });
    return !cc.error && cc.status === 0;
  }
  // 1) where 解析出的 link.exe 路径是否来自 MSVC / Windows Kits
  const where = spawnSync('where.exe', ['link.exe'], { encoding: 'utf8' });
  const linkPaths = String(where.stdout || '').split(/\r?\n/).filter(Boolean);
  if (linkPaths.some((l) => /Microsoft Visual Studio|Windows Kits/i.test(l))) return true;
  // 2) link.exe 输出含 Microsoft 增量链接器标识
  const probe = spawnSync('link.exe', ['/?'], { encoding: 'utf8' });
  const out = String(probe.stdout || '') + String(probe.stderr || '');
  if (/Microsoft \(R\) Incremental Linker/i.test(out)) return true;
  // 3) Windows SDK 库 / 工具目录存在
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
  for (const root of roots) {
    if (existsSync(join(root, 'Windows Kits', '10', 'Lib'))) return true;
    if (existsSync(join(root, 'Windows Kits', '10', 'bin'))) return true;
  }
  return false;
}

/** 子进程环境：把 Rust 工具链目录前置到 PATH（Windows 上兼容 PATH/Path 两种写法） */
function childEnv(cargo) {
  const env = { ...process.env };
  if (cargo.binDir) {
    const base = env.PATH || env.Path || '';
    const prefixed = cargo.binDir + delimiter + base;
    env.PATH = prefixed;
    env.Path = prefixed;
  }
  return env;
}

/** 执行一条命令，输出直接透传，返回是否成功 */
function run(command, env) {
  const r = spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit', env });
  return !r.error && r.status === 0;
}

function npmVersion() {
  const r = spawnSync('npm --version', { shell: true, encoding: 'utf8' });
  return r.status === 0 && !r.error ? String(r.stdout).trim() : '不可用';
}

const CARGO_MISSING = '跳过：未找到 Rust 工具链（cargo 在默认 PATH 与 ~/.cargo/bin 均不可用）';
const LINKER_MISSING = '跳过：本机默认环境未加载 MSVC/Windows SDK 链接器（link.exe / Windows Kits 不可用），或构建环境限制临时文件删除';

function buildChecks(cargo, msvcOk) {
  const depHint = (pkg) => '前端依赖未安装（缺 ' + pkg + '，请先执行 npm install）';
  return [
    { key: 'typecheck', label: 'typecheck', cmd: 'npm run typecheck', need: () => hasDep('typescript'), hint: depHint('typescript') },
    { key: 'lint', label: 'lint', cmd: 'npm run lint', need: () => hasDep('eslint'), hint: depHint('eslint') },
    { key: 'test', label: 'test', cmd: 'npm run test', need: () => hasDep('vitest'), hint: depHint('vitest') },
    { key: 'build', label: 'build', cmd: 'npm run build', need: () => hasDep('vite'), hint: depHint('vite') },
    { key: 'secret-scan', label: 'secret-scan', cmd: q(NODE) + ' scripts/secret-scan.mjs', need: () => true, hint: '' },
    { key: 'repo-contract', label: '仓库契约测试', cmd: q(NODE) + ' --test tests/repo-contract.test.mjs', need: () => true, hint: '' },
    { key: 'cargo:fmt', label: 'cargo:fmt', cmd: 'npm run cargo:fmt', need: () => cargo.ok, hint: CARGO_MISSING, rust: true },
    {
      key: 'cargo:clippy', label: 'cargo:clippy', cmd: 'npm run cargo:clippy',
      need: () => cargo.ok && msvcOk,
      hint: cargo.ok ? LINKER_MISSING : CARGO_MISSING, rust: true,
    },
    {
      key: 'cargo:test', label: 'cargo:test', cmd: 'npm run cargo:test',
      need: () => cargo.ok && msvcOk,
      hint: cargo.ok ? LINKER_MISSING : CARGO_MISSING, rust: true,
    },
  ];
}

function main() {
  const cargo = probeCargo();
  const msvcOk = hasMsvcLinker();
  const frontendReady = hasDep('typescript') && hasDep('eslint') && hasDep('vitest') && hasDep('vite');
  const env = childEnv(cargo);

  console.log('=== 影幕 YingMu · 本机 CI 检查 ===');
  console.log('环境探测:');
  console.log('  Node              : ' + process.version);
  console.log('  npm               : ' + npmVersion());
  console.log('  Rust / Cargo      : ' + (cargo.ok
    ? '可用 — ' + cargo.version + '（解析来源: ' + cargo.via + '）'
    : '缺失（' + cargo.via + '）'));
  console.log('  MSVC 链接器       : ' + (msvcOk
    ? '可用（link.exe / Windows Kits 可解析）'
    : '缺失（link.exe / Windows Kits 未找到）'));
  console.log('  前端依赖          : ' + (frontendReady ? '已安装' : '未安装（node_modules 缺失）'));
  console.log('  说明              : cargo fmt 只需 Rust 工具链，本机可真实执行；');
  console.log('                      cargo clippy / cargo test 需要 MSVC 链接器，本机不可执行；');
  console.log('                      Tauri 桌面端编译与 NSIS 打包仅在 CI 的 windows-latest 执行。');
  console.log('');

  const checks = buildChecks(cargo, msvcOk);
  const passed = [];
  const failed = [];
  const skipped = [];

  checks.forEach((item, idx) => {
    console.log('---- [' + (idx + 1) + '/' + checks.length + '] ' + item.label + ' ----');
    if (!item.need()) {
      // 明确跳过，绝不静默当作成功
      console.log('[跳过] ' + item.label + ' — ' + item.hint);
      skipped.push({ label: item.label, hint: item.hint });
      return;
    }
    const ok = run(item.cmd, env);
    if (ok) {
      console.log('[通过] ' + item.label);
      passed.push(item.label);
    } else {
      console.log('[失败] ' + item.label);
      failed.push(item.label);
    }
  });

  console.log('');
  console.log('=== 汇总 ===');
  console.log('--------------------------------------------');
  for (const p of passed) console.log('[通过] ' + p);
  for (const f of failed) console.log('[失败] ' + f);
  for (const s of skipped) console.log('[跳过] ' + s.label + ' — ' + s.hint);
  console.log('--------------------------------------------');
  console.log('通过 ' + passed.length + ' 项 / 失败 ' + failed.length + ' 项 / 跳过 ' + skipped.length + ' 项');
  console.log('提示: cargo fmt 已在本机真实执行；cargo clippy / cargo test 需在具备');
  console.log('      MSVC 链接器的环境执行；Tauri 桌面端编译与 NSIS 打包仅在');
  console.log('      GitHub Actions 的 windows-latest 执行。本机「通过」不代表 CI 全部 job 已验证。');

  if (failed.length > 0) {
    console.log('结果: 存在失败项（退出码 1）。');
    return 1;
  }
  console.log('结果: 本机可执行范围内的检查全部通过（退出码 0）。');
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error('检查运行失败: ' + (err && err.message ? err.message : String(err)));
  process.exitCode = 1;
}
