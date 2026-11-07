import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface StatusNoticeProps {
  tone?: 'warning' | 'info';
  title: string;
  children: ReactNode;
}

/**
 * 明确的功能状态提示。
 * 本项目严格区分「已实现」「演示交互」「未验证」，任何尚未完成的能力
 * 都必须通过本组件在界面上直说，不能靠默认值或文案含糊带过。
 */
export function StatusNotice({ tone = 'warning', title, children }: StatusNoticeProps) {
  const color = tone === 'warning' ? 'var(--semantic-warning)' : 'var(--semantic-info)';
  return (
    <div
      className="panel"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 8%, var(--bg-elevated))`, padding: '18px 22px' }}
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        <span style={{ color, flex: 'none', marginTop: 2 }}>
          {tone === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color, fontWeight: 600, fontSize: '0.875rem', marginBottom: 6 }}>{title}</div>
          <div className="muted" style={{ fontSize: '0.8125rem', lineHeight: 1.75 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
