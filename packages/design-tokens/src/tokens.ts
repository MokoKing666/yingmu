/**
 * 影幕 Design Tokens — 唯一设计真源
 * 消费方：CSS 变量（tokens.css）、React 组件、PixiJS 动态背景、Tauri 原生窗口配置。
 * 所有数值以 rem/px 表达，动画参数统一由此导出，禁止在组件里散落魔法数字。
 */

/**
 * 影幕 v0.3 品牌色板 —— Cinematic Neutral（冷调电影感）
 *
 * 设计原则：
 * - UI 退居第二层，让电影封面成为画面主体；强调色只在选中/焦点/主操作/关键进度出现。
 * - 深色主题不是纯黑，靠 4 级中性面（bgBase → surface → surfaceHover → border）建立层次。
 * - 浅色主题是银白，不是米黄/奶油色。
 * - 语义色独立于品牌强调色，不再让所有状态都继承蓝色。
 * - 禁止香槟金 / 玫瑰金 / 紫粉渐变 / 霓虹色。
 *
 * 可访问性：浅色主题下 `accent` 使用加深的 `accentDeep`，以保证白底上的
 * 4.5:1 文字对比度；深色主题使用亮蓝 `accent`。对比度由
 * `scripts/check-contrast.mjs` 实测，不是凭感觉判断。
 */
export const color = {
  /** 品牌强调：Glacier Blue（深色主题值；浅色主题覆盖见 accentLight） */
  accent: '#77B8D8',
  accentSoft: '#A0D0E8',
  accentDeep: '#477F9F',
  accentWash: '#16252F',
  accentOn: '#08121A',
  /** 银幕白：深色主题的文字/图标基色，中性色而非品牌色 */
  silver: '#EEF3F7',

  /** 深色主题：Cinematic Graphite */
  dark: {
    bgBase: '#0B0F14',
    bgElevated: '#121922',
    bgOverlay: '#141C26',
    surface: '#18222D',
    surfaceHover: '#202D39',
    border: '#2B3947',
    borderStrong: '#405365',
    /** 功能性控件边界（输入框 / 按钮），必须过 WCAG 非文本 3:1 */
    borderControl: '#5A6978',
    textPrimary: '#EEF3F7',
    textSecondary: '#AAB7C3',
    textTertiary: '#8294A2',
    scrim: 'rgba(6, 11, 16, 0.72)',
  },
  /** 浅色主题：Silver Screen */
  light: {
    bgBase: '#F4F7FA',
    bgElevated: '#FFFFFF',
    bgOverlay: '#FFFFFF',
    surface: '#EDF2F6',
    surfaceHover: '#E4ECF2',
    border: '#D7E0E8',
    borderStrong: '#B6C4D0',
    /** 功能性控件边界：白底上必须过 3:1 */
    borderControl: '#788898',
    textPrimary: '#1B2732',
    textSecondary: '#5D6B78',
    textTertiary: '#5D6B78',
    scrim: 'rgba(244, 247, 250, 0.82)',
  },
  /**
   * 语义色：与品牌强调色解耦，且必须按主题分别给值。
   * 白底上的 #6FB994 只有 2.0:1，深底上的 #3F7D5C 只有 3.4:1，
   * 因此深浅各一套 —— 两套都必须过 4.5:1（由 scripts/check-contrast.mjs 实测）。
   */
  semantic: {
    dark: {
      success: '#6FB994',
      warning: '#D6A25C',
      danger: '#D98478',
      favorite: '#DE8A82',
      info: '#8FB4CF',
    },
    light: {
      success: '#3F7D5C',
      warning: '#8F6320',
      danger: '#A4473C',
      favorite: '#A84B44',
      info: '#4A7391',
    },
  },
} as const;

/** 浅色主题的强调色覆盖：白底需要更深的蓝才能达到 4.5:1 */
export const accentLight = {
  accent: '#3C6F8B',
  accentSoft: '#77B8D8',
  accentDeep: '#2A566E',
  accentWash: '#DDEFF7',
  accentOn: '#FFFFFF',
  silver: '#F4F7FA',
} as const;

/** 字体栈：MiSans 优先但绝不打包系统字体文件，授权见 THIRD_PARTY_NOTICES.md */
export const typography = {
  fontFamily:
    '"MiSans", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif',
  monoFamily: '"JetBrains Mono", "Cascadia Code", "Consolas", ui-monospace, monospace',
  weights: { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700 },
  scale: {
    display: { size: '3.25rem', lineHeight: 1.1, tracking: '-0.03em' },
    h1: { size: '2rem', lineHeight: 1.2, tracking: '-0.02em' },
    h2: { size: '1.5rem', lineHeight: 1.28, tracking: '-0.01em' },
    h3: { size: '1.125rem', lineHeight: 1.35, tracking: '0' },
    body: { size: '0.9375rem', lineHeight: 1.6, tracking: '0' },
    caption: { size: '0.8125rem', lineHeight: 1.5, tracking: '0.01em' },
    overline: { size: '0.6875rem', lineHeight: 1.4, tracking: '0.14em' },
  },
} as const;

export const radius = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  /** 磁贴统一圆角：固定像素，避免大跨度高宽比下百分比圆角被拉成椭圆 */
  tile: '20px',
  lg: '20px',
  xl: '28px',
  pill: '999px',
} as const;

export const spacing = {
  /** 横向 16 / 纵向 24 的秩序基准 */
  unit: 4,
  gutterX: 16,
  gutterY: 24,
  pageX: 40,
  pageY: 32,
  tileGap: 16,
  scale: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px' },
} as const;

