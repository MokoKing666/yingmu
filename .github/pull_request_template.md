## 变更说明

<!-- 简述改了什么、为什么改；关联 Issue 用 Closes #123 -->

## 变更类型

- [ ] 修复 (bug fix)
- [ ] 新功能 (feature)
- [ ] 重构 / 性能
- [ ] 文档
- [ ] CI / 构建 / 发布流程

## 检查清单

### 本地验证

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `node scripts/secret-scan.mjs`（提交前敏感信息扫描）
- [ ] `node --test tests/repo-contract.test.mjs`（仓库契约测试）
- [ ] `node scripts/ci-local.mjs`（本机可执行范围汇总）

### Rust / 桌面端（具备工具链时）

- [ ] `cargo fmt --all -- --check`
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] 本机缺构建环境（如 MSVC 链接器被遮蔽、临时文件删除受限）时已明确标注「未执行」，而非默认通过

### 仓库契约

- [ ] App ID 保持 `com.moko.yingmu`，未引入旧标识 `com.yingmu.player`
- [ ] 新增 IPC 命令遵循 `yingmu_` 前缀且在 `bridge.ts` 中唯一，并与 Rust 侧一一对应
- [ ] 未提交任何密钥、令牌、`.env`、本机绝对路径 / UNC 路径或私人媒体样本
- [ ] 未把未完成或未实机验证的功能标注为正式支持（含 HDR / Dolby / 音频直通相关表述）
- [ ] 涉及用户可见变更时已更新 CHANGELOG 对应版本段落

### 发布相关（仅当改动 CI / Release 流程时）

- [ ] 产物仍只上传「工作流内刚构建并通过校验」的安装包
- [ ] 安装包校验（>1MB / PE 头 / SHA-256）与 `SHA256SUMS.txt` 逻辑未被绕过

## 补充说明

<!-- 截图、性能数据、兼容性观测、已知限制等；请勿粘贴凭据或本机绝对路径 -->
