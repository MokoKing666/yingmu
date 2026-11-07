-- 影幕 YingMu — 迁移 002：FTS5 全文检索表与同步触发器
--
-- 采用「普通（content-bearing）FTS5 表 + 触发器」方案，而非 external-content 模式：
-- - 不依赖 content 表列名与 FTS 列名一一对应，触发器可自由映射；
-- - 通过显式 rowid = media.rowid 关联，DELETE/UPDATE 触发器用 rowid 精确删除，
--   这是 FTS5 官方支持的高效路径，避免对 UNINDEXED 列做全表扫描过滤。
-- - snippet() 直接对本表可用，无需回查 content 表。
--
-- 列顺序（0-based，供 snippet 使用）：
-- 0 media_id(UNINDEXED) / 1 title / 2 original_title / 3 synopsis /
-- 4 directors / 5 cast_text / 6 genres

CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(
    media_id       UNINDEXED,
    title,
    original_title,
    synopsis,
    directors,
    cast_text,
    genres,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- 新增 media 时同步写入 FTS 索引。
CREATE TRIGGER IF NOT EXISTS media_fts_ai AFTER INSERT ON media BEGIN
    INSERT INTO media_fts(rowid, media_id, title, original_title, synopsis, directors, cast_text, genres)
    VALUES (
        new.rowid,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        new.directors_json,
        new.cast_json,
        new.genres_json
    );
END;

-- 删除 media 时按 rowid 精确移除索引行。
CREATE TRIGGER IF NOT EXISTS media_fts_ad AFTER DELETE ON media BEGIN
    DELETE FROM media_fts WHERE rowid = old.rowid;
END;

-- 更新 media 时先删后插（rowid 在同一行更新中保持不变，但重插更稳妥）。
CREATE TRIGGER IF NOT EXISTS media_fts_au AFTER UPDATE ON media BEGIN
    DELETE FROM media_fts WHERE rowid = old.rowid;
    INSERT INTO media_fts(rowid, media_id, title, original_title, synopsis, directors, cast_text, genres)
    VALUES (
        new.rowid,
        new.id,
        new.title,
        COALESCE(new.original_title, ''),
        COALESCE(new.synopsis, ''),
        new.directors_json,
        new.cast_json,
        new.genres_json
    );
END;
