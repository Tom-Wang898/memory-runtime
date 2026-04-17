# Memory Continuity V2 Implementation Plan

**Goal**
- 在不影响原生 `codex` 正常运作的前提下，为 `memory-runtime` 增加一套抗上下文压缩的连续性记忆层，降低关键状态丢失，同时控制新增 token 成本。

**Inputs**
- 当前仓库已有热层/冷层骨架：
  - `packages/memory-core/src/contracts.ts`
  - `packages/memory-core/src/runtime.ts`
  - `packages/hot-memory-sqlite/src/schema.ts`
  - `packages/hot-memory-sqlite/src/repository.ts`
  - `scripts/hmctl.ts`
- 当前使用约束：
  - `codex` 必须保持原生命令
  - 不允许再把 `memory-runtime` 挂回 Codex 启动 MCP
  - Docker 中已有可用的 Memory Palace 冷记忆后端，继续复用

**Assumptions**
- 冷记忆后端继续使用现有 Memory Palace API，不做服务端协议变更。
- 本轮主要改本地 runtime、CLI、模板、测试，不要求修改用户当前 `~/.codex/config.toml`。
- `hmctl` 仍是 Codex 和 Codex App 的统一 sidecar 入口。

**Risks**
- 热层结构升级需要 SQLite schema migration，必须可回滚且 fail-open。
- 连续性层如果设计成自由文本大摘要，会重新走向高 token 消耗。
- 如果把 consolidation 放到同步路径，会重新拖慢 Codex。
- 旧项目已有脏热状态，必须考虑一次性清理与后续自动收敛策略。

**Verification**
- `npm run check:all`
- 新增 continuity 相关测试全部通过
- `hmctl primer`、`hmctl continuity`、`hmctl bootstrap` 三者 token 对比可量化
- 在有冷记忆的环境中，bootstrap 仍保持 fail-open，且冷层不可用时不影响主流程

## Design Summary

本轮不引入新的重型 memory provider，继续沿用：

- 热层：本地 SQLite
- 冷层：Memory Palace

在逻辑上拆成四层：

1. `Pinned Constraints`
2. `Hot Continuity`
3. `Warm Primer`
4. `Cold Durable Memory`

默认读取顺序：

1. 新会话先读 `primer`
2. 承接型问题读 `continuity`
3. 深历史问题才回退 `bootstrap + cold recall`

默认写入顺序：

1. checkpoint 先写热层
2. 后台 compactor 做去重、收敛、晋升
3. 稳定状态再提升到冷层

## Task 1: Extend Memory Contracts

**Why**
- 当前热层缺少独立的 `constraints` 和 `nextStep`，最不能丢的状态仍然混在 summary 或 active task 里。

**Context**
- 当前 `ProjectCapsule`、`CheckpointRecord` 只覆盖 `activeTask/openLoops/recentDecisions/workingSet`。
- 抗压缩恢复必须给硬约束和下一步单独槽位，否则预算裁剪后很容易丢。

**Files**
- Modify: `packages/memory-core/src/contracts.ts`
- Modify: `packages/memory-core/src/runtime.ts`
- Modify: `packages/hot-memory-sqlite/src/serialization.ts`

**Steps**
1. 在 `contracts.ts` 新增 `ConstraintRecord` 类型，建议字段：
   - `id`
   - `summary`
   - `priority`
   - `updatedAt`
   - `sourceKind`
2. 在 `ProjectCapsule` 中新增：
   - `constraints: readonly ConstraintRecord[]`
   - `nextStep: string | null`
3. 在 `CheckpointRecord` 中新增可选字段：
   - `constraints?: readonly ConstraintRecord[]`
   - `nextStep?: string | null`
4. 在 `BootstrapPayload` 中新增 continuity 输出字段：
   - `continuitySummary?: string | null`
   - `continuityPoints?: readonly string[]`
5. 在 `runtime.ts` 的预算裁剪逻辑中明确：
   - `constraints` 不参与普通裁剪
   - `nextStep` 不参与普通裁剪
   - continuity 预算和 bootstrap 预算分离

**Verification**
- Run: `npm run check:test`
- Expect: 类型相关测试与现有 runtime 测试无回归

**Acceptance Criteria**
- 热层 contracts 能表达约束和下一步
- 新字段不会破坏现有 primer/bootstrap/checkpoint 路径

## Task 2: Upgrade SQLite Hot Schema

**Why**
- 热层需要稳定存 `constraints` 和 `nextStep`，不能只临时拼在运行时。

**Context**
- 当前 schema version 为 `1`
- 当前 `project_state` 只存 `summary/active_task/updated_at`
- 当前 open loops / decisions / working set 分别存在独立表

**Files**
- Modify: `packages/hot-memory-sqlite/src/constants.ts`
- Modify: `packages/hot-memory-sqlite/src/schema.ts`
- Modify: `packages/hot-memory-sqlite/src/repository.ts`
- Modify: `packages/hot-memory-sqlite/src/client.ts`

**Steps**
1. 将 `HOT_MEMORY_SCHEMA_VERSION` 从 `1` 升到 `2`
2. 在 `project_state` 增加列：
   - `next_step TEXT`
