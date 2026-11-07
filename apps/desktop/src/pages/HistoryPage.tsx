import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { History, CheckCircle2, CirclePlay } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/stores/app-store';
import { formatClock, formatDuration, KIND_LABEL } from '@/lib/format';

export function HistoryPage() {
  const history = useAppStore((s) => s.history);
  const items = useAppStore((s) => s.items);

  const rows = useMemo(
    () => [...history].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((progress) => ({
      progress,
      item: items.find((i) => i.id === progress.mediaId),
    })),
    [history, items],
  );

  const totalSeconds = rows.reduce((sum, row) => sum + row.progress.positionSeconds, 0);
  const completed = rows.filter((row) => row.progress.completed).length;

  return (
    <>
      <PageHeader
        eyebrow="HISTORY · 播放历史"
        title="播放历史"
        subtitle="进度按 Media ID 保存，更换 NAS 地址或媒体源后依然可以续播。"
      />

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="panel"><div className="tiny">总记录</div><div style={{ fontSize: '1.75rem', fontWeight: 600 }} className="mono">{rows.length}</div></div>
        <div className="panel"><div className="tiny">累计观看时长</div><div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{formatDuration(totalSeconds)}</div></div>
        <div className="panel"><div className="tiny">已看完</div><div style={{ fontSize: '1.75rem', fontWeight: 600 }} className="mono">{completed}</div></div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="没有播放历史" description="播放任意作品后，进度会由 Playback History 模块持久化。" icon={<History size={38} />} />
      ) : (
        <div className="panel" style={{ padding: 8 }}>
          <div className="list-row tiny" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', borderRadius: 0 }}>
            <span style={{ width: 20 }}>#</span>
            <span style={{ flex: 1 }}>作品</span>
            <span style={{ width: 180 }}>进度</span>
            <span style={{ width: 90 }}>状态</span>
            <span style={{ width: 130, textAlign: 'right' }}>最后更新</span>
          </div>
          {rows.map(({ progress, item }, index) => {
            const percent = progress.durationSeconds ? (progress.positionSeconds / progress.durationSeconds) * 100 : 0;
            return (
              <Link key={`${progress.mediaId}-${progress.updatedAt}`} to={item ? `/detail/${item.id}` : '/'} className="list-row">
                <span className="tiny mono" style={{ width: 20 }}>{index + 1}</span>
                <div className="list-main">
                  <div className="list-title">{item?.metadata.title ?? progress.mediaId.slice(0, 8)}</div>
                  <div className="list-meta">{item ? `${item.metadata.year} · ${KIND_LABEL[item.kind]}` : '媒体已移除'}</div>
                </div>
                <div style={{ width: 180 }}>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
                  <div className="tiny mono" style={{ marginTop: 4 }}>{formatClock(progress.positionSeconds)} / {formatClock(progress.durationSeconds)}</div>
                </div>
                <span style={{ width: 90 }} className="row tiny">
                  {progress.completed ? <CheckCircle2 size={13} /> : <CirclePlay size={13} />}
                  {progress.completed ? '已看完' : '续播'}
                </span>
                <span className="tiny mono" style={{ width: 130, textAlign: 'right' }}>{progress.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
