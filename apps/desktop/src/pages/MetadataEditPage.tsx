import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Search, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useAppStore } from '@/stores/app-store';
import type { MediaMetadata } from '@yingmu/media-models';

interface Draft {
  title: string;
  originalTitle: string;
  year: string;
  synopsis: string;
  directors: string;
  cast: string;
  genres: string;
  rating: string;
  releaseDate: string;
  posterPath: string;
  backdropPath: string;
  tmdbId: string;
}

function fromMetadata(m: MediaMetadata): Draft {
  return {
    title: m.title,
    originalTitle: m.originalTitle ?? '',
    year: String(m.year ?? ''),
    synopsis: m.synopsis ?? '',
    directors: m.directors.join('、'),
    cast: m.cast.join('、'),
    genres: m.genres.join('、'),
    rating: m.rating != null ? String(m.rating) : '',
    releaseDate: m.releaseDate ?? '',
    posterPath: m.posterPath ?? '',
    backdropPath: m.backdropPath ?? '',
    tmdbId: m.externalIds?.tmdb ?? '',
  };
}

const EMPTY: Draft = {
  title: '', originalTitle: '', year: '', synopsis: '', directors: '', cast: '',
  genres: '', rating: '', releaseDate: '', posterPath: '', backdropPath: '', tmdbId: '',
};

function splitList(value: string): string[] {
  return value.split(/[、,，]/).map((part) => part.trim()).filter(Boolean);
}

export function MetadataEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const getItem = useAppStore((s) => s.getItem);
  const updateMetadata = useAppStore((s) => s.updateMetadata);
  const item = getItem(id);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [matchQuery, setMatchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setDraft(fromMetadata(item.metadata));
  }, [item]);

  if (!item) {
    return <EmptyState title="找不到这部作品" action={<Link to="/" className="btn"><ArrowLeft size={14} /> 回到首页</Link>} />;
  }

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await updateMetadata(id, {
        title: draft.title.trim() || item.metadata.title,
        originalTitle: draft.originalTitle.trim() || undefined,
        year: draft.year ? Number(draft.year) : undefined,
        synopsis: draft.synopsis.trim() || undefined,
        directors: splitList(draft.directors),
        cast: splitList(draft.cast),
        writers: item.metadata.writers,
        genres: splitList(draft.genres),
        rating: draft.rating ? Number(draft.rating) : undefined,
        releaseDate: draft.releaseDate || undefined,
        posterPath: draft.posterPath || undefined,
        backdropPath: draft.backdropPath || undefined,
        externalIds: draft.tmdbId ? { ...item.metadata.externalIds, tmdb: draft.tmdbId } : item.metadata.externalIds,
      });
      navigate(`/detail/${id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="METADATA · 媒体信息编辑"
        title={`编辑《${item.metadata.title}》`}
        subtitle="手动修正匹配结果；刮削失败不会覆盖或破坏原始文件信息。"
        actions={<Link to={`/detail/${id}`} className="btn"><ArrowLeft size={14} /> 返回详情</Link>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.6fr)', gap: 24 }}>
        <div className="panel stack">
          <h2 className="panel-title">基础信息</h2>
          <div className="grid-2">
            <label className="field"><span className="field-label">中文名称</span><input type="text" value={draft.title} onChange={(e) => set('title')(e.target.value)} /></label>
            <label className="field"><span className="field-label">原始名称</span><input type="text" value={draft.originalTitle} onChange={(e) => set('originalTitle')(e.target.value)} /></label>
            <label className="field"><span className="field-label">年份</span><input type="number" value={draft.year} onChange={(e) => set('year')(e.target.value)} /></label>
            <label className="field"><span className="field-label">评分（0–10）</span><input type="number" step="0.1" value={draft.rating} onChange={(e) => set('rating')(e.target.value)} /></label>
            <label className="field"><span className="field-label">发行日期</span><input type="text" value={draft.releaseDate} onChange={(e) => set('releaseDate')(e.target.value)} placeholder="YYYY-MM-DD" /></label>
            <label className="field"><span className="field-label">类型（用、分隔）</span><input type="text" value={draft.genres} onChange={(e) => set('genres')(e.target.value)} /></label>
          </div>
          <label className="field"><span className="field-label">简介</span><textarea rows={5} value={draft.synopsis} onChange={(e) => set('synopsis')(e.target.value)} /></label>
          <div className="grid-2">
            <label className="field"><span className="field-label">导演（用、分隔）</span><input type="text" value={draft.directors} onChange={(e) => set('directors')(e.target.value)} /></label>
            <label className="field"><span className="field-label">演员（用、分隔）</span><input type="text" value={draft.cast} onChange={(e) => set('cast')(e.target.value)} /></label>
          </div>
          <div className="divider" />
          <h2 className="panel-title">图片与外部标识</h2>
          <div className="grid-2">
            <label className="field"><span className="field-label">海报路径 / URL</span><input type="text" value={draft.posterPath} onChange={(e) => set('posterPath')(e.target.value)} placeholder="留空使用本地海报" /></label>
            <label className="field"><span className="field-label">背景图路径 / URL</span><input type="text" value={draft.backdropPath} onChange={(e) => set('backdropPath')(e.target.value)} /></label>
          </div>
          <label className="field"><span className="field-label">TMDB ID（手动修正匹配）</span><input type="text" value={draft.tmdbId} onChange={(e) => set('tmdbId')(e.target.value)} placeholder="仅保存标识，不发起网络请求" /></label>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn" onClick={() => setDraft(fromMetadata(item.metadata))}><RotateCcw size={14} /> 还原</button>
            <button className="btn btn-primary" disabled={saving} onClick={() => void save()}><Save size={14} /> {saving ? '保存中…' : '保存修改'}</button>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <h2 className="panel-title">手动搜索 / 重新匹配</h2>
            <p className="panel-desc">TMDB、本地 NFO、本地海报与自动匹配的完整刮削由 Rust Metadata Engine 提供。此页面只保存你手动填写的字段。</p>
            <div className="search-input" style={{ marginBottom: 12 }}>
              <Search size={15} />
              <input value={matchQuery} onChange={(e) => setMatchQuery(e.target.value)} placeholder="输入片名搜索匹配" />
            </div>
            <button className="btn" style={{ width: '100%' }} onClick={() => set('title')(matchQuery || draft.title)}>
              以输入内容作为片名填入
            </button>
          </div>
          <StatusNotice title="刮削功能状态">
            API Key 必须从本地环境变量或安全配置读取，绝不会硬编码或提交到仓库。当前演示桥接模式下不发起任何网络请求，
            TMDB 自动匹配、NFO 解析与图片缓存需在 Tauri 桌面端由 Rust 核心执行；这些能力目前<strong>未在本机验证</strong>。
          </StatusNotice>
          <div className="panel">
            <h2 className="panel-title">原始文件信息（只读）</h2>
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              <div className="spread"><span className="tiny muted">Media ID</span><span className="tiny mono">{item.id.slice(0, 18)}…</span></div>
              <div className="spread"><span className="tiny muted">版本数</span><span className="tiny mono">{item.versions.length}</span></div>
              <div className="spread"><span className="tiny muted">入库时间</span><span className="tiny mono">{item.addedAt.slice(0, 10)}</span></div>
            </div>
            <p className="tiny" style={{ marginTop: 14, lineHeight: 1.7 }}>刮削失败时以上信息保持原样，不会被清空或覆盖。</p>
          </div>
        </div>
      </div>
    </>
  );
}