3. 新增表 `pinned_constraints`：
   - `project_id`
   - `constraint_id`
   - `summary`
   - `priority`
   - `source_kind`
   - `updated_at`
4. 在 `schema.ts` 增加 migration 逻辑：
   - 已有数据库自动执行 `ALTER TABLE project_state ADD COLUMN next_step`
   - 不重复创建已有列/表
5. 在 `repository.ts` 中新增：
   - `readConstraints`
   - `replaceConstraints`
   - `mergeConstraints`
6. 更新 `toProjectCapsule` 和 `readStoredProjectCapsule`，把 `constraints/nextStep` 带出来
7. 更新 `writeCheckpointRecord`，支持写入新字段

**Verification**
- Run: `npm run check:hot-memory`
- Run: `npm run check:test`
- Expect: 旧数据库可升级，新数据库可直接创建，读写不报错

**Acceptance Criteria**
- 热层 schema 可升级
- 新旧项目都能稳定读取 capsule
- migration 失败时不破坏数据库文件

## Task 3: Add Continuity Capsule Builder

**Why**
- primer 只适合低 token 开场，不适合恢复被自动压缩后的当前开发状态。

**Context**
- 当前 bootstrap 会输出 `backgroundSummary/backgroundPoints/currentFocus/recentProgress`
- 需要新增一个更小、更硬、更适合“继续执行”的 continuity 包

**Files**
- Modify: `packages/memory-core/src/runtime.ts`
- Add: `scripts/continuity-cache.ts`
- Modify: `scripts/primer-cache.ts`

**Steps**
1. 在 `runtime.ts` 增加 continuity 组装函数：
   - 从 `constraints`
   - `activeTask`
   - `recentDecisions`
   - `openLoops`
   - `nextStep`
   - 高权重 `workingSet`
   生成固定模板 continuity pack
2. continuity pack 结构固定为：
   - Goal
   - Constraints
   - Chosen Route
   - Recent Decisions
   - Open Loops
   - Next Step
   - Critical Working Set
3. continuity 预算单独控制：
   - target 120-180 tokens
   - hard limit 220 tokens
4. 新增 continuity cache：
   - 默认路径建议：`~/.memory-runtime/continuity/<project-id>.md`
5. 允许 `primer` 与 `continuity` 分别缓存，互不覆盖

**Verification**
- Run: `npm run check:test`
- Expect: continuity 输出稳定、字段顺序固定、预算可控

**Acceptance Criteria**
- continuity 可独立生成
- continuity 比 full bootstrap 明显更小
- continuity 可表达当前任务连续性，不依赖自由文本摘要

## Task 4: Add `hmctl continuity`

**Why**
- 需要给 `AGENTS`、Codex App 和人工调试一个轻量级 continuity 入口。

**Context**
- 当前 `hmctl` 只有 `primer/bootstrap/checkpoint` 等命令
- continuity 需要成为单独命令，而不是让调用方自己拼接 bootstrap 结果

**Files**
- Modify: `scripts/hmctl.ts`
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `templates/AGENTS.memory.example.md`
- Modify: `docs/CODEX_APP.md`

**Steps**
1. 在 `hmctl.ts` 增加命令：
   - `continuity --cwd <dir> [--query <text>] [--json] [--force]`
2. continuity 默认行为：
   - 先读 continuity cache
   - cache miss 时从 hot capsule 重新构建
   - 不默认触发 cold recall
3. 当 query 明显是深历史问题时，continuity 返回 `insufficient_context` 提示，而不是偷偷升级成 full bootstrap
4. 更新帮助文本和 README，用法明确区分：
   - `primer` 用于开场
   - `continuity` 用于承接
   - `bootstrap` 用于深历史和 richer context

**Verification**
- Run: `./bin/hmctl continuity --cwd "$(pwd)" --json`
- Expect: 返回 continuity payload，且不依赖冷层成功

**Acceptance Criteria**
- `hmctl continuity` 独立可用
- 调用方不需要手搓 continuity 模板

## Task 5: Route Reads by Query Shape

**Why**
- 不同问题需要不同记忆层，不能所有问题都走 bootstrap。

**Context**
- 当前 `runtime.ts` 已有 `RecallQueryStrategy`
- 还缺“primer / continuity / bootstrap”之间的路由策略

**Files**
- Modify: `scripts/hmctl.ts`
- Modify: `packages/memory-core/src/runtime.ts`
- Add: `tests/continuity-routing.test.ts`

**Steps**
1. 定义承接型 query 规则：
   - 短文本
   - 指代词
   - `继续/刚才/A方案/下一步/别动这个` 这类形态
2. 在 CLI 层决定默认读取策略：
   - 新会话优先 `primer`
   - 承接型 query 优先 `continuity`
   - 深历史 query 才建议 `bootstrap`
3. 对高风险任务继续保持 conservative 模式
4. 记录 metrics：
   - primer hits
   - continuity hits
   - bootstrap fallbacks

**Verification**
- Run: `npm run check:test`
- Expect: 承接型 query 不会默认升级到 cold recall

