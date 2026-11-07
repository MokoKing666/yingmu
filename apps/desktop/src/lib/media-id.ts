/**
 * 稳定 Media ID 与内容指纹（TS 侧）
 *
 * 与 Rust 侧 crates/yingmu-core/src/scanner/mod.rs 的算法一致：
 * 「文件路径不参与 ID 计算」。Rust 扫描器对文件头/尾/中间三段做部分哈希，
 * 与 size、mtime 共同构成内容指纹，再由命名空间 UUID 派生 MediaId。
 * 因此 NAS 地址变更、文件移动、磁盘盘符变化都不会改变 ID，
 * 元数据 / 收藏 / 观看记录可保留。
 */

import { hashString } from './format';

/** 命名空间：影幕媒体 ID 固定前缀，跨设备一致 */
export const MEDIA_ID_NAMESPACE = 'com.moko.yingmu.media.v1';

/** 把任意字符串扩展成 128 位十六进制（4 个 FNV 变体），仅用于确定性 ID 展示 */
function hex128(seed: string): string {
  const parts: string[] = [];
  const salts = ['a1', 'b2', 'c3', 'd4'];
  for (const salt of salts) {
    parts.push(hashString(`${seed}:${salt}`).toString(16).padStart(8, '0'));
  }
  return parts.join('');
}

function toUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** 由内容指纹派生稳定 UUID；相同指纹永远得到相同 ID */
export function stableMediaId(contentFingerprint: string): string {
  const hex = hex128(`${MEDIA_ID_NAMESPACE}:${contentFingerprint}`);
  // 版本位 5（基于名称的 SHA-1 风格语义）、变体位
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return toUuid(versioned);
}

/**
 * 内容指纹输入：部分哈希 + 大小 + 修改时间。
 * 注意：不包含任何路径信息。路径仅用于定位与 remap。
 */
export interface FingerprintInput {
  partialHash: string;
  sizeBytes: number;
  /** Unix 毫秒 */
  modifiedAtMs: number;
}

export function contentFingerprint(input: FingerprintInput): string {
  return `${input.partialHash}:${input.sizeBytes}:${Math.floor(input.modifiedAtMs / 1000)}`;
}

/** 演示数据用的确定性指纹（真实实现由 Rust 扫描器读取文件生成） */
export function demoFingerprint(seed: string): string {
  return `demo-${hex128(seed).slice(0, 24)}`;
}

/** 统一相对路径分隔符，避免 Windows / POSIX 差异影响增量扫描比较 */
export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

/**
 * 媒体源地址变更后重定位：把旧根路径替换为新根路径，
 * 返回新的相对路径（相对路径本身不变，因此 Media ID 不变）。
 */
export function remapRelativePath(relativePath: string, _oldRoot: string, _newRoot: string): string {
  return normalizeRelativePath(relativePath);
}
