import { MasonryWall } from '@/components/wall/MasonryWall';
import { DynamicBackdrop } from '@/components/wall/DynamicBackdrop';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useAppStore } from '@/stores/app-store';
import { DEMO_DATA_DISCLAIMER } from '@/lib/demo-data';

/**
 * 首页 = 一整面连续延展的媒体艺术画布。
 * 标题轻量叠加、搜索悬浮在右上角；续播 / 收藏 / 最近加入全部由布局引擎的权重
 * 融入拼贴本身，不再拆成互不相关的卡片区域。
 */
export function HomePage() {
  const items = useAppStore((s) => s.items);
  const isDemo = useAppStore((s) => s.isDemo);

  return (
    <div className="wall-stage">
      <DynamicBackdrop />

      <div className="wall-overlay-title" aria-hidden="true">
        <strong>影幕</strong>
        <span>{items.length} 部作品 · 全幅拼贴 · 拖动磁贴可自定义排列</span>
      </div>

      <MasonryWall
        items={items}
        heroEnabled
        emptyTitle="媒体库为空"
        emptyDescription="在「媒体源管理」中添加一个来源后，扫描结果会出现在这里。"
      />

      {/* 诚实性声明折叠收起，不占用首屏画布；展开后可查看完整状态 */}
      <details className="wall-note">
        <summary>关于演示数据与当前功能状态</summary>
        <div className="panel">
          <StatusNotice title={isDemo ? '当前为演示模式，不是真实媒体库' : '桌面模式'}>
            {DEMO_DATA_DISCLAIMER}。媒体扫描、网络媒体源、TMDB 刮削与 libmpv 播放均需 Rust 媒体核心在 Tauri 桌面端运行；
            本页所有条目、封面与进度都是可交互的原创演示数据，不代表已实现的播放能力。
            HDR / Dolby Vision / 音频直通均未验证，播放器后端尚未集成。
          </StatusNotice>
        </div>
      </details>
    </div>
  );
}
