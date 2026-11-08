import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/stores/app-store';
import { HomePage } from '@/pages/HomePage';
import { LibraryPage } from '@/pages/LibraryPage';
import { RecentPage } from '@/pages/RecentPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { PlaylistsPage } from '@/pages/PlaylistsPage';
import { SearchPage } from '@/pages/SearchPage';
import { DetailPage } from '@/pages/DetailPage';
import { SourcesPage } from '@/pages/SourcesPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { MetadataEditPage } from '@/pages/MetadataEditPage';

function AnimatedRoutes() {
  const location = useLocation();
  // 减少动态效果时同时关闭 Motion 的页面转场，而不只是依赖 CSS 的 transition
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <Routes location={location}>
          <Route index element={<HomePage />} />
          <Route path="library/:kind" element={<LibraryPage />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="playlists" element={<PlaylistsPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="detail/:id" element={<DetailPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="player/:id" element={<PlayerPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="edit/:id" element={<MetadataEditPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export function App() {
  const initialize = useAppStore((s) => s.initialize);
  const ready = useAppStore((s) => s.ready);
  const error = useAppStore((s) => s.error);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <HashRouter>
      <AppShell>
        {!ready ? (
          <div className="empty-state">
            <span className="brand-name">影幕</span>
            <p className="tiny">正在初始化媒体库…</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3>初始化失败</h3>
            <p>{error}</p>
          </div>
        ) : (
          <AnimatedRoutes />
        )}
      </AppShell>
    </HashRouter>
  );
}