export const shadow = {
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.36), 0 2px 8px rgba(0, 0, 0, 0.24)',
    md: '0 4px 16px rgba(0, 0, 0, 0.40), 0 12px 32px rgba(0, 0, 0, 0.28)',
    lg: '0 12px 40px rgba(0, 0, 0, 0.52), 0 32px 80px rgba(0, 0, 0, 0.36)',
    glow: '0 0 0 1px rgba(119, 184, 216, 0.32), 0 12px 32px rgba(0, 0, 0, 0.44)',
  },
  light: {
    sm: '0 1px 2px rgba(27, 39, 50, 0.06), 0 2px 8px rgba(27, 39, 50, 0.05)',
    md: '0 4px 16px rgba(27, 39, 50, 0.08), 0 12px 32px rgba(27, 39, 50, 0.06)',
    lg: '0 12px 40px rgba(27, 39, 50, 0.12), 0 32px 80px rgba(27, 39, 50, 0.08)',
    glow: '0 0 0 1px rgba(71, 127, 159, 0.36), 0 12px 32px rgba(27, 39, 50, 0.10)',
  },
} as const;

/**
 * 旧版 12 列网格跨度：仅作为**向后兼容的视觉语义标签**保留。
 * 自 v0.2 起，实际尺寸与位置完全由 mosaic 布局引擎连续计算，
 * `tile.variants` 不再决定任何磁贴的宽高或位置。
 */
export const tile = {
  gridColumns: 12,
  rowHeight: 32,
  gap: 16,
  variants: {
    hero: { colSpan: 6, rowSpan: 12, aspect: '21 / 9' },
    'portrait-lg': { colSpan: 3, rowSpan: 12, aspect: '2 / 3' },
    'portrait-sm': { colSpan: 2, rowSpan: 8, aspect: '2 / 3' },
    wide: { colSpan: 6, rowSpan: 8, aspect: '16 / 7' },
    resume: { colSpan: 4, rowSpan: 6, aspect: '16 / 9' },
    dynamic: { colSpan: 3, rowSpan: 6, aspect: '4 / 3' },
  },
  posterAspect: '2 / 3',
  minColumns: 4,
} as const;

/**
 * Folia 式无级拼贴布局引擎参数（唯一设计真源）。
 *
 * 为什么自研确定性 Skyline 二维装箱，而不是 CSS Grid / 现成 Masonry 库：
 * - CSS Grid dense 只能表达整数列跨度，尺寸天然离散；把 12 列加到 24/48 列
 *   仍是离散档位，且 dense 回填会打乱用户自定义顺序。
 * - 瀑布流库按列堆叠，无法产生「超大横幅 + 超大竖版 + 小方形」在同一行
 *   互相穿插的完整构图。
 * - Skyline（最左最低 + 宽度试探）能输出连续像素尺寸、保证零重叠、
 *   自动用小磁贴填补大磁贴留下的凹口，且纯函数、确定性、可虚拟滚动。
 */
export const mosaic = {
  /** 磁贴之间的克制分隔；页面级左右留白为 0 */
  gap: 12,
  /**
   * 连续尺寸曲线：按目标宽高比分维度驱动。
   * 横幅用「宽度」驱动、竖版用「高度」驱动，两者都是画布宽度的连续比例，
   * 再经幂次拉开大中小反差；没有任何离散档位。
   */
  sizeExponent: 1.5,
  width: { minRatio: 0.085, minPx: 96, maxClamp: 220, maxRatio: 0.78 },
  height: { minRatio: 0.14, minPx: 140, maxClamp: 320, maxRatio: 0.42, maxLowerPx: 360, maxPx: 760 },
  /** 连续宽高比区间：超宽 / 宽幅 / 方形 / 竖版 / 超大竖版 / 不规则 */
  aspect: {
    ultraWide: { min: 2.35, max: 3.3 },
    wide: { min: 1.45, max: 2.4 },
    square: { min: 0.92, max: 1.14 },
    portrait: { min: 0.6, max: 0.8 },
    ultraTall: { min: 0.46, max: 0.6 },
    irregular: { min: 0.82, max: 1.45 },
  },
  /** 权重构成合计 1.0；hash 抖动保证视觉节奏不出现固定周期 */
  weights: {
    hash: 0.16,
    kind: 0.14,
    recency: 0.12,
    rating: 0.08,
    favorite: 0.1,
    resume: 0.1,
    position: 0.16,
    rhythm: 0.14,
  },
  /** 放置时的宽度试探系数：让磁贴自适应凹口，减少空洞 */
  widthProbe: [1, 0.94, 1.06, 0.88, 1.12],
  /** 虚拟滚动上下预渲染距离（px） */
  overscan: 700,
} as const;

export const motion = {
  /** Motion for React 使用的统一 spring / tween 参数 */
  spring: { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 },
  springSoft: { type: 'spring', stiffness: 180, damping: 26 },
  hoverScale: 1.025,
  hoverLift: -6,
  cardExpand: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  pageTransition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  stagger: 0.035,
  reducedMotionFallback: { duration: 0.01 },
} as const;

export const zIndex = {
  background: 0,
  content: 10,
  sticky: 30,
  overlay: 50,
  playerChrome: 70,
  modal: 90,
  toast: 110,
} as const;

export const tokens = {
  color,
  accentLight,
  typography,
  radius,
  spacing,
  shadow,
  tile,
  mosaic,
  motion,
  zIndex,
} as const;

export default tokens;
