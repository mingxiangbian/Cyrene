# Cyrene Naming Foundation Design

## 目标

把当前项目统一迁移为 `Cyrene`，作为后续 API-first、local-first 个人认知运行时升级的第一步。

本次只做命名地基，不实现 Phase 0 的 FeatureFlags、T2I optional capability、Model Router、Trace Store、Typed Memory、Affect State、Eval Harness 或 Evolution Loop。原因是这些后续能力都会依赖最终命名。如果先继续在旧命名上扩展，后面会重复修改 env、state path、CLI、README、测试和文档。

## 当前结构判断

CodeGraph 已为项目建立索引，当前项目主要入口链路是：

```txt
src/main.ts
  -> buildAgentRuntime()
       -> createDefaultConfig()
       -> memory loaders
       -> createCoreTools()
  -> runAgentLoop()
```

命名迁移会影响这些边界：

```txt
src/config.ts                // env、全局 state dir、默认模型配置
src/main.ts                  // CLI 名称、描述、Web 启动输出
src/prompts/system.md        // 默认助手身份
src/memory.ts                // project/global memory 路径
src/session-store.ts         // project session 路径
src/web/prompt-context.ts    // runtime 装配时使用 config.user*Dir
src/web/static/*             // Web UI identity，当前多数已经是 Cyrene
scripts/setup-local-state.mjs // 初始化本地 state
package.json                 // package name、bin
README.md / .env.example     // 新用户文档和配置
tests/*                      // 配置、CLI、memory、session、Web 断言
```

`src/tools/index.ts` 目前的 `createCoreTools()` 不接收 config，因此本次不改工具开关。后续 Phase 0 再把它改为 `createCoreTools(config)` 并接入 feature flags。

## 命名规则

统一后的命名规则：

```txt
项目名:          Cyrene
runtime 名:      Cyrene
默认助手名:      Cyrene
package name:    cyrene
CLI binary:      cyrene
env prefix:      CYRENE_*
project state:   .cyrene/
global state:    ~/.cyrene/
Web UI title:    Cyrene
GitHub repo:     mingxiangbian/Cyrene
local checkout:  /Users/phoenix/Assistant/Cyrene
```

旧命名不保留为运行时兼容层：

```txt
不保留旧 base URL env alias
不保留旧 model env alias
不读取旧 project state dir 作为 fallback
不读取旧 global state dir 作为 fallback
```

如果用户环境里还有旧变量，需要改成：

```env
CYRENE_BASE_URL=...
CYRENE_MODEL=...
```

## State 迁移策略

本次采用干净迁移，不迁移旧 session 和 daily memory。

项目内旧 state：

```txt
旧 project sessions dir       // 删除，不迁移
旧 project daily memory       // 删除，不迁移
旧 project metadata residue   // 删除
```

全局旧 state：

```txt
旧 global Rule.md             // 用户已删除，不迁移
旧 global soul.md             // 用户已删除，不迁移
旧 global state dir           // 若迁移时为空或只剩无价值残留，可删除
```

新 state：

```txt
.cyrene/memory/daily.md       // setup 或运行时按需创建
.cyrene/sessions/             // 新 Web/REPL session 按需创建
~/.cyrene/                    // 新全局配置目录，按需创建
```

这意味着旧 session 历史会丢弃。这个行为是有意的，符合当前决策：功能一致优先，旧历史不重要。

## 配置设计

`AppConfig` 中的命名应从旧项目语义改为 Cyrene 语义。

建议调整：

```ts
legacy user dir field -> userCyreneDir
```

`createDefaultConfig(cwd)` 应读取：

```txt
CYRENE_BASE_URL
CYRENE_MODEL
```

并继续保留当前默认值，直到 Phase 0 再把本地 MLX 从默认主路径降级为 optional backend：

```txt
baseUrl: http://127.0.0.1:8080/v1
model:   Qwen3.5-9B-MLX-4bit
```

本次不引入：

```txt
CYRENE_MODEL_PROVIDER
CYRENE_API_KEY
CYRENE_CHEAP_MODEL
CYRENE_ENABLE_T2I
FeatureFlags
```

这些属于后续 Phase 0/Phase 1。

## Runtime 和数据流

启动流程迁移后应为：

