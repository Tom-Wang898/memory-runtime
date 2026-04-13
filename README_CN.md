# memory-runtime

`memory-runtime` 是一套给 CLI 智能体用的冷热记忆运行时。

目标就一条：**节省 tokens，但不改写用户原始需求，不把任务带偏。**

当前已经支持：

- 热记忆：本地 SQLite
- 冷记忆：Memory Palace
- 主机接入：Codex / Claude / Gemini
- 自动方式：shell wrapper
- 冷记忆 Docker：backend-only 一键部署
- 模糊短指代保护：优先用热记忆锚点补全，没有锚点就抑制冷召回
- skills 治理：支持审计、显式 apply、rollback、benchmark

## 适合谁

- 想让 CLI 工具在新会话里自动吃到项目背景
- 想保留长期项目记忆，但不想每轮都塞满上下文
- 想要高内聚、低耦合、可替换的记忆系统

## 设计原则

- 不改写用户原始输入
- 只注入小而稳的背景信息
- fail-open，记忆系统挂了也不拦开发
- 热记忆优先，冷记忆兜底
- 短指代宁可少回忆，也不乱回忆
- host、runtime、hot provider、cold provider 分层可替换

## 依赖要求

- Node.js `22+`
- npm `10+`
- 至少先装好一个宿主 CLI：Codex、Claude、Gemini 三选一
- `zsh` 或 `bash`
- 可选：Docker（如果你要走冷记忆 Docker 路径，要求 `docker compose` 可用）

## 5 分钟上手

### 1. 安装依赖

```bash
git clone https://github.com/Tom-Wang898/memory-runtime.git
cd memory-runtime
npm install
```

### 2. 安装 shell 集成

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

如果你用的是 bash：

```bash
./scripts/install-shell-integration.sh --shell bash
source ~/.bashrc
```

### 3. 验证 wrapper 已接管

```bash
type codex
type claude
type gemini
type hmctl
```

### 4. 验证热记忆可用

```bash
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
```

如果到这一步就停，也已经能用热记忆模式。

### 5. 可选：审计本地 skills，但不改文件

```bash
hmctl skills-audit
```

如果你只想扫 Codex skills：

```bash
hmctl skills-audit --root "$HOME/.codex/skills" --json
```

### 6. 可选：先生成变更计划

```bash
hmctl skills-plan --root "$HOME/.codex/skills" --host codex
```

### 7. 可选：显式应用治理规则，并自动生成快照

```bash
hmctl skills-apply --root "$HOME/.codex/skills" --host codex
```

### 8. 可选：按快照回滚

```bash
hmctl skills-rollback --snapshot "$HOME/.memory-runtime/skill-governance/snapshots/<snapshot>.json"
```

### 9. 可选：导出重复 skill 决策模板

```bash
hmctl skills-duplicates --root "$HOME/.codex/skills" --decision-out /tmp/duplicate-decisions.json
```

### 10. 可选：按决策文件显式处理重复项

```bash
hmctl skills-duplicates-apply --decision-file /tmp/duplicate-decisions.json
```

导出的决策文件可以先手工改。
如果某组重复项暂时不想动，就把 `action` 改成 `skip`。
重复项报告现在还会带每条路径的状态和 token 元信息，apply 结果会返回治理前后 delta。
重复组现在还会按 review 风险排序，最该先处理的会优先浮到最上面。

### 11. 可选：把本机私有仓库安全导出成公开 staging

```bash
hmctl public-export --list-profiles
hmctl public-export --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
hmctl public-export --profile memory-palace-project-tools --source /path/to/Memory-Palace --output /tmp/memory-palace-public-export
```

这条命令不是傻复制，它会：

- 只复制 allowlist 里的安全文件
- 把机器相关路径替换成 `${HOME}`、`${CODEX_REPO_ROOT}`、`${MEMORY_PALACE_ROOT}` 这类占位符
- 如果还有绝对私有路径没脱掉，直接报错，不继续导出

## 冷记忆推荐接法