**Acceptance Criteria**
- 查询路由可预测
- 低风险承接问题明显减少 bootstrap 调用

## Task 6: Add Background Compactor

**Why**
- 不做后台整理，热层会越来越脏，continuity 也会被旧垃圾污染。

**Context**
- 当前热层会累积旧 decisions/open loops/working set
- 当前没有显式的 supersede、过期清理、稳定项晋升策略

**Files**
- Add: `scripts/hot-memory-compactor.ts`
- Modify: `packages/hot-memory-sqlite/src/repository.ts`
- Add: `tests/compactor-merge.test.ts`
- Add: `tests/cold-promotion-policy.test.ts`

**Steps**
1. 实现 compactor 处理规则：
   - 去重重复 decisions
   - 关闭已解决 open loops
   - 按时间衰减 working set
   - 清理低权重旧错误项
2. 实现 supersede 策略：
   - 新路线覆盖旧路线
   - 新 next step 替代旧 next step
3. 连续性 cache 由 compactor 后台更新
4. 稳定项 promotion policy：
   - 连续两个 checkpoint 保持一致再考虑升 cold
   - milestone 完成时允许提升 digest/decisions
5. compactor 必须异步运行，不能进 Codex 启动同步链

**Verification**
- Run: `node --disable-warning=ExperimentalWarning --experimental-strip-types --import ./scripts/register-ts-loader.mjs ./scripts/hot-memory-compactor.ts --dry-run`
- Expect: 只输出整理计划，不影响正常会话

**Acceptance Criteria**
- 热层不会无限膨胀
- continuity 不再夹杂过期任务状态
- cold promotion 可控，不会把噪音晋升上去

## Task 7: Benchmarks and Regression Tests

**Why**
- 必须证明新层级真的减少 token 成本，并提高抗压缩恢复质量。

**Context**
- 当前已有 `bench:tokens`，但只比较 `primer/bootstrap/naive`
- 需要把 `continuity` 加进去

**Files**
- Modify: `benchmarks/run-token-savings-benchmark.ts`
- Modify: `benchmarks/README.md`
- Add: `tests/continuity-budget.test.ts`
- Add: `tests/constraints-pinning.test.ts`

**Steps**
1. benchmark 增加 `continuityTokens`
2. 输出比较项：
   - `primerTokens`
   - `continuityTokens`
   - `bootstrapTokens`
   - `naiveTokens`
3. 增加回归测试：
   - constraints 不被裁掉
   - nextStep 不被裁掉
   - continuity 在预算内
   - continuity 恢复比 primer 更完整，但比 bootstrap 更小

**Verification**
- Run: `npm run bench:tokens`
- Run: `npm run check:test`
- Expect: continuity token 体积介于 primer 和 bootstrap 之间

**Acceptance Criteria**
- 结果可量化
- “更稳且更省”不是口头结论

## Task 8: Docs and Operator Guidance

**Why**
- 这套东西以后要公开给别人装，文档必须把“原生 Codex、冷层复用、后台整理”讲清楚。

**Context**
- 当前文档已收敛到 `primer-first`
- 本轮要补 continuity 与 compactor

**Files**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `docs/CODEX_APP.md`
- Modify: `docs/SETUP.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Modify: `templates/AGENTS.memory.example.md`

**Steps**
1. 文档中明确三种入口：
   - `primer`
   - `continuity`
   - `bootstrap`
2. 明确说明：
   - 冷记忆后端继续复用
   - 不需要把 `memory-runtime` 挂回 Codex MCP
   - compactor 是后台辅助，不在启动链里
3. 增加 operator 说明：
   - 如果 cold backend 不可用，系统如何 fail-open
   - 如果已有自定义 Memory Palace 部署，如何继续复用

**Verification**
- Manual: 逐条对照当前实际行为
- Expect: 文档不再和实现相冲突

**Acceptance Criteria**
- 新用户能装
- 旧用户能迁移
- 不会再次误导到 MCP 启动链

## Rollout Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 7
7. Task 6
8. Task 8

说明：
- 先补 contracts 和 schema，后补 continuity 命令
- benchmark 与回归测试尽早加，避免后面重构失控
- compactor 放在 continuity 路径稳定后做

## Verification Matrix

- Unit / integration:
  - `npm run check:test`
- End-to-end local runtime:
  - `npm run check:all`
- Token benchmark:
  - `npm run bench:tokens`
- Manual smoke:
  - `hmctl primer --cwd "$(pwd)" --json`
  - `hmctl continuity --cwd "$(pwd)" --json`
  - `hmctl bootstrap --cwd "$(pwd)" --mode warm --query "why was route A chosen" --json`

## Cold Memory Reuse Decision

- 当前冷记忆服务健康检查正常
- 当前 `hmctl bootstrap` 已验证可成功使用 cold recall
- 本方案不替换 Memory Palace，不变更其 API 依赖
- 本轮仅增强上层热层连续性、压缩治理与读取路由

结论：

- 继续复用当前 Docker 中的冷记忆后端
- 不做冷层重建
- 不做冷层协议迁移
