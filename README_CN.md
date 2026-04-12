# memory-runtime

`memory-runtime` 是一套给 CLI 智能体用的冷热记忆运行时。

目标就一条：**节省 tokens，但不改写用户原始需求，不把任务带偏。**

当前已经支持：

- 热记忆：本地 SQLite
- 冷记忆：Memory Palace
- 主机接入：Codex / Claude / Gemini
- 自动方式：shell wrapper
- 冷记忆 Docker：backend-only 一键部署

## 适合谁

- 想让 CLI 工具在新会话里自动吃到项目背景
- 想保留长期项目记忆，但不想每轮都塞满上下文
- 想要高内聚、低耦合、可替换的记忆系统

## 设计原则

- 不改写用户原始输入
- 只注入小而稳的背景信息
- fail-open，记忆系统挂了也不拦开发
- 热记忆优先，冷记忆兜底
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
- 失败时安静降级

Docker 容器生命周期应该由部署脚本或用户自己管。

### 为什么要强制 `projects` 域？

因为 `memory-runtime` 的 durable promotion 现在默认写到：

```text
projects://<project-id>/...
```

你没有这个域，冷记忆 promotion 就会出问题。

## 进一步阅读

- 英文版：`README.md`
- 架构：`docs/ARCHITECTURE.md`
- Docker 冷记忆：`docs/COLD_MEMORY_DOCKER.md`
- 配置：`docs/CONFIGURATION.md`
- 排障：`docs/TROUBLESHOOTING.md`
- 发布：`docs/RELEASE.md`