### 方案 A：已经有 Memory Palace

直接把地址配给 runtime：

```bash
export MEMORY_RUNTIME_MP_BASE_URL="http://127.0.0.1:18000"
export MEMORY_RUNTIME_MP_API_KEY="your-local-key"
export MEMORY_RUNTIME_MP_API_KEY_MODE="header"
```

### 方案 B：用 Docker 起一个 backend-only 冷记忆

这是给普通用户最稳的一条路：

```bash
./scripts/install-memory-palace-docker.sh
source ~/.memory-runtime/env.sh
```

这条路会：

- 只部署 Memory Palace backend
- 自动生成本地 API key
- 自动开启 `projects` 域
- 把 `memory-runtime` 需要的环境变量写到 `~/.memory-runtime/env.sh`

### 方案 C：你有本地 checkout，想让 wrapper 自动拉起 Python 后端

```bash
export MEMORY_RUNTIME_MP_AUTOSTART=1
export MEMORY_RUNTIME_MP_BACKEND_ROOT=/absolute/path/to/Memory-Palace/backend
```

这条路适合开发者本机，不适合拿来要求所有公开用户都这么配。

## 公开用户的推荐口径

如果你准备把这仓库公开给别人用，推荐这样说：

- 默认先用热记忆
- 想要冷记忆，优先走 `install-memory-palace-docker.sh`
- 想要 Dashboard / SSE / 完整管理界面，再去官方 `Memory-Palace` 仓库

## 常用命令

```bash
npm run check:all
npm run bench:bootstrap
npm run bench:tokens
```

```bash
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "debug query" --json
hmctl checkpoint --cwd "$(pwd)" --summary "checkpoint summary"
hmctl inspect --cwd "$(pwd)"
hmctl metrics --cwd "$(pwd)"
```

## 常见问题

### 为什么当前已经打开的 shell 没自动生效？

因为 shell rc 文件是给**新 shell** 用的。老 shell 不会自己热重载。

解决：

```bash
source ~/.zshrc
```

或者直接新开一个终端 tab。

### 为什么冷记忆 Docker 不让 wrapper 自动去拉？

因为那样耦合太高，也不稳。

wrapper 应该只负责：

- 读取配置
- 注入 bootstrap
- 如果冷后端可用，优先把 `projects://<slug>/digest/current` 和 `projects://<slug>/anchors/current` 这类项目热层一起带进 bootstrap
- 失败时安静降级

### 为什么像“线路A / 方案B / 这个 / 那个”这种短指代不会再乱带偏？

因为 runtime 现在多了一层模糊短指代保护：

- 如果当前 query 很短、像是引用上一轮主题，先尝试从热记忆里拿最近任务锚点补全召回 query
- 如果热记忆里没有足够锚点，就直接抑制这次冷召回
- 目标不是“尽量多回忆”，而是“尽量别回忆错”

Docker 容器生命周期应该由部署脚本或用户自己管。

### 为什么要强制 `projects` 域？

因为 `memory-runtime` 的 durable promotion 现在默认写到：

```text
projects://<project-id>/...
```

你没有这个域，冷记忆 promotion 就会出问题。

### 为什么它不会在安装后偷偷自动改我的 skills？

因为公开仓库不能偷偷去改用户自己的 `~/.codex/skills`。

现在这层支持：

- 扫描
- 显式 apply
- rollback
- benchmark
- 重复项显式治理

但默认安装后不会自己改，只有你明确执行 `skills-apply` 或 `skills-duplicates-apply` 才会动，并且会先写 snapshot。

## 进一步阅读

- 英文版：`README.md`
- 架构：`docs/ARCHITECTURE.md`
- Docker 冷记忆：`docs/COLD_MEMORY_DOCKER.md`
- 配置：`docs/CONFIGURATION.md`
- 排障：`docs/TROUBLESHOOTING.md`
- 发布：`docs/RELEASE.md`
- skills 治理：`docs/SKILL_GOVERNANCE.md`