```txt
cyrene command
  -> src/main.ts parses CLI options
  -> buildAgentRuntime(cwd)
  -> createDefaultConfig(resolve(cwd))
  -> load ~/.cyrene/soul.md if present
  -> load ~/.cyrene/Rule.md if present
  -> load project .cyrene/instructions.md if present
  -> load project .cyrene/memory/*
  -> load project .cyrene/memory/daily.md
  -> createCoreTools()
  -> runAgentLoop()
```

Session flow 迁移后应为：

```txt
createSession/loadSession/appendSessionEvent/deleteSession
  -> <project>/.cyrene/sessions/index.json
  -> <project>/.cyrene/sessions/<session-id>.jsonl
```

Memory write flow 迁移后应为：

```txt
writeMemoryEntry/updateMemoryIndex/compactDailyIfNeeded
  -> <project>/.cyrene/memory/MEMORY.md
  -> <project>/.cyrene/memory/*.md
  -> <project>/.cyrene/memory/daily.md
```

## 错误处理

如果用户只配置了旧 base/model env，运行时不再读取它们。错误表现应是回落到默认 `CYRENE` 配置，而不是静默兼容旧变量。

如果旧 project state dir 存在，运行时不读取它。是否删除旧目录由迁移步骤或用户手动清理完成。

如果 `.cyrene/` 不存在，setup 或运行时写入路径应按现有安全规则创建目录，并继续保持：

```txt
拒绝 symlink
拒绝 path traversal
写入必须 stay inside project
```

这些安全语义来自现有 `memory.ts` 和 `session-store.ts`，迁移时不能放松。

## 残留策略

迁移完成后，运行时代码不应依赖旧名。

验收时运行：

```bash
rg legacy-name-pattern
```

允许残留仅限：

```txt
迁移设计/spec/plan 中描述旧名
测试中验证旧 env 被忽略
测试中验证旧目录不再被读取
git history 不计入
```

不允许残留：

```txt
package.json active name/bin
README 新用户路径
.env.example active env
src/*.ts runtime path/env/type/property
src/prompts/system.md 当前身份
src/web/static/* 当前 UI 文案
scripts/setup-local-state.mjs active setup path
```

## 测试策略

至少更新并运行：

```bash
npm run typecheck
npm test
```

重点测试：

```txt
config.test.ts
  - 默认 userCyreneDir 是 ~/.cyrene
  - CYRENE_BASE_URL/CYRENE_MODEL 生效
  - 旧 base/model env 被忽略

main-cli.test.ts
  - CLI name/help/output 使用 cyrene
  - Web server 输出 cyrene web listening
  - system prompt 加载 ~/.cyrene 与 .cyrene 内容

memory-load.test.ts / memory.test.ts / memory-integration.test.ts
  - instructions、Rule、memory、daily 都从 .cyrene 读取
  - 旧 project state dir 不再作为 fallback

session-store.test.ts / repl.test.ts / web-server.test.ts
  - sessions 写入 .cyrene/sessions
  - resume/load/delete 仍保持路径安全

server-start.test.ts / README examples
  - 命令和文档使用 cyrene
```

额外检查：

```bash
rg "CC_LOCAL|cc-local"
rg legacy-name-pattern
git status --short
```

## GitHub 和本地目录迁移

实现阶段需要单独处理仓库身份：

```txt
GitHub repo: old repository name -> mingxiangbian/Cyrene
origin remote: update to new repo URL
local checkout: old checkout path -> /Users/phoenix/Assistant/Cyrene
```

已知经验：当前 `gh repo edit --name` 可能不支持重命名，应优先使用：

```bash
gh api --method PATCH repos/<owner>/<old-repo> -f name=Cyrene
```

然后立即更新 `origin` remote。实现计划需要把这个步骤放在代码和测试通过之后，避免远端名称先变而本地代码未完成。

## 非目标

本次不做：

```txt
FeatureFlags
T2I 默认关闭
T2I provider registry
Model Router
API key 管理
Trace Store
Typed Memory
Affect State
Eval Harness
Controlled Evolution
Tauri App
Web 前端框架迁移
```

这些能力按升级路线后续分阶段设计和实现。

## 成功标准

完成后应满足：

```txt
新用户只看到 Cyrene
运行时代码不依赖旧项目名、旧 env prefix 或旧 state dir
CYRENE_BASE_URL/CYRENE_MODEL 是唯一 active model env
项目 state 写入 .cyrene/
全局 state 读取 ~/.cyrene/
旧 sessions 和 daily memory 不迁移
npm run typecheck 通过
npm test 通过
rg 残留只出现在允许范围
GitHub repo、origin remote、本地 checkout 名称对齐
```
