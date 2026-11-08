import { useMemo } from 'react';
import { Heart, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MasonryWall } from '@/components/wall/MasonryWall';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAppStore } from '@/stores/app-store';
import { KIND_LABEL, KIND_ORDER } from '@/lib/format';

export function FavoritesPage() {
  const items = useAppStore((s) => s.items);
  const favorites = useMemo(() => items.filter((item) => item.favorite), [items]);
  const distribution = KIND_ORDER.map((kind) => ({
    kind,
    count: favorites.filter((item) => item.kind === kind).length,
  }));

  return (
    <>
      <div className="wall-inset favorites-head">
        <PageHeader
          eyebrow="FAVORITES · 收藏"
          title="我的收藏"
          subtitle={`${favorites.length} 部作品被标记为收藏 · 收藏状态与 Media ID 绑定，换源后依然保留`}
        />

        <div className="panel" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, padding: '16px 20px' }}>
          {distribution.map(({ kind, count }) => (
            <Link key={kind} to={`/library/${kind}`} className="tag" style={{ padding: '7px 14px', fontSize: '0.8125rem' }}>
              {KIND_LABEL[kind]} <strong style={{ marginLeft: 6, color: 'var(--brand-amber)' }}>{count}</strong>
            </Link>
          ))}
          <div style={{ flex: 1 }} />
          <span className="tiny">在磁贴上按 <kbd className="mono">F</kbd> 或点击爱心即可切换收藏</span>
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className="wall-inset">
          <EmptyState
            title="还没有收藏"
            description="在任意磁贴右上角点击爱心，作品就会出现在这里。"
            icon={<Heart size={38} />}
            action={<Link to="/" className="btn"><LinkIcon size={14} /> 回到首页</Link>}
          />
        </div>
      ) : (
        <MasonryWall items={favorites} heroEnabled={false} showToolbar={false} emptyTitle="还没有收藏" />
      )}
    </>
  );
}
