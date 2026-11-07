/**
 * 影幕 Design Tokens — 唯一设计真源
 * 消费方：CSS 变量（tokens.css）、React 组件、PixiJS 动态背景、Tauri 原生窗口配置。
 * 所有数值以 rem/px 表达，动画参数统一由此导出，禁止在组件里散落魔法数字。
 */

export const color = {
  /** 品牌：银幕暖光（低饱和琥珀），刻意避开紫粉渐变 */
  cinemaAmber: '#D9A55B',
  cinemaAmberSoft: '#E8C58C',
  silverScreen: '#F2EFE9',
  /** 深色主题 */
  dark: {
    bgBase: '#0B0D10',
    bgElevated: '#12151A',
    bgOverlay: '#191D23',
    surface: '#1C2128',
    surfaceHover: '#252B33',
    border: '#2A3038',
    borderStrong: '#3A424C',
    textPrimary: '#F2EFE9',
    textSecondary: '#A8B0BA',
    textTertiary: '#6E7884',
    scrim: 'rgba(6, 8, 10, 0.72)',
  },
  /** 浅色主题 */
  light: {
    bgBase: '#F7F6F3',
    bgElevated: '#FFFFFF',
    bgOverlay: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceHover: '#EFEDE8',
    border: '#E2DFD8',
    borderStrong: '#CFCAC0',
    textPrimary: '#1A1D21',
    textSecondary: '#5A6069',
    textTertiary: '#8A9099',
    scrim: 'rgba(247, 246, 243, 0.78)',
  },
  semantic: {
    success: '#6FB28C',
    warning: '#D9A55B',
    danger: '#D97A6C',
    info: '#7C9BB5',
    favorite: '#D9A55B',
  },
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
    sm: '0 2px 8px rgba(0,0,0,0.28)',
    md: '0 8px 24px rgba(0,0,0,0.36)',
    lg: '0 24px 64px rgba(0,0,0,0.52)',
    glow: '0 0 0 1px rgba(217,165,91,0.28), 0 16px 48px rgba(0,0,0,0.56)',
  },
  light: {
    sm: '0 2px 8px rgba(26,29,33,0.06)',
    md: '0 8px 24px rgba(26,29,33,0.10)',
    lg: '0 24px 64px rgba(26,29,33,0.14)',
    glow: '0 0 0 1px rgba(217,165,91,0.42), 0 16px 48px rgba(26,29,33,0.12)',
  },
} as const;

/** 不规则幕墙磁贴尺寸：以 8px 基准行高 + 16px 间距的网格跨度定义 */
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
  typography,
  radius,
  spacing,
  shadow,
  tile,
  motion,
  zIndex,
} as const;

export default tokens;
