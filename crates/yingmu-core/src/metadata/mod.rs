//! metadata — NFO 解析、TMDB 匹配/手动修正、刮削失败回退
//!
//! # 凭据安全
//! TMDB API Key **禁止硬编码**，一律通过 [`CredentialRef::Env`] 从环境变量
//! （默认 `YINGMU_TMDB_API_KEY`）注入；Key 不会拼进 URL（避免被日志/代理记录），
//! 而是作为 `Authorization: Bearer` 头在发起请求时临时构造。
//!
//! # 刮削回退（强制）
//! [`merge_scraped`] 采用「只填补空白、绝不覆盖原始文件信息」策略：来自本地
//! 文件 / NFO / 手动修正的已有信息具有最高优先级；刮削失败（None）时完全保留基线，
//! 绝不返回看似成功但字段被清空的元数据。
//!
//! # HTTP 传输状态
//! 本模块定义 `HttpExecutor` 注入点与完整的请求/响应结构、匹配与解析逻辑，
//! 但**不绑定具体 HTTP 客户端**。平台层（Tauri command）注入真实实现；
//! 默认 [`NoopHttpExecutor`] 返回明确的「未验证」错误，绝不伪造 HTTP 成功。
//!
//! 本模块源码未经编译验证：Rust 工具链 1.99.1 已安装（未在 PATH），但 MSVC / Windows SDK / link.exe 缺失；不得视为可运行实现。

use crate::models::{MediaMetadata, MetadataOrigin};
use crate::providers::{CredentialRef, CredentialResolver, EnvCredentialResolver};
use crate::{CoreError, Result};
use roxmltree::{Document, Node};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

// ============================================================
// NFO 解析
// ============================================================

/// NFO 解析出的部分字段；所有字段均可缺省。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct NfoData {
    pub title: Option<String>,
    pub original_title: Option<String>,
    pub year: Option<i64>,
    pub plot: Option<String>,
    pub directors: Vec<String>,
    pub actors: Vec<String>,
    pub writers: Vec<String>,
    pub genres: Vec<String>,
    pub rating: Option<f64>,
    pub release_date: Option<String>,
    pub tmdb_id: Option<String>,
}

