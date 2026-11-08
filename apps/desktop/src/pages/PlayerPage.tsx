import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Subtitles, AudioLines, ListVideo, Info, Maximize2, X, RotateCcw, Gauge,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useArtwork } from '@/hooks/use-artwork';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { useAppStore } from '@/stores/app-store';
import { usePlayerStore } from '@/stores/player-store';
import { formatClock, formatDuration, formatBytes } from '@/lib/format';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const items = useAppStore((s) => s.items);
  const playlists = useAppStore((s) => s.playlists);
  const item = items.find((i) => i.id === id);

  const player = usePlayerStore();
  const backdrop = useArtwork(id, 'backdrop', 'xl');
  const poster = useArtwork(id, 'poster', 'md');
  const reduceMotion = useMotionPreference();
  const version = item?.versions[0];
  const duration = version?.durationSeconds ?? 0;

  useEffect(() => {
    if (!item) return;
    player.open(item.id, version?.id);
    player.setDuration(duration);
    player.seek(params.get('restart') === '1' ? 0 : (item.resumeSeconds ?? 0));
    // 只在进入/切换媒体时重置，避免控制栏交互被覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, item?.id]);

  if (!item || !version) {
    return <EmptyState title="找不到可播放的媒体" action={<Link to="/" className="btn"><ArrowLeft size={14} /> 回到首页</Link>} />;
  }

  const currentIndex = items.findIndex((i) => i.id === item.id);
  const nextItem = items[(currentIndex + 1) % items.length];
  const prevItem = items[(currentIndex - 1 + items.length) % items.length];

  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(player.speed);
    player.setSpeed(SPEEDS[(index + 1) % SPEEDS.length]!);
  };

  const panels: Array<{ key: NonNullable<typeof player.activePanel>; label: string; icon: typeof Info }> = [
    { key: 'info', label: '视频信息', icon: Info },
    { key: 'subtitles', label: '字幕', icon: Subtitles },
    { key: 'audio', label: '音轨', icon: AudioLines },
    { key: 'chapters', label: '章节', icon: ListVideo },
    { key: 'playlist', label: '播放列表', icon: Gauge },
  ];

  return (
    <div className="player-page">
      <div className="player-backdrop">{backdrop && <img src={backdrop} alt="" />}</div>
      <div className="player-vignette" />

      <div className="player-topbar">
        <Link to={`/detail/${item.id}`} className="player-back"><ArrowLeft size={15} /> 返回详情</Link>
        <div style={{ flex: 1 }} />
        <span className="tag" style={{ background: 'rgba(119,184,216,0.12)', borderColor: 'rgba(119,184,216,0.4)', color: 'var(--accent)' }}>
          PlayerBackend · 未集成
        </span>
      </div>

      <div className="player-center">
        {poster && <img className="player-center-poster" src={poster} alt={`${item.metadata.title} 海报`} />}
        <h1>{item.metadata.title}</h1>
        <p className="player-original">{item.metadata.originalTitle} · {item.metadata.year} · {formatDuration(duration)}</p>
        <div className="player-notice">
          <strong>播放器后端未集成，本页为控制界面预览。</strong><br />
          原生视频 Surface 需要 libmpv + D3D11 + WebView2 在 Tauri 窗口中嵌入验证；本阶段尚未完成该技术验证，
          因此不会解码任何文件、不会推进播放时间，也不会生成实时解码统计。
          控制栏的所有交互只改变界面状态，不代表实际播放行为。HDR / Dolby Vision / Dolby Audio 的
          解码、渲染与原生输出能力均未实机验证，亦未获得 Dolby 官方认证。
        </div>
      </div>

      <div className="player-controls">
        <div className="player-seek">
          <span className="player-time">{formatClock(player.positionSeconds)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            value={player.positionSeconds}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="播放进度"
          />
          <span className="player-time">{formatClock(duration)}</span>
        </div>

        <div className="player-button-row">
          <button className="player-pbutton player-pbutton-primary" onClick={player.togglePause} aria-label={player.paused ? '播放' : '暂停'}>
            {player.paused ? <Play size={19} fill="currentColor" /> : <Pause size={19} fill="currentColor" />}
          </button>
          <button className="player-pbutton" title="上一集 / 上一部" aria-label="上一个" onClick={() => prevItem && navigate(`/player/${prevItem.id}`)}><SkipBack size={17} /></button>
          <button className="player-pbutton" title="下一集 / 下一部" aria-label="下一个" onClick={() => nextItem && navigate(`/player/${nextItem.id}`)}><SkipForward size={17} /></button>
          <button className="player-pbutton" title="从头播放" aria-label="从头播放" onClick={() => player.seek(0)}><RotateCcw size={16} /></button>

          <button className="player-pbutton" title={player.muted ? '取消静音' : '静音'} aria-label="静音" onClick={player.toggleMute}>
            {player.muted || player.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            className="player-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={player.muted ? 0 : player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="音量"
          />
          <button className="player-speed" onClick={cycleSpeed} title="倍速">{player.speed.toFixed(2)}×</button>

          <div style={{ flex: 1 }} />
          {panels.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className="player-pbutton"
              data-active={player.activePanel === key}
              title={label}
              aria-label={label}
              onClick={() => player.togglePanel(key)}
            ><Icon size={17} /></button>
          ))}
          <button className="player-pbutton" title="全屏" aria-label="全屏" onClick={player.toggleFullscreen}><Maximize2 size={17} /></button>
        </div>
      </div>

      <AnimatePresence>
        {player.activePanel && (
          <motion.aside
            className="player-panel"
            initial={reduceMotion ? false : { x: 340, opacity: 0 }}
            animate={reduceMotion ? undefined : { x: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { x: 340, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <button className="player-pbutton player-panel-close" onClick={() => player.togglePanel(player.activePanel!)} aria-label="关闭面板"><X size={17} /></button>
            <h3>{panels.find((p) => p.key === player.activePanel)?.label}</h3>
            <p className="panel-desc">数据来自媒体文件的容器/码流识别，不代表实际解码或输出能力。</p>

            {player.activePanel === 'info' && (
              <>
                <div className="player-panel-item"><span>视频编码</span><span className="mono">{version.video?.codec ?? '—'}</span></div>
                <div className="player-panel-item"><span>分辨率</span><span className="mono">{version.video?.width}×{version.video?.height}</span></div>
                <div className="player-panel-item"><span>帧率</span><span className="mono">{version.video?.frameRate ?? '—'} fps</span></div>
                <div className="player-panel-item"><span>位深 / 色彩</span><span className="mono">{version.video?.bitDepth}bit · {version.video?.colorSpace}</span></div>
                <div className="player-panel-item"><span>HDR 标识</span><span className="mono">{version.video?.hdrFormat ?? 'none'}</span></div>
                <div className="player-panel-item"><span>DV Profile 标识</span><span className="mono">{version.video?.dolbyVisionProfile ?? '—'}</span></div>
                <div className="player-panel-item"><span>容器 / 大小</span><span className="mono">{version.container} · {formatBytes(version.sizeBytes)}</span></div>
                <div className="divider" />
                <div className="tiny" style={{ marginBottom: 10 }}>实时解码信息</div>
                <div className="player-stat-empty">
                  当前没有连接 PlayerBackend，因此没有 FPS、丢帧、缓冲状态、硬件解码状态或输出像素格式数据。
                  这些字段只有在 libmpv 原生 Surface 集成并实机验证后才会被填充，此处不填充任何占位数值。
                </div>
              </>
            )}

            {player.activePanel === 'subtitles' && (
              <>
                {version.subtitles.map((track, index) => (
                  <button key={track.index} className="player-panel-item" data-active={player.subtitleTrackIndex === index} onClick={() => player.setSubtitleTrack(index)}>
                    <span>{track.title ?? track.format}</span>
                    <span className="mono tiny">{track.format.toUpperCase()}{track.external ? ' · 外挂' : ''}{track.requiresNativeRendering ? ' · 原生渲染' : ''}</span>
                  </button>
                ))}
                <button className="player-panel-item" onClick={() => player.setSubtitleTrack(null)}><span>关闭字幕</span><span className="mono tiny">OFF</span></button>
                <div className="divider" />
                <div className="player-panel-item"><span>字幕延迟</span><span className="mono">{player.subtitleDelayMs} ms</span></div>
                <input type="range" min={-5000} max={5000} step={100} value={player.subtitleDelayMs} onChange={(e) => player.setSubtitleDelay(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} aria-label="字幕延迟" />
                <p className="tiny" style={{ marginTop: 12, lineHeight: 1.7 }}>ASS 特效与 PGS 图片字幕保留原生渲染路径，不降级为纯文本。</p>
              </>
            )}

            {player.activePanel === 'audio' && (
              <>
                {version.audio.map((track, index) => (
                  <button key={track.index} className="player-panel-item" data-active={player.audioTrackIndex === index} onClick={() => player.setAudioTrack(index)}>
                    <span>{track.title ?? track.codec}</span>
                    <span className="mono tiny">{track.codec} · {track.channels}ch</span>
                  </button>
                ))}
                <div className="divider" />
                <div className="player-stat-empty">
                  音轨列表来自文件识别。WASAPI 共享 / 独占 / HDMI bitstream passthrough 与 Atmos 传递均需实机验证；
                  软件解码成功不等于原生音频直通。
                </div>
              </>
            )}

            {player.activePanel === 'chapters' && version.chapters.map((chapter) => (
              <button key={chapter.index} className="player-panel-item" onClick={() => player.seek(chapter.startSeconds)}>
                <span>{String(chapter.index + 1).padStart(2, '0')} · {chapter.title}</span>
                <span className="mono tiny">{formatClock(chapter.startSeconds)}</span>
              </button>
            ))}

            {player.activePanel === 'playlist' && (
              <>
                {playlists.map((playlist) => (
                  <div key={playlist.id} className="player-panel-item"><span>{playlist.name}</span><span className="mono tiny">{playlist.mediaIds.length} 项</span></div>
                ))}
                <div className="divider" />
                {items.slice(Math.max(0, currentIndex), currentIndex + 6).map((other) => (
                  <button key={other.id} className="player-panel-item" data-active={other.id === item.id} onClick={() => navigate(`/player/${other.id}`)}>
                    <span>{other.metadata.title}</span><span className="mono tiny">{formatDuration(other.versions[0]?.durationSeconds)}</span>
                  </button>
                ))}
              </>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
