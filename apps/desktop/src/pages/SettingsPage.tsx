import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Monitor, PlayCircle, Captions, Volume2, Database, Activity, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Segmented } from '@/components/ui/Segmented';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useAppStore } from '@/stores/app-store';
import { getBridge } from '@/lib/bridge';
import { DEFAULT_SETTINGS } from '@yingmu/media-models';
import type { AppSettings, DiagnosticsReport, ThemeMode } from '@yingmu/media-models';

function SectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
      <span style={{ color: 'var(--accent)', marginTop: 2 }}>{icon}</span>
      <div>
        <h2 className="panel-title" style={{ margin: 0 }}>{title}</h2>
        <p className="tiny" style={{ margin: '2px 0 0' }}>{description}</p>
      </div>
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="spread" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem' }}>{label}</div>
        {hint && <div className="tiny" style={{ marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const isDemo = useAppStore((s) => s.isDemo);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | undefined>();

  useEffect(() => {
    let active = true;
    void getBridge().diagnosticsReport().then((report) => {
      if (active) setDiagnostics(report);
    });
    return () => {
      active = false;
    };
  }, []);

  const patch = (value: Partial<AppSettings>) => void setSettings(value);

  return (
    <>
      <PageHeader
        eyebrow="SETTINGS · 设置"
        title="设置"
        subtitle="所有偏好保存在用户数据目录，不写入程序安装目录。"
        actions={<button className="btn" onClick={() => patch(DEFAULT_SETTINGS)}><RotateCcw size={14} /> 恢复默认</button>}
      />

      <div className="grid-2">
        <div className="stack">
          <section className="panel">
            <SectionTitle icon={<Monitor size={18} />} title="外观" description="深色与浅色主题均完整实现，颜色来自统一 Design Tokens。" />
            <SettingRow label="主题" hint="跟随系统时使用操作系统偏好">
              <Segmented<ThemeMode>
                value={settings.theme}
                options={[
                  { value: 'dark', label: '深色' },
                  { value: 'light', label: '浅色' },
                  { value: 'system', label: '跟随系统' },
                ]}
                onChange={(theme) => patch({ theme })}
              />
            </SettingRow>
            <SettingRow label="界面语言"><span className="tag">{settings.language === 'zh-CN' ? '简体中文' : 'English'}</span></SettingRow>
          </section>

          <section className="panel">
            <SectionTitle icon={<PlayCircle size={18} />} title="播放" description="播放器后端参数；当前 libmpv 尚未集成，以下设置不会实际生效。" />
            <SettingRow label="硬件解码" hint="需在 Tauri 桌面端由 PlayerBackend 应用">
              <Segmented<AppSettings['hardwareDecoding']> value={settings.hardwareDecoding} options={[{ value: 'auto', label: '自动' }, { value: 'on', label: '开启' }, { value: 'off', label: '关闭' }]} onChange={(hardwareDecoding) => patch({ hardwareDecoding })} />
            </SettingRow>
            <SettingRow label="HDR 直通偏好" hint="不代表已具备 HDR 原生输出能力">
              <button className={`tag ${settings.preferHdrPassthrough ? 'tag-accent' : ''}`} onClick={() => patch({ preferHdrPassthrough: !settings.preferHdrPassthrough })}>
                {settings.preferHdrPassthrough ? '已开启（未验证）' : '关闭'}
              </button>
            </SettingRow>
            <SettingRow label="续播行为">
              <Segmented<AppSettings['resumeBehaviour']> value={settings.resumeBehaviour} options={[{ value: 'ask', label: '询问' }, { value: 'always', label: '总是' }, { value: 'never', label: '从不' }]} onChange={(resumeBehaviour) => patch({ resumeBehaviour })} />
            </SettingRow>
          </section>

          <section className="panel">
            <SectionTitle icon={<Captions size={18} />} title="字幕" description="ASS 特效与 PGS 图片字幕由原生渲染路径处理，不降级为纯文本。" />
            <SettingRow label="字号"><input type="number" min={12} max={72} value={settings.subtitleFontSize} onChange={(e) => patch({ subtitleFontSize: Number(e.target.value) })} style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)' }} /></SettingRow>
            <SettingRow label="字体"><input type="text" value={settings.subtitleFontFamily} onChange={(e) => patch({ subtitleFontFamily: e.target.value })} style={{ width: 140, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)' }} /></SettingRow>
            <SettingRow label="垂直位置"><span className="mono tiny">{settings.subtitlePosition}%</span></SettingRow>
            <SettingRow label="延迟"><span className="mono tiny">{settings.subtitleDelayMs} ms</span></SettingRow>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <SectionTitle icon={<Volume2 size={18} />} title="音频输出" description="区分软件解码、多声道 PCM 与 HDMI bitstream passthrough。" />
            <SettingRow label="输出模式">
              <select value={settings.audioOutput} onChange={(e) => patch({ audioOutput: e.target.value as AppSettings['audioOutput'] })} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                <option value="auto">自动（WASAPI 共享）</option>
                <option value="wasapi-shared">WASAPI 共享</option>
                <option value="wasapi-exclusive">WASAPI 独占</option>
                <option value="bitstream">HDMI Bitstream Passthrough</option>
              </select>
            </SettingRow>
            <StatusNotice title="音频能力状态">
              软件解码成功不等于原生音频直通。AC-3 / E-AC-3 / TrueHD / Atmos / E-AC-3 JOC 以及 DTS 系列的
              bitstream 传递需要 WASAPI 独占模式、驱动与 HDMI 设备共同支持；本项目<strong>未在本机实机验证</strong>，
              也未获得 Dolby 官方认证。
            </StatusNotice>
          </section>

          <section className="panel">
            <SectionTitle icon={<Database size={18} />} title="元数据与刮削" description="TMDB API Key 只从本地环境变量或安全配置读取。" />
            <SettingRow label="TMDB 配置"><span className={`tag ${settings.tmdbConfigured ? 'tag-accent' : ''}`}>{settings.tmdbConfigured ? '已配置' : '未配置'}</span></SettingRow>
            <SettingRow label="刮削来源"><span className="tiny">TMDB / 本地 NFO / 本地海报 / 手动修正</span></SettingRow>
            <p className="tiny" style={{ marginTop: 14, lineHeight: 1.7 }}>
              密钥不会被写入代码、日志、Git 远程地址或提交记录。刮削失败时保留原始文件信息。
            </p>
          </section>

          <section className="panel">
            <SectionTitle icon={<Activity size={18} />} title="诊断信息" description="由平台桥接实时返回，未探测到的能力一律标记为未验证。" />
            {diagnostics ? (
              <div className="stack" style={{ gap: 10 }}>
                <div className="spread"><span className="tiny muted">应用版本</span><span className="tiny mono">{diagnostics.appVersion}</span></div>
                <div className="spread"><span className="tiny muted">平台桥接</span><span className="tag">{isDemo ? 'WebDemoBridge' : 'TauriBridge'}</span></div>
                <div className="spread"><span className="tiny muted">播放器后端</span><span className="tag">{diagnostics.backend}</span></div>
                <div className="spread"><span className="tiny muted">后端就绪</span><span className="tag">{diagnostics.backendReady ? '是' : '否'}</span></div>
                <div className="spread"><span className="tiny muted">WebView2</span><span className="tiny mono">{diagnostics.webview2Version ?? '未探测'}</span></div>
                <div className="spread"><span className="tiny muted">数据库版本</span><span className="tiny mono">{diagnostics.dbVersion}</span></div>
                <div className="divider" style={{ margin: '4px 0' }} />
                <ul className="tiny" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                  {diagnostics.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            ) : (
              <div className="tiny">正在读取诊断信息…</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
