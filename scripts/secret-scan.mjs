#!/usr/bin/env node
/**
 * 影幕 YingMu — 提交前敏感信息扫描
 *
 * 仅使用 Node 内置模块，可在没有第三方依赖的本机 / CI 上真实运行。
 * 扫描仓库内「将被提交的文件」，检测：
 *   - GitHub 各类访问令牌前缀
 *   - AWS Access Key ID
 *   - 私钥 PEM 块
 *   - 疑似 .env 凭据文件（按文件名）
 *   - 常见 API Key / 凭据赋值
 *   - Windows 本机绝对路径与 UNC 网络路径（仅针对配置/文档/数据文件；源码里的
 *     示例路径属于程序逻辑与测试数据，不判定）
 *   - 私人媒体文件、私钥/凭据文件（按文件名后缀）
 *
 * 重要：脚本自身含有上述「特征字符串」，因此所有敏感模式一律用字符拼接
 * (c(...)) 构造，连注释里也不写出完整示例，保证扫描到本脚本时不会自匹配。
 * 文件名后缀类规则按文件名判断，不扫描内容，同样不构成自匹配。
 *
 * 用法：node scripts/secret-scan.mjs [仓库根目录]
 *       node scripts/secret-scan.mjs --help
 * 退出码：0 = 未发现命中；1 = 发现命中，禁止提交；2 = 参数/运行错误。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SELF_DIR, '..');

/** 字符拼接：把特征串拆成片段，避免源码里出现完整敏感字面量 */
const c = (...parts) => parts.join('');
/** 转义正则元字符 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 构造「文件内容」检测规则 */
function buildContentRules() {
  const rules = [];
  const add = (type, re) => rules.push({ type, re });

  // GitHub 令牌前缀：全部由片段拼接而成。
  const ghPrefixes = [
    ['GitHub 个人访问令牌', c('gh', 'p_')],
    ['GitHub 细粒度访问令牌', c('github', '_', 'pat', '_')],
    ['GitHub OAuth 访问令牌', c('gho', '_')],
    ['GitHub 应用令牌', c('ghs', '_')],
  ];
  for (const [type, prefix] of ghPrefixes) {
    add(type, new RegExp(prefix + '[A-Za-z0-9_]{16,}'));
  }

  // AWS Access Key ID：AK + IA + 16 位大写字母/数字。
  add('AWS 访问密钥 ID', new RegExp(c('AK', 'IA') + '[0-9A-Z]{16}'));

  // 私钥 PEM 块头：特征串全部由字符拼接构造，注释中也不写出完整示例，避免自匹配。
  add(
    '私钥 PEM 块',
    new RegExp(c('-----', 'BEGIN') + '[A-Z0-9 ]*' + c('PRIVATE', ' ', 'KEY'))
  );

  // 常见 API Key / 凭据赋值：变量名后跟 = 或 :，且值是引号包裹的较长串。
  // 关键词同样全部拼接，避免源码里出现完整敏感词。
  const kws = [
    c('api', '_', 'key'),
    c('api', 'key'),
    c('api', '-', 'key'),
    c('acc', 'ess', '_', 'key'),
    c('acc', 'ess', 'key'),
    c('sec', 'ret'),
    c('pass', 'word'),
    c('pass', 'wd'),
    c('tok', 'en'),
    c('auth', '_', 'tok', 'en'),
    c('priv', 'ate', '_', 'key'),
    c('client', '_', 'sec', 'ret'),
  ].map(esc);
  add(
    '常见凭据赋值',
    new RegExp('(?:' + kws.join('|') + ')\\s*[:=]\\s*["\'][^"\']{8,}["\']', 'i')
  );

  // Windows 盘符绝对路径（反斜杠形式）。前缀限定为行首/空白/引号/左括号，
  // 以免把 https:// 中的 "s:/" 误判成盘符路径。
  add(
    'Windows 本机绝对路径',
    /(?:^|[\s'"(])[A-Za-z]:[\\](?:[A-Za-z0-9_.\- ]+[\\/])/
  );
  // 正斜杠形式只匹配常见系统目录，避免误伤 URL。
  add(
    'Windows 本机绝对路径(正斜杠形式)',
    /(?:^|[\s'"(])[A-Za-z]:\/(?:Users|Windows|Program|Temp|AppData|home)\//i
  );
  // UNC 网络路径，例如两个反斜杠开头的服务器共享路径。
  add('UNC 网络路径', /\\\\[A-Za-z0-9._-]+\\[^\s'"<>]+/);

  return rules;
}

/**
 * 路径类规则的豁免：代码注释里说明路径格式、单元测试里用示例路径做断言，
 * 属于「说明 / 测试」用途，不是把私人本机路径写进仓库。密钥类规则不豁免。
 */
const PATH_RULE_TYPES = new Set([
  'Windows 本机绝对路径',
  'Windows 本机绝对路径(正斜杠形式)',
  'UNC 网络路径',
]);
const COMMENT_LINE = /^(?:\/\/|\/\*|\*|#|<!--)/;
const EXAMPLE_ASSERT_LINE = /assert!|assert_eq!|assert_ne!|expect\(|\btest\(|\bit\(/;

/** 文件名后缀规则（按文件名判断，不扫描内容） */
const dot = (name) => c('.', name);
// 注意：'.ts' 既是 TypeScript 源文件后缀，也是 MPEG-TS 视频后缀。仓库内
// TypeScript 源码优先，因此不把 'ts' 当作媒体后缀（保留明确的 'm2ts'）。
const MEDIA_EXTS = [
  'mkv', 'mp4', 'mov', 'avi', 'm2ts', 'webm', 'iso', 'vob',
  'mpg', 'mpeg', 'flv', 'wmv', 'srt', 'ass', 'ssa', 'sup', 'sub', 'nfo',
].map(dot);
const PRIVATE_EXTS = ['pem', 'key', 'p12', 'pfx', 'keystore', 'token'].map(dot);
const ENV_PREFIX = dot('env'); // 形如 .env / .env.local 等
const ENV_WHITELIST = /\.(?:example|sample|template)$/i;

/** 这些目录不会被提交（依赖 / 构建产物 / 用户数据），跳过以提速并避免噪声 */
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'target', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.vite', '.parcel-cache', '.nyc_output', 'binaries', 'gen',
  'tmp', 'temp', 'cache', 'Cache', 'AppData', 'logs',
  'installer-artifact', 'release-assets', 'private-media', 'samples',
  'testdata', 'test-media', 'screenshots-local', 'nsis-staging',
  // WorkBuddy 会话数据：内部工作日志 / 一次性脚本，已被 .gitignore 排除，不参与交付扫描
  '.workbuddy',
]);

/** GitHub Actions 表达式不是真实凭据，检测前先剔除，避免把 secrets.X 误报 */
const ACTIONS_EXPR = /\$\{\{[^}]*\}\}/g;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/** 读取为文本；二进制/读取失败返回 null（仍会执行文件名规则） */
function readText(full) {
  let buf;
  try {
    buf = readFileSync(full);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

/** 命中片段脱敏，绝不把完整疑似密钥打印到日志 */
function mask(s) {
  const t = String(s).replace(/\s+/g, ' ').slice(0, 32);
  return t.length <= 4 ? '****' : t.slice(0, 4) + '****（已脱敏）';
}

function printUsage() {
  console.log('用法: node scripts/secret-scan.mjs [仓库根目录]');
  console.log('      node scripts/secret-scan.mjs --help');
  console.log('不传参数时默认扫描脚本所在仓库的根目录。');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return 0;
  }
  const positional = args.filter((a) => !a.startsWith('--'));
  let root = DEFAULT_ROOT;
  if (positional.length > 0) root = resolve(positional[0]);

  const files = [];
  walk(root, files);

  const rules = buildContentRules();
  const hits = [];
  let binarySkipped = 0;

  for (const full of files) {
    const rel = relative(root, full).replace(/\\/g, '/');
    const name = basename(full);
    const lower = name.toLowerCase();

    // --- 文件名类规则 ---
    if (name.startsWith(ENV_PREFIX) && !ENV_WHITELIST.test(name)) {
      hits.push({ type: '疑似 .env 凭据文件被提交', file: rel, line: 0, snippet: '（文件名）' });
    }
    if (MEDIA_EXTS.some((e) => lower.endsWith(e))) {
      hits.push({ type: '私人媒体/字幕样本文件', file: rel, line: 0, snippet: '（文件名）' });
    }
    if (PRIVATE_EXTS.some((e) => lower.endsWith(e))) {
      hits.push({ type: '私钥/凭据文件', file: rel, line: 0, snippet: '（文件名）' });
    }

    // --- 内容类规则 ---
    const raw = readText(full);
    if (raw === null) {
      binarySkipped += 1;
      continue;
    }
    const cleaned = raw.replace(ACTIONS_EXPR, '<actions-expr>');
    const lines = cleaned.split(/\r?\n/);
    // 源码文件里的 Windows/UNC 路径字面量属于程序逻辑与测试数据（媒体中心必须
    // 处理 UNC/Windows 路径），不纳入私人路径判定；配置/文档/数据文件仍严格检测。
    const isSource = /\.(?:ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt|c|cpp|h|hpp|cs|vue|svelte)$/i.test(full);
    const activeRules = isSource
      ? rules.filter((r) => !PATH_RULE_TYPES.has(r.type))
      : rules;
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      for (const rule of activeRules) {
        const m = lines[i].match(rule.re);
        if (!m) continue;
        // 路径类规则放行注释与单元测试中的路径示例，避免把合法说明误报为泄露
        if (
          PATH_RULE_TYPES.has(rule.type) &&
          (COMMENT_LINE.test(trimmed) || EXAMPLE_ASSERT_LINE.test(lines[i]))
        ) {
          continue;
        }
        hits.push({ type: rule.type, file: rel, line: i + 1, snippet: mask(m[0]) });
      }
    }
  }

  // --- 中文报告 ---
  console.log('=== 影幕 YingMu · 提交前敏感信息扫描 ===');
  console.log('扫描范围 : 仓库根目录（已排除依赖、构建产物与用户数据目录）');
  console.log('扫描文件 : ' + files.length + ' 个（其中二进制/不可读跳过 ' + binarySkipped + ' 个）');
  console.log('检测规则 : GitHub 令牌 / AWS 密钥 / 私钥 PEM / .env 凭据文件 /');
  console.log('           凭据赋值 / Windows 本机绝对路径 / UNC 路径 / 私人媒体文件');
  console.log('路径规则 : 仅对配置/文档/数据类文件生效；源码(.ts/.rs/.mjs 等)中的示例路径不判定');
  console.log('------------------------------------------------------------');

  if (hits.length > 0) {
    hits.forEach((h, idx) => {
      const loc = h.line > 0 ? '第 ' + h.line + ' 行' : '文件名';
      console.log(
        '[命中 ' + (idx + 1) + '] 类型: ' + h.type +
        ' | 文件: ' + h.file + ' | 位置: ' + loc +
        ' | 片段: ' + h.snippet
      );
    });
    console.log('------------------------------------------------------------');
    console.log('结果: 发现 ' + hits.length + ' 处疑似敏感信息，禁止提交（退出码 1）。');
    console.log('处理建议: 删除上述内容或改用环境变量 / 密钥管理服务；');
    console.log('           路径与日志请先脱敏，私人媒体样本不得入库。');
    return 1;
  }

  console.log('结果: 未发现疑似敏感信息，检查通过（退出码 0）。');
  return 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error('扫描运行失败: ' + (err && err.message ? err.message : String(err)));
  process.exitCode = 2;
}
