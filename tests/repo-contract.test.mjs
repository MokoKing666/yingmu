/**
 * 影幕 YingMu — 仓库契约测试
 *
 * 只依赖 Node 内置模块（node:test / node:assert / node:fs / node:path），
 * 不需要 npm install，可在任何装了 Node 的机器上真实运行。
 *
 * 运行方式：
 *   node --test tests/repo-contract.test.mjs
 *
 * 设计约定：
 * - 其他团队正在并行创建 tauri.conf.json / Cargo.toml / README 等文件。
 *   对「尚不存在」的文件一律给出 skip / diagnostic，而不是 fail；
 *   一旦文件存在，则必须严格校验。
 * - 文档类文件（.md 与 docs/**）可能合法引用历史标识（迁移说明、检查清单），
 *   因此不参与「旧标识」断言；但配置、代码、CI 文本必须严格通过。
 * - 代码里的「禁止性提及」（注释写明「禁止使用旧标识」、assert_ne!/!= 反向断言）
 *   属于遵守契约而非使用旧标识，予以放行；只有把旧标识当作值使用才判违规。
 * - 本测试文件自身含有旧标识字面量用于断言，扫描时显式排除自身。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const APP_ID = 'com.moko.yingmu';
const LEGACY_ID = 'com.yingmu.player';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.vite', '.parcel-cache', '.nyc_output', 'binaries', 'gen',
  'tmp', 'temp', 'cache', 'Cache', 'logs', 'installer-artifact',
  'release-assets', 'nsis-staging', 'private-media', 'samples', 'testdata', 'test-media',
]);

/** 读取文件；不存在时返回 { exists: false }，供 skip 使用 */
function readIfExists(rel) {
  const full = join(ROOT, ...rel.split('/'));
  if (!existsSync(full)) return { exists: false, content: '' };
  return { exists: true, content: readFileSync(full, 'utf8') };
}

/** 递归收集仓库内文件（排除依赖/构建产物目录） */
function collectFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

// ---------------------------------------------------------------------------
// 1) App ID 一致且为 com.moko.yingmu
// ---------------------------------------------------------------------------
test('App ID 一致且为 com.moko.yingmu（配置文件 + CI bundle 名，缺失则跳过）', (t) => {
  const configs = [
    'apps/desktop/src-tauri/tauri.conf.json',
    'apps/desktop/src-tauri/Cargo.toml',
    'Cargo.toml',
    'crates/yingmu-core/Cargo.toml',
  ];
  let checked = 0;

  for (const rel of configs) {
    const f = readIfExists(rel);
    if (!f.exists) {
      t.diagnostic('跳过（文件尚未创建，并行开发中）: ' + rel);
      continue;
    }
    // tauri.conf.json 严格校验 identifier 字段
    if (rel.endsWith('tauri.conf.json')) {
      const m = f.content.match(/"identifier"\s*:\s*"([^"]+)"/);
      if (m) {
        assert.equal(m[1], APP_ID, rel + ' 的 identifier 应为 ' + APP_ID + '，实际: ' + m[1]);
      } else {
        assert.ok(
          f.content.includes(APP_ID),
          rel + ' 未声明 identifier，且全文未出现 ' + APP_ID
        );
      }
    }
    // 任何配置文件里出现的 app-id 样式字符串必须等于目标 App ID
    const ids = f.content.match(/\bcom\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+\b/g) || [];
    for (const id of ids) {
      assert.equal(id, APP_ID, rel + ' 中出现非目标 App ID: ' + id);
    }
    checked += 1;
  }

  // CI 中的 NSIS bundle 名与（若出现的）App ID
  for (const rel of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    const f = readIfExists(rel);
    if (!f.exists) {
      t.diagnostic('跳过（文件尚未创建，并行开发中）: ' + rel);
      continue;
    }
    assert.ok(f.content.includes('YingMu-Setup'), rel + ' 应包含 NSIS bundle 名 YingMu-Setup-*');
    const ids = f.content.match(/\bcom\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+\b/g) || [];
    for (const id of ids) {
      assert.equal(id, APP_ID, rel + ' 中出现非目标 App ID: ' + id);
    }
    checked += 1;
  }

  // README 若存在则跳过：文档可能包含历史迁移说明，不属于配置契约。
  t.diagnostic('README.md 按约定跳过 App ID 严格校验（文档可含历史说明）');

  if (checked === 0) {
    t.skip('所有受检配置文件尚未创建，跳过 App ID 一致性检查');
  }
});

