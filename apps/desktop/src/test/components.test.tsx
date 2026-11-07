import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogoMark, BrandLockup } from '@/components/Logo';
import { Segmented } from '@/components/ui/Segmented';
import { StatusNotice } from '@/components/ui/StatusNotice';

describe('原创 Logo', () => {
  it('渲染手工 SVG 图形并提供无障碍名称', () => {
    const { container } = render(<LogoMark size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('影幕');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 256 256');
    // 独立图形不含普通播放三角形
    expect(svg?.innerHTML).not.toContain('polygon');
  });

  it('品牌组合显示中英文名称', () => {
    render(<BrandLockup />);
    expect(screen.getByText('影幕')).toBeInTheDocument();
    expect(screen.getByText(/YINGMU/)).toBeInTheDocument();
  });
});

describe('Segmented 控件', () => {
  it('点击后回调正确值并更新 aria-pressed', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        value="dark"
        ariaLabel="主题"
        options={[{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }]}
        onChange={onChange}
      />,
    );
    const light = screen.getByRole('button', { name: '浅色' });
    fireEvent.click(light);
    expect(onChange).toHaveBeenCalledWith('light');
    expect(screen.getByRole('button', { name: '深色' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('StatusNotice', () => {
  it('明确展示未实现状态文案', () => {
    render(<StatusNotice title="播放器后端未集成">此处不填充任何占位数值</StatusNotice>);
    expect(screen.getByText('播放器后端未集成')).toBeInTheDocument();
    expect(screen.getByText('此处不填充任何占位数值')).toBeInTheDocument();
  });
});
