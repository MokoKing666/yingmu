-- 影幕 YingMu — 迁移 001：初始表结构
--
-- 设计要点：
-- 1. media.id 是由「内容指纹」派生的 UUID v5（见 database::derive_media_id），
--    与文件路径解耦；media_versions.relative_path 是相对「媒体源根」的路径，
--    因此更换 NAS 地址（sources.uri）时无需改动任何版本行，元数据得以保留。
-- 2. 一个 media 可对应多行 media_versions（1080P / 4K / HDR / 不同语言）。
-- 3. 复杂嵌套结构（metadata / 流信息 / 标签）以 JSON 文本列存储，
--    由 Rust 侧 serde_json 负责序列化，列内文本均经过参数化绑定写入。
-- 4. FTS5 所需的文本列（title / original_title / synopsis / directors_json /
--    cast_json / genres_json）在此冗余保留，供 002 迁移的触发器使用，
--    避免触发器依赖 JSON1 扩展。
-- 说明：`cast` 是 SQL 保留字，故列名使用 cast_json。

CREATE TABLE IF NOT EXISTS media (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    title           TEXT NOT NULL,
    original_title  TEXT,
    year            INTEGER,
    synopsis        TEXT,
    directors_json  TEXT NOT NULL DEFAULT '[]',
    cast_json       TEXT NOT NULL DEFAULT '[]',
    genres_json     TEXT NOT NULL DEFAULT '[]',
    metadata_json   TEXT NOT NULL,
    tags_json       TEXT NOT NULL DEFAULT '[]',
    added_at        TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    favorite        INTEGER NOT NULL DEFAULT 0,
    wall_weight     REAL,
    resume_seconds  REAL,
    last_played_at  TEXT,
    play_count      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sources (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    protocol       TEXT NOT NULL,
    uri            TEXT NOT NULL,
    status         TEXT NOT NULL,
    kinds_json     TEXT NOT NULL DEFAULT '[]',
    enabled        INTEGER NOT NULL DEFAULT 1,
    last_scan_at   TEXT,
    item_count     INTEGER NOT NULL DEFAULT 0,
    scan_cursor    TEXT,
    requires_auth  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media_versions (
    id                TEXT PRIMARY KEY,
    media_id          TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    source_id         TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    relative_path     TEXT NOT NULL,
    fingerprint       TEXT NOT NULL,
    size_bytes        INTEGER NOT NULL,
    modified_at       TEXT NOT NULL,
    duration_seconds  REAL,
    container         TEXT,
    video_json        TEXT,
    audio_json        TEXT NOT NULL DEFAULT '[]',
    subtitles_json    TEXT NOT NULL DEFAULT '[]',
    chapters_json     TEXT NOT NULL DEFAULT '[]',
    label             TEXT NOT NULL,
    is_default        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (source_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_media_versions_media_id ON media_versions(media_id);
CREATE INDEX IF NOT EXISTS idx_media_versions_fingerprint ON media_versions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind);
CREATE INDEX IF NOT EXISTS idx_media_updated_at ON media(updated_at);

CREATE TABLE IF NOT EXISTS playback_history (
    media_id          TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    version_id        TEXT NOT NULL,
    position_seconds  REAL NOT NULL,
    duration_seconds  REAL NOT NULL,
    completed         INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL,
    PRIMARY KEY (media_id, version_id)
);

CREATE TABLE IF NOT EXISTS playlists (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    media_ids    TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_cache (
    media_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,
    size            TEXT NOT NULL,
    path            TEXT NOT NULL,
    bytes           INTEGER NOT NULL,
    last_access_at  TEXT NOT NULL,
    PRIMARY KEY (media_id, kind, size)
);
