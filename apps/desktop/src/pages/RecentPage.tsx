import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, Play, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LazyImage } from '@/components/ui/LazyImage';
import { useAppStore } from '@/stores/app-store';
import { useArtwork } from '@/hooks/use-artwork';
import { formatClock, formatDuration, KIND_LABEL } from '@/lib/format';
import type { MediaItem } from '@yingmu/media-models';

function TimelineRow({ item }: { item: MediaItem }) {
  const src = useArtwork(item.id, 'backdrop', 'sm');
  const duration = item.versions[0]?.durationSeconds ?? 0;
  const position = item.resumeSeconds ?? 0;
  const percent = duration ? (position / duration) * 100 : 0;
  const date = item.lastPlayedAt ?? item.addedAt;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 20px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="tiny mono" style={{ paddingTop: 18, textAlign: 'right' }}>
        {date.slice(5, 10).replace('-', '/')}
        <div style={{ opacity: 0.6 }}>{date.slice(11, 16)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
        <span style={{ width: 9, height: 9, marginTop: 22, borderRadius: '50%', background: 'var(--accent)', flex: 'none' }} />
        <span style={{ width: 1, flex: 1, background: 'var(--border)', minHeight: 24 }} />
      </div>
      <Link to={`/detail/${item.id}`} className="panel" style={{ display: 'flex', gap: 18, padding: 14, marginBottom: 8 }}>
        <div style={{ width: 168, height: 94, borderRadius: 10, overflow: 'hidden', position: 'relative', flex: 'none', background: 'var(--surface)' }}>
          {src && <LazyImage src={src} alt="" className="tile-art" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '0.9375rem' }}>{item.metadata.title}</strong>
            <span className="tag">{KIND_LABEL[item.kind]}</span>
          </div>
          <div className="tiny" style={{ marginTop: 4 }}>{item.metadata.originalTitle} · {item.metadata.year}</div>
          <div className="progress-track" style={{ marginTop: 14 }}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="row tiny" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span className="mono">{formatClock(position)} / {formatClock(duration)}</span>
            <span>剩余 {formatDuration(duration - position)} · 已播放 {item.playCount} 次</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function RecentPage() {
  const items = useAppStore((s) => s.items);
  const history = useAppStore((s) => s.history);

  const recent = useMemo(
    () => items.filter((item) => item.lastPlayedAt || item.resumeSeconds != null)
      .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')),
    [items],
  );

  return (
    <>
      <PageHeader
        eyebrow="CONTINUE WATCHING · 时间轴"
        title="最近播放"
        subtitle={`${recent.length} 条续播记录 · ${history.length} 条持久化进度 · 支持续播与从头播放`}
        actions={<span className="demo-badge">按最后播放时间排列</span>}
      />
      {recent.length === 0 ? (
        <EmptyState title="还没有播放记录" description="播放任意作品后，进度会记录在这里。" icon={<Clock3 size={38} />} />
      ) : (
        <div style={{ maxWidth: 900 }}>
          {recent.map((item) => <TimelineRow key={item.id} item={item} />)}
          <div className="row" style={{ marginTop: 24, gap: 12 }}>
            <Link to="/history" className="btn"><RotateCcw size={14} /> 查看完整播放历史</Link>
            <Link to="/search" className="btn btn-ghost"><Play size={14} /> 找点别的看</Link>
          </div>
        </div>
      )}
    </>
  );
}