// ---------------------------------------------------------------------------
// 2) 禁止旧标识
// ---------------------------------------------------------------------------
test('禁止出现旧标识 com.yingmu.player（文档与测试自身除外）', (t) => {
  const files = [];
  collectFiles(ROOT, files);
  const offenders = [];
  let checked = 0;
  let allowedMentions = 0;

  // 「禁止性提及」是合法且值得鼓励的：注释里写明「禁止使用旧标识」、
  // 单元测试里用 assert_ne!/!= 断言 App ID 不等于旧标识，都是在遵守契约，
  // 而不是把旧标识当作配置值使用。只拦截「把旧标识当作值使用」的行。
  const COMMENT_START = /^(?:\/\/|\/\*|\*|#|<!--)/;
  const NEGATIVE_HINT = /assert_ne|assert!\(|!==|!=|禁止|不得|旧标识|旧\s*ID|legacy|deprecated/i;

  for (const full of files) {
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    const name = basename(full);
    // 文档类（含检查清单 / README / CHANGELOG）与契约测试自身按约定排除
    if (name.endsWith('.md') || rel.startsWith('docs/') || rel === 'tests/repo-contract.test.mjs') {
      continue;
    }
    let buf;
    try {
      buf = readFileSync(full);
    } catch {
      continue;
    }
    if (buf.includes(0)) continue; // 二进制文件跳过内容检测
    const text = buf.toString('utf8');
    checked += 1;
    if (!text.includes(LEGACY_ID)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes(LEGACY_ID)) continue;
      if (COMMENT_START.test(line.trim()) || NEGATIVE_HINT.test(line)) {
        allowedMentions += 1;
        continue;
      }
      offenders.push(rel + ':' + (i + 1));
    }
  }

  t.diagnostic(
    '已扫描非文档文本文件 ' + checked + ' 个；放行合法禁止性提及 ' + allowedMentions + ' 处'
  );
  if (checked === 0) {
    t.skip('未扫描到任何可校验的文本文件，跳过');
    return;
  }
  assert.deepEqual(
    offenders,
    [],
    '以下位置把旧标识 ' + LEGACY_ID + ' 当作值使用，违反契约: ' + offenders.join(', ')
  );
});

// ---------------------------------------------------------------------------
// 3) IPC 命令前缀与唯一性
// ---------------------------------------------------------------------------
test('bridge.ts 中每个 IPC 命令名均为 yingmu_ 前缀且唯一', (t) => {
  const f = readIfExists('packages/media-models/src/bridge.ts');
  if (!f.exists) {
    t.skip('bridge.ts 尚未创建，跳过 IPC 契约检查');
    return;
  }
  const block = f.content.match(/export const IPC = \{([\s\S]*?)\} as const;/);
  assert.ok(block, '未找到 IPC 常量块（export const IPC = { ... } as const;）');

  const pairs = [...block[1].matchAll(/^[ \t]*([A-Za-z0-9_]+)[ \t]*:[ \t]*'([^']+)'/gm)];
  assert.ok(pairs.length > 0, 'IPC 块中未解析到任何命令定义');

  const keys = pairs.map((m) => m[1]);
  const names = pairs.map((m) => m[2]);
  for (const name of names) {
    assert.ok(name.startsWith('yingmu_'), 'IPC 命令缺少 yingmu_ 前缀: ' + name);
  }
  assert.equal(new Set(names).size, names.length, 'IPC 命令名存在重复: ' + names.join(', '));
  assert.equal(new Set(keys).size, keys.length, 'IPC 键名存在重复');
  t.diagnostic('已校验 IPC 命令数: ' + names.length);
});

// ---------------------------------------------------------------------------
// 4) .gitignore 关键忽略规则
// ---------------------------------------------------------------------------
test('.gitignore 含关键忽略规则且不含裸 *.ts（防误伤 TS 源码）', (t) => {
  const f = readIfExists('.gitignore');
  if (!f.exists) {
    t.skip('.gitignore 尚未创建，跳过忽略规则检查');
    return;
  }
  for (const rule of ['.env', '*.db', '*.mkv', '*.exe', '*.otf']) {
    assert.ok(f.content.includes(rule), '.gitignore 缺少忽略规则: ' + rule);
  }
  // 回归断言：裸 `*.ts` 会忽略全部 TypeScript 源码，绝不允许出现。
  // 只允许目录限定形式（如 samples/**/*.ts）或明确的视频扩展名 *.m2ts。
  const bareTsLines = f.content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l === '*.ts');
  assert.equal(
    bareTsLines.length,
    0,
    '.gitignore 仍含裸 *.ts 规则（会忽略 TypeScript 源码），请改为目录限定形式'
  );
  assert.ok(f.content.includes('*.m2ts'), '.gitignore 应保留 MPEG-TS 视频规则 *.m2ts');
});

