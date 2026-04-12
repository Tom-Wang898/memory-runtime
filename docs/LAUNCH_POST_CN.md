# memory-runtime 首版发布文案

`memory-runtime` 是一套给 CLI 智能体用的冷热记忆运行时。

它解决的问题很直接：

- 长会话越聊越贵
- 全量喂上下文会污染任务
- 每次开新会话又丢项目背景

这套运行时的目标不是“记得更多”，而是：

- **更稳地记住该记的**
- **更克制地注入上下文**
- **在节省 tokens 的同时不把需求带偏**

当前版本已经支持：

- 本地 SQLite 热记忆
- Memory Palace 冷记忆
- Codex / Claude / Gemini wrapper 接入
- shell 自动注入 bootstrap
- backend-only Docker 冷记忆部署

设计上我故意卡了几条死规矩：

- 不改写用户原始 prompt
- 只注入补充背景，不替代需求
- 高风险请求默认更少注入，而不是更多注入
- 记忆系统挂了直接 fail-open，不拦正常开发

如果你想试：

```bash
git clone https://github.com/Tom-Wang898/memory-runtime.git
cd memory-runtime
npm install
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
```

如果你还想接冷记忆，最省事的是：

```bash
./scripts/install-memory-palace-docker.sh
source ~/.memory-runtime/env.sh
```

这不是一个“全自动万能记忆神经网络”。

它更像一层很克制的基础设施：

- host 可替换
- hot/cold provider 可替换
- shell 集成和冷记忆部署解耦
- 后面想换别的冷记忆系统，也不用推倒重来

当前版本是 `0.1.0-alpha`，已经适合公开试用和收反馈，但还不是 npm 成品。

如果你关心这些方向，欢迎来试：

- agent memory
- context engineering
- token optimization
- fail-open runtime design
- Codex / Claude / Gemini 的长期工作流增强
