import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Heart, Pencil, ArrowLeft, Layers, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { LazyImage } from '@/components/ui/LazyImage';
import { useArtwork } from '@/hooks/use-artwork';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { useAppStore } from '@/stores/app-store';
import { formatBytes, formatDuration, formatRating, KIND_LABEL } from '@/lib/format';
import type { MediaVersion } from '@yingmu/media-models';

function VersionRow({ version, active, onSelect }: { version: MediaVersion; active: boolean; onSelect: () => void }) {
  const v = version.video;
  return (
    <button className="list-row" onClick={onSelect} style={{ borderColor: active ? 'var(--accent)' : 'transparent', background: active ? 'var(--surface)' : undefined, width: '100%', textAlign: 'left' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border-strong)', flex: 'none' }} />
      <div className="list-main">
        <div className="list-title">{version.label}</div>
        <div className="list-meta">
          {v?.codec} · {v?.width}×{v?.height} · {v?.bitDepth}bit · {version.container} · {formatBytes(version.sizeBytes)}
          {v?.hdrFormat && v.hdrFormat !== 'none' ? ` · ${v.hdrFormat === 'dolby-vision' ? 'Dolby Vision 标识' : v.hdrFormat.toUpperCase() + ' 标识'}` : ''}
        </div>
      </div>
      <span className="tiny mono">{version.audio.length} 音轨 / {version.subtitles.length} 字幕</span>
    </button>
  );
}

export function DetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const getItem = useAppStore((s) => s.getItem);
  const items = useAppStore((s) => s.items);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const focalOverrides = useAppStore((s) => s.focalOverrides);
  const setArtworkFocal = useAppStore((s) => s.setArtworkFocal);
  const focal = focalOverrides[id];
  const item = getItem(id);
  const backdrop = useArtwork(id, 'backdrop', 'xl');
  const poster = useArtwork(id, 'poster', 'lg');
  const reduceMotion = useMotionPreference();
  const [versionIndex, setVersionIndex] = useState(0);

  if (!item) {
    return <EmptyState title="找不到这部作品" description="它可能已从媒体库中移除。" action={<Link to="/" className="btn"><ArrowLeft size={14} /> 回到首页</Link>} />;
  }

  const version = item.versions[Math.min(versionIndex, item.versions.length - 1)]!;
  const v = version.video;
  const similar = items.filter((other) => other.id !== item.id && other.kind === item.kind).slice(0, 4);

  return (
    <>
      <Link to="/" className="btn btn-ghost" style={{ marginBottom: 16 }}><ArrowLeft size={14} /> 返回</Link>

      <div className="detail-hero">
        {backdrop && <LazyImage src={backdrop} alt="" className="detail-hero-art" />}
        <div className="detail-hero-scrim" />
        <div className="detail-hero-content">
          {/* 共享元素转场只在允许动效时开启；减少动效时保持静态，避免 layout 动画 */}
          <motion.div layoutId={reduceMotion ? undefined : `tile-${item.id}`} style={{ flex: 'none' }}>
            {poster && <img className="detail-poster" src={poster} alt={`${item.metadata.title} 海报`} />}
          </motion.div>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="tag tag-accent">{KIND_LABEL[item.kind]}</span>
              {item.metadata.genres.map((g) => <span className="tag" key={g}>{g}</span>)}
            </div>
            <h1 className="detail-title" style={{ marginTop: 14 }}>{item.metadata.title}</h1>
            <p className="detail-original">{item.metadata.originalTitle} · {item.metadata.year} · {formatDuration(version.durationSeconds)} · 评分 {formatRating(item.metadata.rating)}</p>
            <p className="detail-synopsis">{item.metadata.synopsis}</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/player/${item.id}`)}>
                <Play size={15} fill="currentColor" /> {item.resumeSeconds ? '继续播放' : '播放'}
              </button>
              {item.resumeSeconds != null && (
                <button className="btn" onClick={() => navigate(`/player/${item.id}?restart=1`)}>从头播放</button>
              )}
              <button className="btn" onClick={() => void toggleFavorite(item.id)}>
                <Heart size={15} fill={item.favorite ? 'currentColor' : 'none'} /> {item.favorite ? '已收藏' : '收藏'}
              </button>
              <Link to={`/edit/${item.id}`} className="btn"><Pencil size={14} /> 编辑信息</Link>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: 24 }}>
        <div className="stack">
          <section className="panel">
            <div className="spread" style={{ marginBottom: 16 }}>
              <h2 className="panel-title" style={{ margin: 0 }}><Layers size={17} style={{ verticalAlign: -3, marginRight: 8 }} />媒体版本</h2>
              <span className="tiny">{item.versions.length} 个版本 · 同一 Media ID</span>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              {item.versions.map((ver, index) => (
                <VersionRow key={ver.id} version={ver} active={index === versionIndex} onSelect={() => setVersionIndex(index)} />
              ))}
            </div>
            <div className="divider" />
            <div className="grid-2" style={{ gap: 12 }}>
              <div><div className="tiny">视频编码</div><div className="mono">{v?.codec ?? '—'} {v?.profile}</div></div>
              <div><div className="tiny">分辨率 / 帧率</div><div className="mono">{v?.width}×{v?.height} · {v?.frameRate ?? '—'} fps</div></div>
              <div><div className="tiny">色彩空间 / 位深</div><div className="mono">{v?.colorSpace ?? '—'} · {v?.bitDepth ?? '—'} bit</div></div>
              <div><div className="tiny">HDR 格式（仅文件识别）</div><div className="mono">{v?.hdrFormat ?? 'none'}{v?.dolbyVisionProfile ? ` · Profile ${v.dolbyVisionProfile}` : ''}</div></div>
              <div><div className="tiny">容器 / 大小</div><div className="mono">{version.container} · {formatBytes(version.sizeBytes)}</div></div>
              <div><div className="tiny">相对路径（源内）</div><div className="mono" style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{version.relativePath}</div></div>
            </div>
            <div style={{ marginTop: 16 }}>
              <StatusNotice tone="info" title="识别不等于输出">
                上方色彩与 HDR 字段来自媒体文件的容器/码流标识，仅代表「文件识别」层。
                解码、正确渲染、色调映射与原生信号输出均需单独实机验证；本项目当前未验证 Dolby Vision / HDR 原生输出，也未获得 Dolby 认证。
              </StatusNotice>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">音轨与字幕</h2>
            <div className="grid-2" style={{ gap: 20 }}>
              <div>
                <div className="tiny" style={{ marginBottom: 8 }}>音轨 {version.audio.length}</div>
                {version.audio.map((a) => (
                  <div key={a.index} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="tiny">{a.title ?? a.codec}</span>
                    <span className="tiny mono">{a.codec} · {a.channels}ch{a.isDefault ? ' · 默认' : ''}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 8 }}>字幕 {version.subtitles.length}</div>
                {version.subtitles.map((s) => (
                  <div key={s.index} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="tiny">{s.title ?? s.format}</span>
                    <span className="tiny mono">{s.format.toUpperCase()}{s.requiresNativeRendering ? ' · 原生渲染' : ''}{s.external ? ' · 外挂' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">作品信息</h2>
            <div className="stack" style={{ gap: 10, marginTop: 12 }}>
              <div className="spread"><span className="muted tiny">导演</span><span className="tiny">{item.metadata.directors.join('、') || '—'}</span></div>
              <div className="spread"><span className="muted tiny">编剧</span><span className="tiny">{item.metadata.writers.join('、') || '—'}</span></div>
              <div className="spread"><span className="muted tiny">主演</span><span className="tiny" style={{ textAlign: 'right' }}>{item.metadata.cast.join('、') || '—'}</span></div>
              <div className="spread"><span className="muted tiny">发行日期</span><span className="tiny mono">{item.metadata.releaseDate ?? '—'}</span></div>
              <div className="spread"><span className="muted tiny">季 / 集</span><span className="tiny mono">{item.metadata.seasonCount ?? '—'} / {item.metadata.episodeCount ?? '—'}</span></div>
              <div className="spread"><span className="muted tiny">元数据来源</span><span className="tag">{item.metadata.origin}</span></div>
              <div className="spread"><span className="muted tiny">Media ID</span><span className="tiny mono" style={{ fontSize: '0.65rem' }}>{item.id.slice(0, 13)}…</span></div>
              <div className="spread"><span className="muted tiny">播放次数</span><span className="tiny mono">{item.playCount}</span></div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">封面焦点</h2>
            <p className="panel-desc">选择磁贴裁剪时保留的画面区域；不同宽高比的磁贴都会按此焦点裁切，不会拉伸变形。</p>
            <div className="row" style={{ gap: 16, marginTop: 12, alignItems: 'center' }}>
              <div className="focal-grid" role="group" aria-label="封面焦点九宫格">
                {[20, 50, 80].flatMap((y) =>
                  [20, 50, 80].map((x) => (
                    <button
                      key={`${x}-${y}`}
                      className="focal-cell"
                      data-on={focal?.x === x && focal?.y === y}
                      onClick={() => setArtworkFocal(id, { x, y })}
                      aria-label={`焦点 ${x}% ${y}%`}
                      title={`${x}% / ${y}%`}
                    >
                      ·
                    </button>
                  )),
                )}
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="tiny muted">
                  {focal ? `当前 ${focal.x}% / ${focal.y}%` : '当前：自动（由内容稳定推导）'}
                </span>
                {focal && (
                  <button className="btn btn-ghost" onClick={() => setArtworkFocal(id, undefined)}>
                    恢复默认
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="panel-title">同类型作品</h2>
            <div className="stack" style={{ gap: 4, marginTop: 10 }}>
              {similar.map((other) => (
                <Link key={other.id} to={`/detail/${other.id}`} className="list-row" style={{ padding: '8px 10px' }}>
                  <Info size={13} className="tiny" />
                  <div className="list-main"><div className="list-title" style={{ fontSize: '0.8125rem' }}>{other.metadata.title}</div></div>
                  <span className="tiny mono">{other.metadata.year}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
