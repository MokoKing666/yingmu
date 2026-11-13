import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListVideo, Plus, Trash2, Play, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useAppStore } from '@/stores/app-store';
import { useArtwork } from '@/hooks/use-artwork';
import { LazyImage } from '@/components/ui/LazyImage';
import { formatDuration, KIND_LABEL } from '@/lib/format';
import type { MediaItem, PlaylistId } from '@yingmu/media-models';

function PlaylistPoster({ item }: { item: MediaItem }) {
  const src = useArtwork(item.id, 'poster', 'sm');
  return (
    <div style={{ width: 40, height: 58, borderRadius: 6, overflow: 'hidden', position: 'relative', flex: 'none' }}>
      {src && <LazyImage src={src} alt="" className="tile-art" />}
    </div>
  );
}

export function PlaylistsPage() {
  const playlists = useAppStore((s) => s.playlists);
  const items = useAppStore((s) => s.items);
  const savePlaylist = useAppStore((s) => s.savePlaylist);
  const removePlaylist = useAppStore((s) => s.removePlaylist);
  const [selectedId, setSelectedId] = useState<PlaylistId | undefined>(playlists[0]?.id);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');

  const selected = playlists.find((p) => p.id === selectedId) ?? playlists[0];
  const selectedItems = selected?.mediaIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is MediaItem => Boolean(item)) ?? [];
  const totalDuration = selectedItems.reduce((sum, item) => sum + (item.versions[0]?.durationSeconds ?? 0), 0);

  const createPlaylist = async () => {
    const name = draftName.trim();
    if (!name) return;
    const id = `pl-${Date.now().toString(36)}`;
    await savePlaylist({
      id,
      name,
      description: draftDesc.trim() || undefined,
      mediaIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSelectedId(id);
    setCreating(false);
    setDraftName('');
    setDraftDesc('');
  };

  return (
    <>
      <PageHeader
        eyebrow="PLAYLISTS · 播放列表"
        title="播放列表"
        subtitle={`${playlists.length} 个列表 · 顺序与内容保存在本地媒体数据库中`}
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> 新建列表</button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(0, 1.6fr)', gap: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          {playlists.length === 0 && <EmptyState title="还没有播放列表" icon={<ListVideo size={36} />} />}
          {playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="panel"
              onClick={() => setSelectedId(playlist.id)}
              style={{
                textAlign: 'left',
                padding: 18,
                borderColor: selected?.id === playlist.id ? 'var(--accent)' : undefined,
                boxShadow: selected?.id === playlist.id ? 'var(--shadow-glow)' : undefined,
              }}
            >
              <div className="spread">
                <strong>{playlist.name}</strong>
                <span className="tiny mono">{playlist.mediaIds.length} 项</span>
              </div>
              <div className="tiny" style={{ marginTop: 6 }}>{playlist.description || '暂无描述'}</div>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="panel">
            <div className="spread" style={{ marginBottom: 20 }}>
              <div>
                <h2 className="panel-title">{selected.name}</h2>
                <p className="panel-desc" style={{ margin: 0 }}>
                  {selectedItems.length} 部作品 · 合计 {formatDuration(totalDuration)} · 创建于 {selected.createdAt.slice(0, 10)}
                </p>
              </div>
              <div className="row">
                {selectedItems[0] && (
                  <Link to={`/player/${selectedItems[0].id}`} className="btn btn-primary"><Play size={14} fill="currentColor" /> 顺序播放</Link>
                )}
                <button className="icon-btn" title="删除列表" aria-label="删除列表" onClick={() => void removePlaylist(selected.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="divider" />
            {selectedItems.length === 0 ? (
              <EmptyState title="列表是空的" description="目前演示数据未向自定义列表添加条目；接入真实媒体库后可在详情页加入列表。" />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {selectedItems.map((item, index) => (
                  <Link key={item.id} to={`/detail/${item.id}`} className="list-row">
                    <span className="tiny mono" style={{ width: 20 }}>{String(index + 1).padStart(2, '0')}</span>
                    <PlaylistPoster item={item} />
                    <div className="list-main">
                      <div className="list-title">{item.metadata.title}</div>
                      <div className="list-meta">{item.metadata.year} · {KIND_LABEL[item.kind]} · {formatDuration(item.versions[0]?.durationSeconds)}</div>
                    </div>
                    <ArrowRight size={15} className="tiny" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="选择一个播放列表" icon={<ListVideo size={38} />} />
        )}
      </div>

      <Modal
        open={creating}
        title="新建播放列表"
        description="列表保存在本地，不会写入安装目录。"
        onClose={() => setCreating(false)}
        footer={
          <>
            <button className="btn" onClick={() => setCreating(false)}>取消</button>
            <button className="btn btn-primary" onClick={() => void createPlaylist()}>创建</button>
          </>
        }
      >
        <div className="stack">
          <label className="field">
            <span className="field-label">名称</span>
            <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="例如：周末长片" autoFocus />
          </label>
          <label className="field">
            <span className="field-label">描述（可选）</span>
            <input type="text" value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="这个列表适合什么时候看？" />
          </label>
        </div>
      </Modal>
    </>
  );
}
