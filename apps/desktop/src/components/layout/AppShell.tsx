import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Search, Film, Tv, Clapperboard, Mountain, Video, Clock3, Heart,
  ListVideo, History, HardDrive, Settings, Sun, Moon, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrandLockup } from '@/components/Logo';
import { ToastStack } from '@/components/ui/ToastStack';
import { useAppStore } from '@/stores/app-store';
import { DEMO_DATA_DISCLAIMER } from '@/lib/demo-data';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  end?: boolean;
}

interface NavSection {
  label: string;
  entries: NavEntry[];
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const items = useAppStore((s) => s.items);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const isDemo = useAppStore((s) => s.isDemo);
  const [query, setQuery] = useState('');

  const sections: NavSection[] = [
    {
      label: '发现',
      entries: [
        { to: '/', label: '首页', icon: Home, end: true },
        { to: '/search', label: '搜索', icon: Search },
      ],
    },
    {
      label: '媒体库',
      entries: [
        { to: '/library/movie', label: '电影库', icon: Film, count: items.filter((i) => i.kind === 'movie').length },
        { to: '/library/tv', label: '电视剧库', icon: Tv, count: items.filter((i) => i.kind === 'tv').length },
        { to: '/library/anime', label: '动画库', icon: Clapperboard, count: items.filter((i) => i.kind === 'anime').length },
        { to: '/library/documentary', label: '纪录片库', icon: Mountain, count: items.filter((i) => i.kind === 'documentary').length },
        { to: '/library/personal', label: '个人视频库', icon: Video, count: items.filter((i) => i.kind === 'personal').length },
      ],
    },
    {
      label: '我的',
      entries: [
        { to: '/recent', label: '最近播放', icon: Clock3 },
        { to: '/favorites', label: '收藏', icon: Heart, count: items.filter((i) => i.favorite).length },
        { to: '/playlists', label: '播放列表', icon: ListVideo },
        { to: '/history', label: '播放历史', icon: History },
      ],
    },
    {
      label: '管理',
      entries: [
        { to: '/sources', label: '媒体源管理', icon: HardDrive },
        { to: '/settings', label: '设置', icon: Settings },
      ],
    },
  ];

  const toggleTheme = () => {
    void setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <BrandLockup />
        {sections.map((section) => (
          <nav key={section.label} aria-label={section.label}>
            <div className="nav-group-label">{section.label}</div>
            {section.entries.map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.end}
                className="nav-item"
                data-active={undefined}
                style={({ isActive }) => ({ boxShadow: isActive ? 'inset 2px 0 0 var(--brand-amber)' : undefined })}
              >
                <entry.icon size={17} strokeWidth={1.8} />
                <span>{entry.label}</span>
                {entry.count != null && entry.count > 0 && <span className="nav-count">{entry.count}</span>}
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="sidebar-footer">
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <Info size={12} /> 影幕 v0.1.0 · Windows x64
          </div>
          <div>{isDemo ? 'WebDemoBridge · 演示模式' : 'TauriBridge · 桌面模式'}</div>
          <div>播放器后端：未集成</div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <form
            className="search-input"
            style={{ width: 320 }}
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索片名、导演、演员…"
              aria-label="搜索媒体库"
            />
          </form>

          <div style={{ flex: 1 }} />

          {isDemo && (
            <span className="demo-badge" title={DEMO_DATA_DISCLAIMER}>
              演示数据
            </span>
          )}
          <button className="icon-btn" onClick={toggleTheme} aria-label="切换深浅主题" title="切换深浅主题">
            {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <NavLink to="/settings" className="icon-btn" aria-label="打开设置">
            <Settings size={18} />
          </NavLink>
        </header>

        <main className="page-scroll" id="page-scroll">
          {children}
        </main>
      </div>

      <ToastStack />
    </div>
  );
}