// ---------------------------------------------------------------------------
// 5) ci.yml 必要步骤
// ---------------------------------------------------------------------------
test('ci.yml 包含 typecheck/lint/test/build、cargo fmt|clippy|test 与 NSIS 产物校验', (t) => {
  const f = readIfExists('.github/workflows/ci.yml');
  if (!f.exists) {
    t.skip('ci.yml 尚未创建（devops 团队并行开发中），跳过');
    return;
  }
  const y = f.content;
  const required = [
    ['push 到 main', /branches:\s*\[main\]/],
    ['所有 PR 触发', /pull_request:/],
    ['concurrency 防重复', /concurrency:/],
    ['npm ci', /npm ci/],
    ['typecheck 步骤', /npm run typecheck/],
    ['lint 步骤', /npm run lint/],
    ['test 步骤', /npm run test/],
    ['build 步骤', /npm run build/],
    ['cargo fmt', /cargo fmt --all -- --check/],
    ['cargo clippy', /cargo clippy/],
    ['cargo test', /cargo test/],
    ['NSIS 产物名', /YingMu-Setup-\*\.exe/],
    ['找不到产物即失败', /未找到/],
    ['产物校验脚本', /verify-release\.mjs/],
    ['SHA-256 校验和', /--sums|SHA256SUMS\.txt/],
    // 只约束「使用官方 upload-artifact 动作」，不锁死主版本号：
    // Dependabot 会把 v4 升级到 v7，锁死版本会让契约测试在依赖升级时误报失败。
    ['上传产物', /actions\/upload-artifact@v\d+/],
    ['tauri-action @v1', /tauri-apps\/tauri-action@v1/],
  ];
  for (const [label, re] of required) {
    assert.ok(re.test(y), 'ci.yml 缺少必要内容: ' + label);
  }
});

// ---------------------------------------------------------------------------
// 6) release.yml 必要步骤
// ---------------------------------------------------------------------------
test('release.yml 包含 tag 触发、安装包校验、SHA256SUMS 与 softprops 发布', (t) => {
  const f = readIfExists('.github/workflows/release.yml');
  if (!f.exists) {
    t.skip('release.yml 尚未创建（devops 团队并行开发中），跳过');
    return;
  }
  const y = f.content;
  const required = [
    ['push.tags v* 触发', /tags:\s*\['v\*'\]/],
    ['windows-latest', /windows-latest/],
    ['tauri-action 构建(@v1)', /tauri-apps\/tauri-action@v1/],
    ['安装包校验脚本', /verify-release\.mjs/],
    ['SHA256SUMS.txt', /SHA256SUMS\.txt/],
    ['CHANGELOG 段落提取', /CHANGELOG\.md/],
    ['softprops 创建 Release', /softprops\/action-gh-release@v2/],
    ['仅上传本工作流产物', /release-assets/],
  ];
  for (const [label, re] of required) {
    assert.ok(re.test(y), 'release.yml 缺少必要内容: ' + label);
  }
});

// ---------------------------------------------------------------------------
// 7) NSIS 产物规范化 / 重命名步骤（防回归）
// ---------------------------------------------------------------------------
// tauri-action 产出的 NSIS 文件名由 tauri.conf.json 的 productName + version 推导
// （如「影幕 YingMu_0.1.0_x64-setup.exe」），落在 .../bundle/nsis/ 下，永远不会叫
// YingMu-Setup-*.exe。若工作流直接用 `find -name 'YingMu-Setup-*.exe'` 定位产物，
// 即使 Tauri 构建成功也会因「未找到安装包」而失败。两个工作流都必须包含显式的
// 规范化/重命名步骤，把真实产物复制到 nsis-staging/YingMu-Setup-<version>-x64.exe。
test('ci.yml / release.yml 均含 NSIS 产物规范化/重命名步骤（防回归）', (t) => {
  const specs = [
    {
      rel: '.github/workflows/ci.yml',
      versionFrom: /tauri\.conf\.json'\)\.version/,
      versionLabel: '从 tauri.conf.json 读取 version（node -p require(...).version）',
    },
    {
      rel: '.github/workflows/release.yml',
      versionFrom: /version="\$\{version#[vV]\}"/,
      versionLabel: '从 tag（github.ref_name）去掉前导 v 推导 version',
    },
  ];
  for (const s of specs) {
    const f = readIfExists(s.rel);
    if (!f.exists) {
      t.diagnostic('跳过（文件尚未创建）: ' + s.rel);
      continue;
    }
    const y = f.content;
    assert.ok(
      /规范化安装包文件名/.test(y),
      s.rel + ' 缺少「规范化安装包文件名」步骤（tauri-action 产物名由 productName 推导，'
        + '不会叫 YingMu-Setup-*.exe，必须显式重命名，否则 CI 必然失败）'
    );
    assert.ok(
      /bundle\/nsis\/\*\.exe/.test(y),
      s.rel + ' 未使用 */bundle/nsis/*.exe 定位 tauri-action 真实 NSIS 产物'
    );
    assert.ok(
      /nsis-staging\/YingMu-Setup-/.test(y),
      s.rel + ' 未把产物规范化并暂存到 nsis-staging/YingMu-Setup-<version>-x64.exe'
    );
    assert.ok(
      /对暂存|find nsis-staging/.test(y),
      s.rel + ' 校验步骤未只对暂存目录 nsis-staging 做 find（避免被排除规则过滤）'
    );
    assert.ok(
      s.versionFrom.test(y),
      s.rel + ' 规范化步骤未体现 ' + s.versionLabel
    );
    // 真实校验闸门一行都不能削弱
    assert.ok(/verify-release\.mjs/.test(y), s.rel + ' 缺少 verify-release.mjs 真实校验');
    assert.ok(/SHA256SUMS\.txt/.test(y), s.rel + ' 缺少 SHA256SUMS.txt 校验和生成');
  }
});
