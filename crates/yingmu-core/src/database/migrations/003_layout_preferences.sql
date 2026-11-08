-- 影幕 YingMu — 迁移 003：布局偏好（按作用域持久化）
--
-- 为什么需要这张表：v0.3.0 的自定义排列只存在 WebDemo 的 localStorage 里，
-- Tauri 桌面端拖完就丢。这里把「某个视图的排序模式 + 自定义排列」落到 SQLite，
-- 与媒体数据同库同事务，重启后可恢复。
--
-- 设计要点：
-- 1. scope 是视图标识（home / library:movie / favorites / …），PRIMARY KEY 保证
--    同一作用域只有一份偏好，天然避免「动画库的排列污染电影库」。
-- 2. ordered_media_ids 存 JSON 数组（有序 Media ID）。只存用户真正摆放过的条目，
--    允许部分覆盖；未出现的条目按调用方原始顺序排在自定义序号之后。
-- 3. sort_mode 是受限文本（recommended / recent / year / rating / title / custom），
--    Rust 侧用枚举反序列化，未知值回退到 recommended 而不是崩溃。
--    列默认值 = recent：与前端 defaultSortFor（home=recommended，其余=recent）
--    和 Rust LayoutPreferences::default_for 一致。0.3.x 尚未发布 Release、
--    不存在真实用户数据库，因此直接修正本迁移的默认值而不是追加 004。
-- 4. 全部写入走参数化 SQL + 事务；读写都在同一连接上完成。

CREATE TABLE IF NOT EXISTS layout_preferences (
    scope               TEXT PRIMARY KEY,
    sort_mode           TEXT NOT NULL DEFAULT 'recent'
        CHECK (sort_mode IN ('recommended','recent','year','rating','title','custom')),
    ordered_media_ids   TEXT NOT NULL DEFAULT '[]',
    updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_layout_preferences_updated
    ON layout_preferences(updated_at DESC);
