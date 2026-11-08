import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, List, SlidersHorizontal, Play, Star } from 'lucide-react';
import { MasonryWall } from '@/components/wall/MasonryWall';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { LazyImage } from '@/components/ui/LazyImage';
import { useAppStore } from '@/stores/app-store';
import { useArtwork } from '@/hooks/use-artwork';
import { KIND_LABEL, formatDuration, formatRating } from '@/lib/format';
import type { MediaItem, MediaKind } from '@yingmu/media-models';

type SortKey = 'recent' | 'year' | 'rating' | 'title';
type ViewMode = 'wall' | 'list';

const KIND_INTRO: Record<MediaKind, string> = {
  movie: '长片与短片，按 2:3 竖版海报为主呈现。',
  tv: '剧集以海报与剧照混合编排，支持季集信息。',
  anime: '动画作品海报与横版剧照混合呈现。',
  documentary: '纪录片同时使用竖版海报与横版剧照。',
  personal: '个人视频使用自动关键帧缩略图，不依赖外部元数据。',
};

function ListRow({ item }: { item: MediaItem }) {
  const navigate = useNavigate();
  const src = useArtwork(item.id, 'poster', 'sm');
  const duration = item.versions[0]?.durationSeconds ?? 0;
  return (
    <div className="list-row">
      <Link to={`/detail/${item.id}`} style={{ flex: 'none' }}>
        <div style={{ width: 44, height: 62, borderRadius: 6, overflow: 'hidden', position: 'relative', background: 'var(--surface)' }}>
          {src && <LazyImage src={src} alt="" className="tile-art" />}
        </div>
      </Link>
      <div className="list-main">
        <Link to={`/detail/${item.id}`} className="list-title">{item.metadata.title}</Link>
        <div className="list-meta">
          {item.metadata.year} · {item.metadata.genres.join(' / ')} · {formatDuration(duration)} · {item.versions.length} 个版本
        </div>
      </div>
      {item.favorite && <Star size={14} fill="currentColor" style={{ color: 'var(--brand-amber)' }} />}
      <span className="tag">{formatRating(item.metadata.rating)}</span>
      <button className="btn btn-ghost" onClick={() => navigate(`/player/${item.id}`)} aria-label={`播放 ${item.metadata.title}`}>
        <Play size={14} /> 播放
      </button>
    </div>
  );
}

export function LibraryPage() {
  const { kind = 'movie' } = useParams<{ kind: string }>();
  const mediaKind = (Object.keys(KIND_INTRO).includes(kind) ? kind : 'movie') as MediaKind;
  const items = useAppStore((s) => s.items);
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<ViewMode>('wall');
  const [genre, setGenre] = useState<string | 'all'>('all');

  const genres = useMemo(
    () => Array.from(new Set(items.filter((i) => i.kind === mediaKind).flatMap((i) => i.metadata.genres))).sort(),
    [items, mediaKind],
  );

  const filtered = useMemo(() => {
    const list = items.filter((i) => i.kind === mediaKind && (genre === 'all' || i.metadata.genres.includes(genre)));
    const sorted = [...list];
    switch (sort) {
      case 'year':
        sorted.sort((a, b) => (b.metadata.year ?? 0) - (a.metadata.year ?? 0));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.metadata.rating ?? 0) - (a.metadata.rating ?? 0));
        break;
      case 'title':
        sorted.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title, 'zh-CN'));
        break;
      default:
        sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    return sorted;
  }, [items, mediaKind, genre, sort]);

  return (
    <>
      {/* 头部与筛选工具内缩；下方幕墙本身保持左右全幅延展 */}
      <div className="wall-inset library-head">
        <PageHeader
          eyebrow="LIBRARY · 媒体库"
          title={`${KIND_LABEL[mediaKind]}库`}
          subtitle={`${KIND_INTRO[mediaKind]} 当前 ${filtered.length} 部作品`}
        />

        <div className="panel library-tools">
          <span className="row tiny"><SlidersHorizontal size={14} /> 筛选</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className={`tag ${genre === 'all' ? 'tag-accent' : ''}`} onClick={() => setGenre('all')}>全部</button>
            {genres.map((g) => (
              <button key={g} className={`tag ${genre === g ? 'tag-accent' : ''}`} onClick={() => setGenre(g)}>{g}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <Segmented
            value={sort}
            ariaLabel="排序"
            options={[
              { value: 'recent', label: '最近加入' },
              { value: 'year', label: '年份' },
              { value: 'rating', label: '评分' },
              { value: 'title', label: '名称' },
            ]}
            onChange={setSort}
          />
          <Segmented
            value={view}
            ariaLabel="视图切换"
            options={[
              { value: 'wall', label: '幕墙' },
              { value: 'list', label: '列表' },
            ]}
            onChange={setView}
          />
          <span className="tiny mono" style={{ whiteSpace: 'nowrap' }}>{filtered.length} 项</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="wall-inset">
          <EmptyState title="没有匹配的作品" description="试试清除类型筛选，或到媒体源管理中添加更多来源。" icon={view === 'wall' ? <LayoutGrid size={38} /> : <List size={38} />} />
        </div>
      ) : view === 'wall' ? (
        <MasonryWall items={filtered} heroEnabled={false} showToolbar emptyTitle="没有匹配的作品" />
      ) : (
        <div className="wall-inset"><div className="panel" style={{ padding: 8 }}>
          {filtered.map((item) => <ListRow key={item.id} item={item} />)}
        </div></div>
      )}
    </>
  );
}
