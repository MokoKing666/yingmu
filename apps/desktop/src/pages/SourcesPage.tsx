import { useState } from 'react';
import { HardDrive, Plus, Trash2, RefreshCw, PlugZap, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useAppStore } from '@/stores/app-store';
import type { MediaKind, MediaSource, SourceProtocol } from '@yingmu/media-models';
import { KIND_LABEL, KIND_ORDER } from '@/lib/format';

const PROTOCOL_LABEL: Record<SourceProtocol, string> = {
  local: '本地磁盘',
  unc: 'Windows UNC',
  smb: 'SMB 2/3',
  webdav: 'WebDAV',
};

const STATUS_LABEL: Record<MediaSource['status'], string> = {
  connected: '已连接',
  disconnected: '未连接',
  error: '错误',
  scanning: '扫描中',
};

export function SourcesPage() {
  const sources = useAppStore((s) => s.sources);
  const addSource = useAppStore((s) => s.addSource);
  const removeSource = useAppStore((s) => s.removeSource);
  const testSource = useAppStore((s) => s.testSource);
  const startScan = useAppStore((s) => s.startScan);
  const pushToast = useAppStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<SourceProtocol>('local');
  const [uri, setUri] = useState('');
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [kinds, setKinds] = useState<MediaKind[]>(['movie', 'tv']);

  const create = async () => {
    if (!name.trim()) return;
    await addSource({
      name: name.trim(),
      protocol,
      uri: uri.trim() || `${PROTOCOL_LABEL[protocol]} / 未配置地址`,
      kinds,
      enabled: true,
      requiresAuth,
    });
    setOpen(false);
    setName('');
    setUri('');
    setRequiresAuth(false);
  };

  const test = async (id: string) => {
    const result = await testSource(id);
    pushToast(result.message, result.ok ? 'success' : 'info');
  };

  return (
    <>
      <PageHeader
        eyebrow="SOURCES · 媒体源管理"
        title="媒体源"
        subtitle="本地硬盘、外接硬盘、UNC 网络路径、SMB 2/3 与 WebDAV；Provider 接口为 NFS / FTP / SFTP / Jellyfin / Emby / Plex 预留扩展。"
        actions={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> 添加媒体源</button>}
      />

      <StatusNotice title="网络协议与扫描能力尚未在本机验证">
        当前运行在 WebDemoBridge，不会访问真实文件系统或网络。UNC / SMB / WebDAV 的 Provider 接口与增量扫描逻辑由 Rust 媒体核心实现，
        本页只管理源的配置记录；凭据一律通过安全配置存储注入，绝不写入配置文件、日志或仓库。
      </StatusNotice>

      <div className="panel" style={{ marginTop: 24, padding: 8 }}>
        {sources.length === 0 && <div className="empty-state">还没有媒体源</div>}
        {sources.map((source) => (
          <div key={source.id} className="list-row" style={{ padding: 16 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', display: 'grid', placeItems: 'center', flex: 'none' }}>
              <HardDrive size={18} />
            </span>
            <div className="list-main">
              <div className="list-title">{source.name}</div>
              <div className="list-meta">{PROTOCOL_LABEL[source.protocol]} · {source.uri} · 扫描类型 {source.kinds.map((k) => KIND_LABEL[k]).join('/') || '未指定'}</div>
            </div>
            <div className="row tiny" style={{ gap: 8 }}>
              <span className={`tag ${source.status === 'connected' ? 'tag-accent' : ''}`}>{STATUS_LABEL[source.status]}</span>
              {source.requiresAuth && <span className="tag" title="凭据由安全存储注入"><ShieldCheck size={12} /> 需凭据</span>}
            </div>
            <span className="tiny mono" style={{ width: 90, textAlign: 'right' }}>{source.itemCount} 项</span>
            <button className="icon-btn" title="测试连接" aria-label="测试连接" onClick={() => void test(source.id)}><PlugZap size={15} /></button>
            <button className="icon-btn" title="开始扫描" aria-label="开始扫描" onClick={() => void startScan(source.id)}><RefreshCw size={15} /></button>
            <button className="icon-btn" title="移除" aria-label="移除媒体源" onClick={() => void removeSource(source.id)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="grid-3" style={{ marginTop: 24 }}>
        {(['local', 'unc', 'smb', 'webdav'] as SourceProtocol[]).map((p) => (
          <div className="panel" key={p} style={{ padding: 18 }}>
            <div className="tiny" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>PROVIDER</div>
            <h3 className="panel-title" style={{ margin: '6px 0' }}>{PROTOCOL_LABEL[p]}</h3>
            <p className="tiny" style={{ lineHeight: 1.7, margin: 0 }}>
              {p === 'local' && '递归扫描本地与外接硬盘，检测新增、删除与移动，支持断点恢复。'}
              {p === 'unc' && 'Windows 网络共享路径，凭据由系统安全存储提供。'}
              {p === 'smb' && 'SMB 2/3 连接管理、超时重试与断线状态，尚未在本机实机验证。'}
              {p === 'webdav' && 'WebDAV 目录枚举与范围读取，尚未在本机实机验证。'}
            </p>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        title="添加媒体源"
        description="只保存配置，不保存密码。凭据请在设置中通过安全配置存储注入。"
        onClose={() => setOpen(false)}
        footer={<><button className="btn" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" onClick={() => void create()}>添加</button></>}
      >
        <div className="stack">
          <label className="field"><span className="field-label">名称</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：客厅 NAS" autoFocus /></label>
          <div className="grid-2">
            <label className="field"><span className="field-label">协议</span>
              <select value={protocol} onChange={(e) => setProtocol(e.target.value as SourceProtocol)}>
                {(Object.keys(PROTOCOL_LABEL) as SourceProtocol[]).map((p) => <option key={p} value={p}>{PROTOCOL_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="field"><span className="field-label">地址（不含凭据）</span><input type="text" value={uri} onChange={(e) => setUri(e.target.value)} placeholder="例如：共享名称 或 https://host/dav" /></label>
          </div>
          <div className="field">
            <span className="field-label">允许扫描的媒体类型</span>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  className={`tag ${kinds.includes(k) ? 'tag-accent' : ''}`}
                  onClick={() => setKinds((current) => current.includes(k) ? current.filter((x) => x !== k) : [...current, k])}
                >{KIND_LABEL[k]}</button>
              ))}
            </div>
          </div>
          <label className="row tiny" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={requiresAuth} onChange={(e) => setRequiresAuth(e.target.checked)} /> 该来源需要凭据（稍后通过安全配置注入）
          </label>
        </div>
      </Modal>
    </>
  );
}
