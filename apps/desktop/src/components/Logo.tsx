import type { SVGProps } from 'react';

/** 影幕原创图形的 React 版本：使用 currentColor，随主题自动适配 */
export function LogoMark({ size = 32, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} fill="currentColor" role="img" aria-label="影幕" {...rest}>
      <rect x="40" y="42" width="176" height="12" rx="6" />
      <path
        fillRule="evenodd"
        d="M 50 64 H 206 A 18 18 0 0 1 224 82 V 158 A 18 18 0 0 1 206 176 H 50 A 18 18 0 0 1 32 158 V 82 A 18 18 0 0 1 50 64 Z
           M 66 120 A 26 26 0 1 0 118 120 A 26 26 0 1 0 66 120 Z
           M 79 120 A 13 13 0 1 0 105 120 A 13 13 0 1 0 79 120 Z
           M 140 100 H 206 V 108 H 140 Z
           M 132 116 H 206 V 124 H 132 Z
           M 124 132 H 206 V 140 H 124 Z"
      />
      <rect x="84" y="184" width="8" height="12" rx="4" />
      <rect x="124" y="184" width="8" height="18" rx="4" />
      <rect x="164" y="184" width="8" height="12" rx="4" />
    </svg>
  );
}

/** 侧边栏品牌组合 */
export function BrandLockup({ size = 34 }: { size?: number }) {
  return (
    <div className="sidebar-brand">
      <span style={{ color: 'var(--brand-amber)', flex: 'none' }}>
        <LogoMark size={size} />
      </span>
      <span>
        <span className="brand-name" style={{ display: 'block' }}>
          影幕
        </span>
        <span className="brand-sub">YINGMU · MEDIA CENTER</span>
      </span>
    </div>
  );
}