fn child_text(node: Node<'_, '_>, tag: &str) -> Option<String> {
    node.children()
        .find(|c| c.is_element() && c.has_tag_name(tag))
        .and_then(|c| c.text())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn child_texts(node: Node<'_, '_>, tag: &str) -> Vec<String> {
    node.children()
        .filter(|c| c.is_element() && c.has_tag_name(tag))
        .filter_map(|c| c.text().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect()
}

fn actor_names(node: Node<'_, '_>) -> Vec<String> {
    node.children()
        .filter(|c| c.is_element() && c.has_tag_name("actor"))
        .filter_map(|a| child_text(a, "name"))
        .collect()
}

/// 解析 Kodi 风格 NFO（movie / tvshow / episodedetails / musicvideo）。
///
/// 字段：title / originaltitle / year / plot / director / actor/name / genre /
/// rating / releasedate / writer / tmdbid / uniqueid[type=tmdb]。
/// 任何单个字段解析失败都只是缺省该字段，不影响其它字段；XML 本身非法才返回错误。
pub fn parse_nfo(xml: &str) -> Result<NfoData> {
    let doc = Document::parse(xml)?;
    let root = doc
        .descendants()
        .find(|n| {
            n.is_element()
                && (n.has_tag_name("movie")
                    || n.has_tag_name("tvshow")
                    || n.has_tag_name("episodedetails")
                    || n.has_tag_name("musicvideo"))
        })
        .ok_or_else(|| {
            CoreError::Config(
                "NFO 根节点不是受支持的 movie/tvshow/episodedetails/musicvideo".to_string(),
            )
        })?;

    let release_date = child_text(root, "releasedate")
        .or_else(|| child_text(root, "premiered"))
        .or_else(|| child_text(root, "aired"));

    let tmdb_id = child_text(root, "tmdbid").or_else(|| {
        root.children()
            .find(|c| {
                c.is_element() && c.has_tag_name("uniqueid") && c.attribute("type") == Some("tmdb")
            })
            .and_then(|c| c.text())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    });

    Ok(NfoData {
        title: child_text(root, "title"),
        original_title: child_text(root, "originaltitle"),
        year: child_text(root, "year").and_then(|s| s.parse::<i64>().ok()),
        plot: child_text(root, "plot").or_else(|| child_text(root, "outline")),
        directors: child_texts(root, "director"),
        actors: actor_names(root),
        writers: child_texts(root, "writer"),
        genres: child_texts(root, "genre"),
        rating: child_text(root, "rating").and_then(|s| s.parse::<f64>().ok()),
        release_date,
        tmdb_id,
    })
}

impl NfoData {
    /// 转成 `MediaMetadata`；`fallback_title` 仅用于 NFO 完全缺 title 时兜底，
    /// 不覆盖任何 NFO 已有字段。origin 固定为 Nfo。
    pub fn to_metadata(&self, fallback_title: &str) -> MediaMetadata {
        let mut external_ids = HashMap::new();
        if let Some(id) = &self.tmdb_id {
            external_ids.insert("tmdb".to_string(), id.clone());
        }
        MediaMetadata {
            title: self
                .title
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| fallback_title.to_string()),
            original_title: self.original_title.clone(),
            year: self.year,
            synopsis: self.plot.clone(),
            directors: self.directors.clone(),
            cast: self.actors.clone(),
            writers: self.writers.clone(),
            genres: self.genres.clone(),
            release_date: self.release_date.clone(),
            rating: self.rating,
            poster_path: None,
            backdrop_path: None,
            season_count: None,
            episode_count: None,
            origin: MetadataOrigin::Nfo,
            external_ids: if external_ids.is_empty() {
                None
            } else {
                Some(external_ids)
            },
            updated_at: Some(chrono::Utc::now().to_rfc3339()),
        }
    }
}

// ============================================================
// TMDB 配置与 HTTP 结构
// ============================================================

pub const TMDB_DEFAULT_BASE_URL: &str = "https://api.themoviedb.org/3";
/// API Key 从该环境变量读取，绝不硬编码。
pub const TMDB_API_KEY_ENV: &str = "YINGMU_TMDB_API_KEY";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TmdbConfig {
    pub base_url: String,
    pub api_key_env: String,
    pub language: String,
}

impl Default for TmdbConfig {
    fn default() -> Self {
        TmdbConfig {
            base_url: TMDB_DEFAULT_BASE_URL.to_string(),
            api_key_env: TMDB_API_KEY_ENV.to_string(),
            language: "zh-CN".to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TmdbMediaType {
    Movie,
    Tv,
}

/// 搜索请求描述（URL 中不含 API Key；Key 由 `Authorization` 头携带）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TmdbSearchRequest {
    pub url: String,
    pub query: String,
    pub year: Option<i64>,
}

/// RFC 3986 风格百分号编码（unreserved 字符保留，其余按 UTF-8 字节编码）。
pub fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// TMDB 搜索结果中的一条（字段与 TMDB JSON 对齐，TV 结果使用 alias）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct TmdbSearchResult {
    pub id: i64,
    #[serde(alias = "name")]
    pub title: String,
    #[serde(alias = "original_name")]
    pub original_title: Option<String>,
    #[serde(alias = "first_air_date")]
    pub release_date: Option<String>,
    pub overview: Option<String>,
    pub vote_average: Option<f64>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct TmdbSearchEnvelope {
    #[serde(default)]
    results: Vec<TmdbSearchResult>,
}

/// 解析 TMDB `/search/*` 响应的 `results` 数组。
pub fn parse_search_response(json: &str) -> Result<Vec<TmdbSearchResult>> {
    let envelope: TmdbSearchEnvelope = serde_json::from_str(json)?;
    Ok(envelope.results)
}

/// HTTP 传输注入点：平台层用真实 HTTP 客户端实现（如 reqwest + rustls）。
pub trait HttpExecutor: Send + Sync {
    fn get(&self, url: &str, headers: &[(String, String)]) -> Result<String>;
}

/// 默认执行器：明确报告「HTTP 传输未绑定」，绝不伪造响应。
#[derive(Debug, Default, Clone, Copy)]
pub struct NoopHttpExecutor;

impl HttpExecutor for NoopHttpExecutor {
    fn get(&self, _url: &str, _headers: &[(String, String)]) -> Result<String> {
        Err(CoreError::Unvalidated(
            "TMDB HTTP 传输未绑定：需由平台层注入 HttpExecutor（如 reqwest）后方可在线刮削"
                .to_string(),
        ))
    }
}

/// TMDB 客户端：只持有配置与凭据解析器，不保存任何明文 Key。
pub struct TmdbClient {
    config: TmdbConfig,
    resolver: Box<dyn CredentialResolver>,
}

impl TmdbClient {
    pub fn new(config: TmdbConfig) -> Self {
        TmdbClient {
            config,
            resolver: Box::new(EnvCredentialResolver),
        }
    }

    /// 注入自定义凭据解析器（测试 / 平台层安全存储）。
    pub fn with_resolver(config: TmdbConfig, resolver: Box<dyn CredentialResolver>) -> Self {
        TmdbClient { config, resolver }
    }

    pub fn config(&self) -> &TmdbConfig {
        &self.config
    }

    fn key_ref(&self) -> CredentialRef {
        CredentialRef::Env {
            variable: self.config.api_key_env.clone(),
        }
    }

    /// 是否配置了 Key（只检查存在性，绝不回传值）。
    pub fn is_configured(&self) -> bool {
        matches!(self.resolver.resolve(&self.key_ref()), Ok(Some(_)))
    }

    /// 临时构造鉴权头；Key 不写入结构体、不写入 URL。
    pub fn auth_header(&self) -> Result<(String, String)> {
        let secret = self
            .resolver
            .resolve(&self.key_ref())?
            .ok_or_else(|| CoreError::CredentialMissing(TMDB_API_KEY_ENV.to_string()))?;
        Ok((
            "Authorization".to_string(),
            format!("Bearer {}", secret.expose()),
        ))
    }

    /// 构造搜索 URL（纯逻辑，不含 API Key，可测试）。
    pub fn build_search_request(
        &self,
        media_type: TmdbMediaType,
        title: &str,
        year: Option<i64>,
    ) -> TmdbSearchRequest {
        let segment = match media_type {
            TmdbMediaType::Movie => "movie",
            TmdbMediaType::Tv => "tv",
        };
        let mut url = format!(
            "{}/search/{}?query={}&language={}&page=1",
            self.config.base_url.trim_end_matches('/'),
            segment,
            percent_encode(title),
            self.config.language
        );
        if let Some(y) = year {
            url.push_str(&format!("&year={}", y));
        }
        TmdbSearchRequest {
            url,
            query: title.to_string(),
            year,
        }
    }

    /// 执行搜索：鉴权头 + 注入的 HTTP 执行器 + 响应解析。
    /// 未提供真实执行器时（NoopHttpExecutor）返回明确错误，绝不返回假数据。
    pub fn fetch_metadata(
        &self,
        request: &TmdbSearchRequest,
        executor: &dyn HttpExecutor,
    ) -> Result<Vec<TmdbSearchResult>> {
        let header = self.auth_header()?;
        let body = executor.get(&request.url, &[header])?;
        parse_search_response(&body)
    }
}

// ============================================================
// 匹配打分 / 自动匹配 / 手动修正
// ============================================================

fn normalize(s: &str) -> String {
    s.trim().to_lowercase()
}

fn tokens(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

fn token_jaccard(a: &str, b: &str) -> f64 {
    let ta: HashSet<String> = tokens(a).into_iter().collect();
    let tb: HashSet<String> = tokens(b).into_iter().collect();
    if ta.is_empty() && tb.is_empty() {
        return 0.0;
    }
    let intersection = ta.intersection(&tb).count();
    let union = ta.union(&tb).count();
    intersection as f64 / union as f64
}

/// 匹配评分：标题/原标 token Jaccard 相似度 + 包含加权 + 年份接近加权。
/// 纯逻辑，可单元测试；不含任何网络调用。
pub fn match_score(query: &str, year: Option<i64>, candidate: &TmdbSearchResult) -> f64 {
    let q = normalize(query);
    let mut score = token_jaccard(&q, &normalize(&candidate.title));
    if let Some(original) = &candidate.original_title {
        score = score.max(token_jaccard(&q, &normalize(original)));
    }
    let title_norm = normalize(&candidate.title);
    if !q.is_empty()
        && !title_norm.is_empty()
        && (title_norm.contains(&q) || q.contains(&title_norm))
    {
        score += 0.3;
    }
    if let (Some(y), Some(release)) = (year, &candidate.release_date) {
        if let Some(candidate_year) = release.get(..4).and_then(|s| s.parse::<i64>().ok()) {
            let diff = (candidate_year - y).abs();
            score += match diff {
                0 => 0.4,
                1 => 0.2,
                _ => -0.1,
            };
        }
    }
    score.clamp(0.0, 2.0)
}

/// 自动匹配：取得分最高者；结果为空返回 None（不臆造匹配）。
pub fn best_match<'a>(
    results: &'a [TmdbSearchResult],
    query: &str,
    year: Option<i64>,
) -> Option<&'a TmdbSearchResult> {
    results.iter().max_by(|a, b| {
        match_score(query, year, a)
            .partial_cmp(&match_score(query, year, b))
            .unwrap_or(Ordering::Equal)
    })
}

/// 手动修正入口之一：用户从候选里按 TMDB ID 指定正确匹配。
pub fn select_by_id(results: &[TmdbSearchResult], id: i64) -> Option<&TmdbSearchResult> {
    results.iter().find(|r| r.id == id)
}

/// 前端 `libraryUpdateMetadata(id, patch)` 对应的补丁结构（Partial<MediaMetadata>）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MetadataPatch {
    pub title: Option<String>,
    pub original_title: Option<String>,
    pub year: Option<i64>,
    pub synopsis: Option<String>,
    pub directors: Option<Vec<String>>,
    pub cast: Option<Vec<String>>,
    pub writers: Option<Vec<String>>,
    pub genres: Option<Vec<String>>,
    pub release_date: Option<String>,
    pub rating: Option<f64>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub season_count: Option<i64>,
    pub episode_count: Option<i64>,
    pub external_ids: Option<HashMap<String, String>>,
}

/// 手动修正：把用户补丁应用到当前元数据，origin 置为 Manual。
/// 仅对 `Some` 字段覆盖；未提供的字段保持原值（Partial 语义）。
pub fn apply_manual_override(base: &MediaMetadata, patch: &MetadataPatch) -> MediaMetadata {
    let mut out = base.clone();
    if let Some(v) = &patch.title {
        out.title = v.clone();
    }
    if let Some(v) = &patch.original_title {
        out.original_title = Some(v.clone());
    }
    if let Some(v) = patch.year {
        out.year = Some(v);
    }
    if let Some(v) = &patch.synopsis {
        out.synopsis = Some(v.clone());
    }
    if let Some(v) = &patch.directors {
        out.directors = v.clone();
    }
    if let Some(v) = &patch.cast {
        out.cast = v.clone();
    }
    if let Some(v) = &patch.writers {
        out.writers = v.clone();
    }
    if let Some(v) = &patch.genres {
        out.genres = v.clone();
    }
    if let Some(v) = &patch.release_date {
        out.release_date = Some(v.clone());
    }
    if let Some(v) = patch.rating {
        out.rating = Some(v);
    }
    if let Some(v) = &patch.poster_path {
        out.poster_path = Some(v.clone());
    }
    if let Some(v) = &patch.backdrop_path {
        out.backdrop_path = Some(v.clone());
    }
    if let Some(v) = patch.season_count {
        out.season_count = Some(v);
    }
    if let Some(v) = patch.episode_count {
        out.episode_count = Some(v);
    }
    if let Some(v) = &patch.external_ids {
        out.external_ids = Some(v.clone());
    }
    out.origin = MetadataOrigin::Manual;
    out.updated_at = Some(chrono::Utc::now().to_rfc3339());
    out
}

// ============================================================
// 刮削失败回退（绝不覆盖原始文件信息）
// ============================================================

/// 把刮削结果合并到基线元数据。
///
/// 策略：**只填补空白**。基线中已有的 title / directors / 年份等信息一律保留，
/// 刮削结果仅在基线字段缺省或为空时补充。刮削失败（`None`）时完全返回基线，
/// 绝不返回看似成功但字段被清空的元数据，也绝不把 origin 伪造成已刮削。
pub fn merge_scraped(base: &MediaMetadata, scraped: Option<&MediaMetadata>) -> MediaMetadata {
    let Some(s) = scraped else {
        return base.clone();
    };
    let mut out = base.clone();
    if out.title.trim().is_empty() && !s.title.trim().is_empty() {
        out.title = s.title.clone();
    }
    if out.original_title.is_none() {
        out.original_title = s.original_title.clone();
    }
    if out.year.is_none() {
        out.year = s.year;
    }
    if out.synopsis.is_none() {
        out.synopsis = s.synopsis.clone();
    }
    if out.directors.is_empty() {
        out.directors = s.directors.clone();
    }
    if out.cast.is_empty() {
        out.cast = s.cast.clone();
    }
    if out.writers.is_empty() {
        out.writers = s.writers.clone();
    }
    if out.genres.is_empty() {
        out.genres = s.genres.clone();
    }
    if out.release_date.is_none() {
        out.release_date = s.release_date.clone();
    }
    if out.rating.is_none() {
        out.rating = s.rating;
    }
    if out.poster_path.is_none() {
        out.poster_path = s.poster_path.clone();
    }
    if out.backdrop_path.is_none() {
        out.backdrop_path = s.backdrop_path.clone();
    }
    if out.season_count.is_none() {
        out.season_count = s.season_count;
    }
    if out.episode_count.is_none() {
        out.episode_count = s.episode_count;
    }
    if out.external_ids.is_none() {
        out.external_ids = s.external_ids.clone();
    }
    // 基线尚无来源标记时，才采用刮削来源；已有 NFO/Manual 等权威来源保持不动。
    if out.origin == MetadataOrigin::None {
        out.origin = s.origin;
    }
    out
}

// ============================================================
// 单元测试（纯逻辑，可编译）
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::Secret;

    const SAMPLE_NFO: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>星际穿越</title>
  <originaltitle>Interstellar</originaltitle>
  <year>2014</year>
  <plot>一组宇航员穿越虫洞寻找人类新家园。</plot>
  <director>克里斯托弗·诺兰</director>
  <writer>乔纳森·诺兰</writer>
  <genre>科幻</genre>
  <genre>冒险</genre>
  <rating>8.7</rating>
  <releasedate>2014-11-07</releasedate>
  <actor><name>马修·麦康纳</name></actor>
  <actor><name>安妮·海瑟薇</name></actor>
  <tmdbid>157336</tmdbid>
</movie>"#;

    fn base_metadata() -> MediaMetadata {
        MediaMetadata {
            title: "本地文件名解析标题".to_string(),
            original_title: None,
            year: Some(2014),
            synopsis: None,
            directors: vec!["本地导演".to_string()],
            cast: vec![],
            writers: vec![],
            genres: vec!["本地分类".to_string()],
            release_date: None,
            rating: None,
            poster_path: None,
            backdrop_path: None,
            season_count: None,
            episode_count: None,
            origin: MetadataOrigin::Local,
            external_ids: None,
            updated_at: None,
        }
    }

    #[test]
    fn parse_nfo_extracts_all_fields() {
        let d = parse_nfo(SAMPLE_NFO).unwrap();
        assert_eq!(d.title.as_deref(), Some("星际穿越"));
        assert_eq!(d.original_title.as_deref(), Some("Interstellar"));
        assert_eq!(d.year, Some(2014));
        assert!(d.plot.unwrap().contains("虫洞"));
        assert_eq!(d.directors, vec!["克里斯托弗·诺兰".to_string()]);
        assert_eq!(d.writers, vec!["乔纳森·诺兰".to_string()]);
        assert_eq!(d.genres, vec!["科幻".to_string(), "冒险".to_string()]);
        assert_eq!(d.rating, Some(8.7));
        assert_eq!(d.release_date.as_deref(), Some("2014-11-07"));
        assert_eq!(
            d.actors,
            vec!["马修·麦康纳".to_string(), "安妮·海瑟薇".to_string()]
        );
        assert_eq!(d.tmdb_id.as_deref(), Some("157336"));
    }

    #[test]
    fn parse_nfo_tolerates_partial_and_rejects_broken_xml() {
        let partial = parse_nfo("<movie><title>仅标题</title></movie>").unwrap();
        assert_eq!(partial.title.as_deref(), Some("仅标题"));
        assert_eq!(partial.year, None);
        assert!(partial.directors.is_empty());

        assert!(parse_nfo("<movie>").is_err());
        assert!(parse_nfo("<html><body>不是 NFO</body></html>").is_err());
    }

    #[test]
    fn parse_nfo_uniqueid_tmdb() {
        let xml = r#"<tvshow><title>剧集</title><uniqueid type="tmdb" default="true">12345</uniqueid></tvshow>"#;
        let d = parse_nfo(xml).unwrap();
        assert_eq!(d.tmdb_id.as_deref(), Some("12345"));
    }

    #[test]
    fn nfo_to_metadata_keeps_nfo_authority() {
        let d = parse_nfo(SAMPLE_NFO).unwrap();
        let m = d.to_metadata("兜底标题");
        assert_eq!(m.title, "星际穿越");
        assert_eq!(m.origin, MetadataOrigin::Nfo);
        assert_eq!(
            m.external_ids.as_ref().unwrap().get("tmdb").unwrap(),
            "157336"
        );
    }

    #[test]
    fn percent_encode_handles_space_and_utf8() {
        assert_eq!(percent_encode("A B"), "A%20B");
        assert_eq!(percent_encode("a-b_c.d~e"), "a-b_c.d~e");
        assert_eq!(percent_encode("中"), "%E4%B8%AD");
        assert!(!percent_encode("科幻 电影").contains(' '));
    }

    #[test]
    fn build_search_request_never_puts_key_in_url() {
        let client = TmdbClient::new(TmdbConfig::default());
        let req = client.build_search_request(TmdbMediaType::Movie, "A B", Some(2014));
        assert!(req
            .url
            .starts_with("https://api.themoviedb.org/3/search/movie?"));
        assert!(req.url.contains("query=A%20B"));
        assert!(req.url.contains("year=2014"));
        assert!(req.url.contains("language=zh-CN"));
        // 关键安全约束：API Key 绝不出现在 URL 中。
        assert!(!req.url.contains("api_key"));
        assert!(!req.url.contains("Bearer"));
    }

    /// 固定凭据解析器：用于测试鉴权头构造，不接触真实环境变量。
    struct FixedResolver(&'static str);
    impl CredentialResolver for FixedResolver {
        fn resolve(&self, _r: &CredentialRef) -> Result<Option<Secret>> {
            Ok(Some(Secret::new(self.0)))
        }
    }

    #[test]
    fn auth_header_uses_injected_key() {
        let client = TmdbClient::with_resolver(
            TmdbConfig::default(),
            Box::new(FixedResolver("example-not-a-real-key")),
        );
        assert!(client.is_configured());
        let (name, value) = client.auth_header().unwrap();
        assert_eq!(name, "Authorization");
        assert_eq!(value, "Bearer example-not-a-real-key");
    }

    #[test]
    fn noop_http_executor_never_fakes_response() {
        let client = TmdbClient::with_resolver(TmdbConfig::default(), Box::new(FixedResolver("k")));
        let req = client.build_search_request(TmdbMediaType::Tv, "X", None);
        let err = client.fetch_metadata(&req, &NoopHttpExecutor).unwrap_err();
        assert!(matches!(err, CoreError::Unvalidated(_)));
    }

    #[test]
    fn parse_tmdb_search_response() {
        let json = r#"{"page":1,"results":[
            {"id":157336,"title":"Interstellar","original_title":"Interstellar",
             "release_date":"2014-11-05","overview":"...","vote_average":8.4,
             "poster_path":"/p.jpg","backdrop_path":"/b.jpg"},
            {"id":999,"name":"Some Show","original_name":"Some Show",
             "first_air_date":"2020-01-01","vote_average":7.0}
        ],"total_results":2}"#;
        let results = parse_search_response(json).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "Interstellar");
        assert_eq!(results[0].release_date.as_deref(), Some("2014-11-05"));
        // TV 结果用 name / first_air_date 别名。
        assert_eq!(results[1].title, "Some Show");
        assert_eq!(results[1].release_date.as_deref(), Some("2020-01-01"));
    }

    #[test]
    fn best_match_and_manual_selection() {
        let results = vec![
            TmdbSearchResult {
                id: 1,
                title: "Interstellar".to_string(),
                original_title: Some("Interstellar".to_string()),
                release_date: Some("2014-11-05".to_string()),
                ..Default::default()
            },
            TmdbSearchResult {
                id: 2,
                title: "Interstellar: Nolan's Journey".to_string(),
                release_date: Some("2019-01-01".to_string()),
                ..Default::default()
            },
        ];
        let best = best_match(&results, "Interstellar", Some(2014)).unwrap();
        assert_eq!(best.id, 1, "标题与年份都更接近的应胜出");
        assert!(
            match_score("Interstellar", Some(2014), &results[0])
                > match_score("Interstellar", Some(2014), &results[1])
        );
        // 手动修正：按 ID 覆盖自动匹配。
        assert_eq!(select_by_id(&results, 2).unwrap().id, 2);
        assert!(select_by_id(&results, 42).is_none());
    }

    #[test]
    fn merge_scraped_never_overwrites_original_info() {
        let base = base_metadata();
        // 刮削失败：完全保留基线。
        assert_eq!(merge_scraped(&base, None), base);

        let scraped = MediaMetadata {
            title: "TMDB 标题".to_string(),
            original_title: Some("TMDB Original".to_string()),
            year: Some(2099),
            synopsis: Some("TMDB 简介".to_string()),
            directors: vec!["TMDB 导演".to_string()],
            cast: vec!["TMDB 演员".to_string()],
            writers: vec!["TMDB 编剧".to_string()],
            genres: vec!["TMDB 分类".to_string()],
            release_date: Some("2099-01-01".to_string()),
            rating: Some(9.9),
            poster_path: Some("/p.jpg".to_string()),
            backdrop_path: Some("/b.jpg".to_string()),
            season_count: Some(2),
            episode_count: Some(20),
            origin: MetadataOrigin::Tmdb,
            external_ids: Some(HashMap::new()),
            updated_at: None,
        };
        let merged = merge_scraped(&base, Some(&scraped));
        // 已有信息一律不被覆盖。
        assert_eq!(merged.title, "本地文件名解析标题");
        assert_eq!(merged.year, Some(2014));
        assert_eq!(merged.directors, vec!["本地导演".to_string()]);
        assert_eq!(merged.genres, vec!["本地分类".to_string()]);
        assert_eq!(merged.origin, MetadataOrigin::Local);
        // 空白字段被补充。
        assert_eq!(merged.synopsis.as_deref(), Some("TMDB 简介"));
        assert_eq!(merged.original_title.as_deref(), Some("TMDB Original"));
        assert_eq!(merged.rating, Some(9.9));
        assert_eq!(merged.poster_path.as_deref(), Some("/p.jpg"));
    }

    #[test]
    fn apply_manual_override_marks_origin_manual() {
        let base = base_metadata();
        let patch = MetadataPatch {
            title: Some("用户修正标题".to_string()),
            rating: Some(7.5),
            ..Default::default()
        };
        let out = apply_manual_override(&base, &patch);
        assert_eq!(out.title, "用户修正标题");
        assert_eq!(out.rating, Some(7.5));
        assert_eq!(out.origin, MetadataOrigin::Manual);
        // 未提供的字段保持原值。
        assert_eq!(out.directors, vec!["本地导演".to_string()]);
        assert!(out.updated_at.is_some());
    }
}
