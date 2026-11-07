import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Play, Clock3 } from 'lucide-react';
import { MasonryWall } from '@/components/wall/MasonryWall';
import { DynamicBackdrop } from '@/components/wall/DynamicBackdrop';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { LazyImage } from '@/components/ui/LazyImage';
import { useAppStore } from '@/stores/app-store';
import { useArtwork } from '@/hooks/use-artwork';
import { formatClock, formatDuration, KIND_LABEL } from '@/lib/format';
import { DEMO_DATA_DISCLAIMER } from '@/lib/demo-data';
import type { MediaItem } from '@yingmu/media-models';

function ResumeCard({ item }: { item: MediaItem }) {
  const src = useArtwork(item.id, 'backdrop', 'md');
  const duration = item.versions[0]?.durationSeconds ?? 0;
  const percent = item.resumeSeconds && duration ? (item.resumeSeconds / duration) * 100 : 0;
  return (
    <Link to={`/player/${item.id}`} className="resume-card" style={{ position: 'relative', display: 'block', minWidth: 260, flex: 1, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      {src && <LazyImage src={src} alt="" className="tile-art" />}
      <span className="tile-scrim" />
      <div className="tile-content">
        <div className="tiny" style={{ color: '#f2efe9', opacity: 0.75 }}>{KIND_LABEL[item.kind]} · 继续观看</div>
        <h3 className="tile-title" style={{ fontSize: '0.9375rem' }}>{item.metadata.title}</h3>
        <p className="tile-sub">{formatClock(item.resumeSeconds ?? 0)} / {formatClock(duration)} · 剩余 {formatDuration(duration - (item.resumeSeconds ?? 0))}</p>
        <div className="progress-track" style={{ marginTop: 10 }}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span style={{ position: 'absolute', top: 12, right: 12, color: '#f2efe9', zIndex: 2 }}><Play size={16} /></span>
    </Link>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const items = useAppStore((s) => s.items);
  const isDemo = useAppStore((s) => s.isDemo);

  const resuming = useMemo(
    () => items.filter((item) => item.resumeSeconds != null && item.resumeSeconds > 0).slice(0, 4),
    [items],
  );
  const recentlyAdded = useMemo(
    () => [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 5),
    [items],
  );

  return (
    <>
      <DynamicBackdrop />
      <PageHeader
        eyebrow="THE WALL · 磁贴幕墙"
        title="今晚，看什么？"
        subtitle={`${items.length} 部作品 · ${resuming.length} 部可以接着看 · 按内容权重自动编排`}
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/library/movie')}>
            浏览电影库 <ArrowRight size={15} />
          </button>
        }
      />

      <MasonryWall items={items} heroEnabled showToolbar emptyTitle="媒体库为空" emptyDescription="在「媒体源管理」中添加一个来源后，扫描结果会出现在这里。" />

      {resuming.length > 0 && (
        <section style={{ marginTop: 48 }}>
          <div className="spread" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>继续观看</h2>
            <Link to="/recent" className="btn btn-ghost">
              全部 <ArrowRight size={14} />
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
            {resuming.map((item, index) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} style={{ display: 'flex', minWidth: 260, flex: 1 }}>
                <ResumeCard item={item} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 24 }}>
        <div className="panel">
          <h2 className="panel-title">最近加入</h2>
          <p className="panel-desc">按扫描入库时间排列，最新加入的 5 部作品。</p>
          <div className="stack" style={{ gap: 4 }}>
            {recentlyAdded.map((item) => (
              <Link key={item.id} to={`/detail/${item.id}`} className="list-row">
                <span style={{ width: 4, height: 28, borderRadius: 2, background: 'var(--brand-amber)', opacity: 0.7 }} />
                <div className="list-main">
                  <div className="list-title">{item.metadata.title}</div>
                  <div className="list-meta">{item.metadata.originalTitle}</div>
                </div>
                <span className="tiny mono">{item.addedAt.slice(0, 10)}</span>
                <span className="tag">{KIND_LABEL[item.kind]}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="stack">
          <StatusNotice title="当前为演示模式，不是真实媒体库">
            {DEMO_DATA_DISCLAIMER}。媒体扫描、网络媒体源、TMDB 刮削与 libmpv 播放均需 Rust 媒体核心在 Tauri 桌面端运行；
            本页的所有条目、封面与进度都是可交互的演示数据，不代表已实现的播放能力。
          </StatusNotice>
          <div className="panel">
            <h2 className="panel-title">状态一览</h2>
            <div className="stack" style={{ gap: 12, marginTop: 16 }}>
              <div className="spread"><span className="muted">平台桥接</span><span className="tag">{isDemo ? 'WebDemoBridge' : 'TauriBridge'}</span></div>
              <div className="spread"><span className="muted">播放器后端</span><span className="tag tag-accent">未集成</span></div>
              <div className="spread"><span className="muted">HDR / Dolby 输出</span><span className="tag">未验证</span></div>
              <div className="spread"><span className="muted"><Clock3 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />续播条目</span><span className="mono">{resuming.length}</span></div>
            </div>
            <Link to="/settings" className="btn" style={{ marginTop: 20, width: '100%' }}>
              查看诊断信息 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
