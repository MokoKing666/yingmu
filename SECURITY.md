# 安全政策

## 适用范围

影幕（YingMu）是本地优先的个人媒体中心。安全边界主要包括：本地数据库与用户数据、网络媒体源凭据、TMDB 等外部 API 密钥、日志与诊断信息、安装包分发完整性。

## 报告漏洞

**请不要在公开 Issue 中提交凭据、可利用细节或未脱敏日志。** 请通过仓库的私有安全通告渠道（GitHub Security Advisories）或向维护者私下报告，并附：

- 影响版本与运行环境（Windows 版本、WebView2 版本、是否 Tauri 桌面端）
- 复现步骤与最小样本（样本需为自行制作，不含私人媒体）
- 影响评估与建议修复方向
- 一份已脱敏的日志（去除 NAS 地址、用户名、路径、Token）

维护者确认后会记录到受影响的版本与 `CHANGELOG.md`，并在修复发布时注明。

## 密钥与凭据处理规则

| 项目 | 规则 |
|---|---|
| GitHub Token / API Key / 密码 | **绝不**写入代码、配置、提交记录、Git remote URL 或日志 |
| TMDB API Key | 只从本地环境变量或安全配置存储读取；仓库只保留 `.env.example` 占位 |
| NAS / SMB / WebDAV 凭据 | 只通过系统安全配置存储注入；`MediaSource` 结构仅保存 `requiresAuth` 布尔标记 |
| 用户数据 | `%APPDATA%\YingMu`（配置 / 数据库）、`%LOCALAPPDATA%\YingMu\Cache`、`%LOCALAPPDATA%\YingMu\Logs`，**不写安装目录** |
| 日志与诊断 | 上报前脱敏；诊断报告不包含路径、凭据、播放记录 |
| 提交前 | `node scripts/secret-scan.mjs` 必须零命中；CI 中同样执行扫描 |

`.gitignore` 明确排除 `.env*`、`*.pem`、`*.key`、凭据文件、用户数据库与日志、私人媒体样本。注意 MPEG-TS 视频扩展名也是 `.ts`，因此仓库**禁止**写裸 `*.ts` 忽略规则，避免误伤 TypeScript 源码；该约束已由 `tests/repo-contract.test.mjs` 做回归断言。

## 安装包完整性

- Release 只上传当次工作流内构建并通过 `scripts/verify-release.mjs` 校验的产物。
- 校验项：文件存在、体积阈值、PE 头、SHA-256；Release 附 `SHA256SUMS.txt`。
- 不要下载或运行来源不明、无校验值的安装器。

## 依赖与授权

第三方依赖的许可证与分发限制见 `THIRD_PARTY_NOTICES.md`。Dolby 相关技术与商标需单独授权，本项目**未获得 Dolby 官方认证**，也不使用其官方 Logo。不能假定动态链接自动免除 GPL / LGPL 义务。

## 隐私

- 演示数据为原创虚构条目，不含任何真实用户的媒体库、播放记录或路径。
- 应用不主动上传播放记录；网络请求仅在用户显式配置 TMDB / 网络媒体源后发起。
- 卸载默认不删除用户数据，提供明确的清理选项。

## 当前状态提示

本阶段 GitHub 推送与 CI 尚未执行（本机无认证凭据）；本文件描述的是项目约定，不代表所有流程已在本机验证过。以 `docs/testing/strategy.md` 与 `README.md` 的状态表为准。
