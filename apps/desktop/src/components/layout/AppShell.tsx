import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Home, Search, Film, Tv, Clapperboard, Mountain, Video, Clock3, Heart,
  ListVideo, History, HardDrive, Settings, Sun, Moon, Info, Menu, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion as motionTokens } from '@yingmu/design-tokens';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { BrandLockup, LogoMark } from '@/components/Logo';
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

/** 使用动态拼贴画布的页面：左右零留白，磁贴延伸到窗口边缘 */
function isFullBleedRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/library/') || pathname === '/favorites';
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = useAppStore((s) => s.items);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const isDemo = useAppStore((s) => s.isDemo);
  const [query, setQuery] = useState('');
  // 支持通过 URL 参数强制展开导航，便于演示、截图与分享（不写入用户偏好）
  const hashQuery = typeof window !== 'undefined' ? window.location.hash.split('?')[1] ?? '' : '';
  const [drawerOpen, setDrawerOpen] = useState(
    new URLSearchParams(hashQuery).get('nav') === 'open',
  );
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstRoute = useRef(true);
  // 全项目统一的动效开关：导航抽屉与遮罩也必须遵守减少动态效果设置
  const reduceMotion = useMotionPreference();

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

  // 鼠标与键盘均可呼出导航；输入框聚焦时不劫持快捷键
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (typing) return;
      if (event.key === '[' || (event.ctrlKey && event.key.toLowerCase() === 'b')) {
        event.preventDefault();
        setDrawerOpen((open) => !open);
      } else if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 切换页面后自动收起抽屉（首次挂载保留 URL 指定的演示状态）
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    setDrawerOpen(false);
  }, [location.pathname]);

  const fullBleed = isFullBleedRoute(location.pathname);

  return (
    <div className="app-shell">
      {/* 默认折叠的精简轨道：悬浮覆盖，不占画布宽度 */}
      <div className="nav-rail" aria-label="精简导航">
        <button
          className="nav-rail-btn"
          onClick={() => setDrawerOpen(true)}
          title="展开导航（[ 或 Ctrl+B）"
          aria-label="展开导航"
          data-on={drawerOpen}
        >
          <Menu size={18} />
        </button>
        <span title="影幕 YingMu" style={{ display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
          <LogoMark size={22} aria-hidden="true" />
        </span>
        <button className="nav-rail-btn" onClick={() => navigate('/')} title="首页" aria-label="首页">
          <Home size={17} />
        </button>
        <button className="nav-rail-btn" onClick={() => searchRef.current?.focus()} title="搜索（/）" aria-label="搜索">
          <Search size={17} />
        </button>
        <button className="nav-rail-btn" onClick={toggleTheme} title="切换深浅主题" aria-label="切换深浅主题">
          {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>

      {/* 展开抽屉：浮层覆盖，动画自然，不影响磁贴拖拽与键盘导航 */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="nav-scrim"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              className="nav-drawer"
              aria-label="主导航"
              initial={reduceMotion ? false : { x: -300 }}
              animate={reduceMotion ? undefined : { x: 0 }}
              exit={reduceMotion ? undefined : { x: -300 }}
              transition={reduceMotion ? { duration: 0 } : motionTokens.cardExpand}
            >
              <div className="spread" style={{ padding: '0 var(--space-2) var(--space-4)' }}>
                <BrandLockup size={30} />
                <button className="nav-rail-btn" onClick={() => setDrawerOpen(false)} aria-label="收起导航" title="收起导航">
                  <X size={17} />
                </button>
              </div>
              {sections.map((section) => (
                <nav key={section.label} aria-label={section.label}>
                  <div className="nav-group-label">{section.label}</div>
                  {section.entries.map((entry) => (
                    <NavLink
                      key={entry.to}
                      to={entry.to}
                      end={entry.end}
                      className="nav-item"
                      style={({ isActive }) => ({
                        boxShadow: isActive ? 'inset 2px 0 0 var(--accent)' : undefined,
                        background: isActive ? 'var(--surface)' : undefined,
                      })}
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
                  <Info size={12} /> 影幕 v{__APP_VERSION__} · Windows x64
                </div>
                <div>{isDemo ? 'WebDemoBridge · 演示模式' : 'TauriBridge · 桌面模式'}</div>
                <div>播放器后端：未集成</div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 悬浮式搜索与工具胶囊，不占画布高度 */}
      <header className="floating-topbar">
        <form
          className="search-input"
          style={{ width: 264 }}
          onSubmit={(event) => {
            event.preventDefault();
            navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          }}
        >
          <Search size={16} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索片名、导演、演员…"
            aria-label="搜索媒体库"
          />
        </form>
        {isDemo && (
          <span className="demo-badge" title={DEMO_DATA_DISCLAIMER}>
            演示数据
          </span>
        )}
        <button className="icon-btn" onClick={toggleTheme} aria-label="切换深浅主题" title="切换深浅主题">
          {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NavLink to="/settings" className="icon-btn" aria-label="打开设置" title="打开设置">
          <Settings size={18} />
        </NavLink>
      </header>

      <div className="main-area">
        <main className={`page-scroll${fullBleed ? ' is-fullbleed' : ''}`} id="page-scroll">
          {children}
        </main>
      </div>

      <ToastStack />
    </div>
  );
}
