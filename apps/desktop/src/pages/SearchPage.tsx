import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LazyImage } from '@/components/ui/LazyImage';
import { useArtwork } from '@/hooks/use-artwork';
import { getBridge } from '@/lib/bridge';
import { KIND_LABEL, KIND_ORDER } from '@/lib/format';
import type { MediaItem, MediaKind, SearchResult } from '@yingmu/media-models';

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark style={{ background: 'rgba(217,165,91,0.28)', color: 'inherit', borderRadius: 3 }}>{text.slice(index, index + query.trim().length)}</mark>
      {text.slice(index + query.trim().length)}
    </>
  );
}

function ResultRow({ item, query, snippet }: { item: MediaItem; query: string; snippet?: string }) {
  const src = useArtwork(item.id, 'poster', 'sm');
  return (
    <Link to={`/detail/${item.id}`} className="list-row" style={{ padding: 14 }}>
      <div style={{ width: 52, height: 74, borderRadius: 8, overflow: 'hidden', position: 'relative', flex: 'none', background: 'var(--surface)' }}>
        {src && <LazyImage src={src} alt="" className="tile-art" />}
      </div>
      <div className="list-main">
        <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}><Highlight text={item.metadata.title} query={query} /></div>
        <div className="tiny" style={{ marginTop: 2 }}>
          <Highlight text={item.metadata.originalTitle ?? ''} query={query} /> · {item.metadata.year} · {KIND_LABEL[item.kind]}
        </div>
        {snippet && <div className="tiny" style={{ marginTop: 6, opacity: 0.85 }}>{snippet}</div>}
      </div>
      <div className="row tiny" style={{ gap: 6 }}>
        {item.metadata.genres.slice(0, 2).map((g) => <span className="tag" key={g}>{g}</span>)}
      </div>
      <ArrowRight size={15} className="tiny" />
    </Link>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [draft, setDraft] = useState(query);
  const [kind, setKind] = useState<MediaKind | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [yearFrom, setYearFrom] = useState('');
  const [result, setResult] = useState<SearchResult>({ items: [], total: 0 });
  const [searching, setSearching] = useState(false);

  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    let active = true;
    setSearching(true);
    void getBridge()
      .search({
        text: query,
        kinds: kind === 'all' ? undefined : [kind],
        favoritesOnly,
        yearFrom: yearFrom ? Number(yearFrom) : undefined,
        limit: 60,
        offset: 0,
      })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult({ items: [], total: 0 });
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [query, kind, favoritesOnly, yearFrom]);

  const suggestions = useMemo(
    () => ['雾港', '纪录片', '4K', '动画', '2026'],
    [],
  );

  const submit = (text: string) => {
    const next = new URLSearchParams(params);
    if (text.trim()) next.set('q', text.trim());
    else next.delete('q');
    setParams(next);
  };

  return (
    <>
      <PageHeader
        eyebrow="SEARCH · 全文搜索"
        title="搜索媒体库"
        subtitle="真实实现使用 SQLite FTS5 全文索引；演示模式使用同等字段的本地匹配。"
      />

      <form
        className="search-input"
        style={{ height: 54, padding: '0 22px', marginBottom: 20, borderRadius: 'var(--radius-md)' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <Search size={19} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="片名、原名、导演、演员、类型、年份…" aria-label="搜索词" />
        <button className="btn btn-primary" type="submit">搜索</button>
      </form>

      <div className="panel" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '14px 20px', marginBottom: 20 }}>
        <span className="row tiny"><SlidersHorizontal size={14} /> 条件</span>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {(['all', ...KIND_ORDER] as const).map((k) => (
            <button key={k} className={`tag ${kind === k ? 'tag-accent' : ''}`} onClick={() => setKind(k)}>
              {k === 'all' ? '全部类型' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="row tiny" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> 仅收藏
        </label>
        <label className="row tiny" style={{ gap: 6 }}>
          年份 ≥ <input
            type="number"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
            placeholder="不限"
            style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)' }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <span className="tiny mono">{searching ? '检索中…' : `${result.total} 条结果`}</span>
      </div>

      {!query.trim() && (
        <div className="row" style={{ gap: 8, marginBottom: 20 }}>
          <span className="tiny">试试：</span>
          {suggestions.map((s) => <button key={s} className="tag" onClick={() => submit(s)}>{s}</button>)}
        </div>
      )}

      {result.items.length === 0 ? (
        <EmptyState
          title={query.trim() ? '没有找到匹配的作品' : '输入关键词开始搜索'}
          description={query.trim() ? '调整筛选条件，或搜索片名、导演、类型等其他字段。' : '支持中文片名、原始片名、导演、演员、类型与年份。'}
          icon={<Search size={38} />}
        />
      ) : (
        <div className="panel" style={{ padding: 8 }}>
          {result.items.map((item) => (
            <ResultRow key={item.id} item={item} query={query} snippet={result.snippets?.[item.id]} />
          ))}
        </div>
      )}
    </>
  );
}
