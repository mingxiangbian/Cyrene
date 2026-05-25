# Codex MCP + Skill Local Bridge Design

## 状态

Approved for written spec review.

本 spec 定义 Cyrene 面向本机 Codex 的第一版全局 bridge：

```txt
Cyrene Codex Local Bridge MVP
```

第一版只启用：

```txt
MCP + Skill
```

不启用 hooks，不做 public plugin marketplace，不新开 repo。

## 背景

Cyrene 当前已经具备做 Codex bridge 的核心基础：

```txt
- API-first TypeScript agent runtime
- bin: cyrene -> src/main.ts
- project-local .cyrene/ state
- global ~/.cyrene/ state
- typed personal memory core
- Phase 4 affective relationship layer
- response strategy
- principled dissent
- trace / eval / evolution CLI
```

目标不是把 Cyrene 复制成一个独立 Codex 插件项目，而是让 Codex 在本机任意 repo 中可以调用 Cyrene 的 continuity 能力：

```txt
Codex task
  -> Cyrene MCP tools
  -> Cyrene project identity
  -> ~/.cyrene/codex/projects/<projectId>/
  -> compact memory + response strategy + dissent hint
```

本阶段优先验证本机全局可用性。未来如果需要分发，再把 `integrations/codex/plugin/` 打包成独立插件或同步到单独分发 repo。

## 决策

### 不新开 git repo

第一阶段继续使用 `/Users/phoenix/Assistant/Cyrene` 主仓库。

原因：

- MCP server 依赖 Cyrene 现有 memory、affect、dissent、config、CLI 模块。
- 在主仓库内实现最容易 typecheck、test 和 runtime 验证。
- 现在拆仓库会提前引入版本同步、路径安装、发布流程和调试成本。
- `integrations/codex/plugin/` 可以先按未来 plugin 形态放置，后续再分发。

### 只做 MCP + Skill

用户选择第一版范围为：

```txt
A. MCP + Skill only
```

因此本阶段不启用：

- `SessionStart` hook
- `UserPromptSubmit` hook
- `PreToolUse` hook
- `Stop` hook
- 自动 memory proposal
- 自动 config rewrite

这个边界能让 bridge 先被手动验证，不影响所有 Codex 会话。

## 目标

本阶段覆盖：

- 新增 `cyrene mcp-server --stdio`。
- 暴露只读或低风险 MCP tools。
- 新增 Codex project identity。
- 新增 Codex global memory root helper。
- 新增 compact continuity context adapter。
- 新增 `cyrene codex doctor`。
- 新增保守的 `cyrene codex install --dev`。
- 新增 `cyrene-continuity` skill skeleton。
- 本机通过 `~/.codex/config.toml` 注册 MCP。
- 本机通过 `~/.agents/skills/cyrene-continuity` symlink 注册 skill。
- 将 `agentmemory` 停用作为本机 MVP 验证前置条件，避免两个 memory source 同时参与 Codex 上下文。

## 非目标

本阶段不做：

- 不新开 repo。
- 不做 public plugin marketplace。
- 不启用 hooks。
- 不覆盖 `~/.codex/hooks.json`。
- 不自动改写 `~/.codex/config.toml`。
- 不自动关闭 Codex built-in memory 或 `agentmemory`；`agentmemory` 必须由用户确认后停用，doctor 负责明确报告是否仍启用。
- 不暴露 memory promote / delete。
- 不暴露 persona update。
- 不暴露 evolution approve。
- 不写 active memory。
- 不读取或保存完整 transcript。
- 不把 `AffectState` 直接写入 active memory。

## 目录结构

新增：

```txt
src/
  codex/
    codex-cli.ts
    codex-doctor.ts
    codex-install.ts
    codex-memory-root.ts
    continuity-context.ts
    project-id.ts

  mcp/
    mcp-json.ts
    mcp-server.ts
    tools/
      continuity-get.ts
      project-identify.ts

integrations/
  codex/
    plugin/
      skills/
        cyrene-continuity/
          SKILL.md
```

暂不新增：

```txt
integrations/codex/plugin/hooks/hooks.json
integrations/codex/plugin/.codex-plugin/plugin.json
integrations/codex/plugin/.mcp.json
```

这些属于后续 plugin packaging 阶段。

## Project Identity

新增 `src/codex/project-id.ts`。

职责：把任意 Codex 当前目录映射到稳定 project namespace。

规则：

```txt
input cwd
  -> resolve cwd
  -> git rev-parse --show-toplevel if available
  -> git config --get remote.origin.url if available
  -> basis = remote URL or git root or cwd
  -> projectId = sha256(basis).slice(0, 16)
```

输出：

```ts
export interface CodexProjectIdentity {
  projectId: string
  cwd: string
  gitRoot?: string
  gitRemoteHash?: string
  displayName: string
}
```

模型可见输出必须收敛：

```txt
projectId
displayName
gitRootExists
```

不要把完整 remote URL 注入模型上下文。完整绝对路径也只在本地 doctor/debug 中展示，不作为 continuity context 默认内容。

## Codex Memory Root

新增 `src/codex/codex-memory-root.ts`。

路径规则：

```txt
~/.cyrene/codex/
~/.cyrene/codex/projects/<projectId>/
~/.cyrene/codex/projects/<projectId>/memory/
```

第一版不在外部项目中自动创建 `.cyrene/`。这样 Codex 可以在任意 repo 使用 Cyrene continuity，而不会污染对方工作区。

现有 memory store 以 `cwd/.cyrene/memory` 为入口。为了支持 Codex global memory root，需要增加 root-level helper，而不是绕过安全检查：

```txt
readActiveMemoriesFromRoot(memoryRoot)
readPendingMemoriesFromRoot(memoryRoot)
```

现有 API 继续保留：

```txt
readActiveMemories(cwd)
  -> getReadableMemoryRoot(cwd)
  -> readActiveMemoriesFromRoot(memoryRoot)
```

MVP 只需要读取 active memory。pending 写入保留给后续 `memory_propose` 阶段。

## Continuity Context

新增 `src/codex/continuity-context.ts`。

职责：

```txt
cwd + userMessage + task
  -> identifyCodexProject
  -> read Codex project memory if exists
  -> retrieve relevant memories
  -> buildContinuitySnapshot
  -> return compact CodexContinuityContext
```

输出结构：

```ts
export interface CodexContinuityContext {
  project: {
    projectId: string
    displayName: string
  }
  memory: {
    items: Array<{
      id: string
      domain: string
      type: string
      strength: string
      content: string
    }>
  }
  strategy: {
    tone: string
    verbosity: string
    challenge: string
    boundaryMode: string
    safetyMode: string
    shouldChallengeUser: boolean
    shouldAskClarifyingQuestion: boolean
    rationale: string
  }
  dissent: {
    shouldChallenge: boolean
    mode: 'none' | 'gentle' | 'direct' | 'firm'
    reason: string
  }
}
```

不返回：

- 完整 `AffectState.evidence`。
- 完整用户 prompt。
- 完整 transcript。
- private remote URL。
- secrets。

当 Codex project memory 不存在时，`continuity_get` 仍应返回 project identity 和 response strategy。

## MCP Server MVP

新增 `src/mcp/mcp-server.ts`。

命令：

```bash
cyrene mcp-server --stdio
```

第一版只注册两个 tool：

```txt
cyrene_project_identify
cyrene_continuity_get
```

### `cyrene_project_identify`

输入：

```ts
{
  cwd?: string
}
```

输出：

```json
{
  "projectId": "...",
  "displayName": "Cyrene",
  "gitRootExists": true
}
```

### `cyrene_continuity_get`

输入：

```ts
{
  cwd?: string,
  userMessage: string,
  task?: "coding" | "planning" | "debugging" | "conversation" | "memory"
}
```

输出：`CodexContinuityContext` JSON text。

第一版不暴露：

```txt
cyrene_memory_propose
cyrene_memory_promote
cyrene_memory_delete
cyrene_persona_update
cyrene_evolution_approve
cyrene_shell_execute
```

## CLI Integration

修改 `src/main.ts`。

`isLocalCommandArgv` 增加：

```txt
mcp-server
codex
```

新增分支：

```txt
cyrene mcp-server --stdio
cyrene codex doctor
cyrene codex install --dev
```

`mcp-server` 只接受 stdio transport。其他 transport 不属于 MVP。

## Skill

新增：

```txt
integrations/codex/plugin/skills/cyrene-continuity/SKILL.md
```

skill 目标：告诉 Codex 什么时候、如何使用 Cyrene。

触发场景：

```txt
- Cyrene 项目本身
- long-running engineering work
- architecture decisions
- memory / affect / response strategy 设计
- principled dissent
- MCP / Codex integration
- persistent project context
```

核心规则：

```txt
1. 任务需要长期项目上下文时，调用 `cyrene_continuity_get`。
2. Cyrene memory 是上下文线索，不是无需验证的事实。
3. 如果用户方案和 safety、privacy、architecture、Phase 3/4 边界冲突，要直接指出。
4. 不声称 Cyrene 有主观情绪。
5. 不做心理诊断。
6. 不把 affective observation 直接写进 active memory。
7. MVP 不要求 hooks，不要求自动 memory proposal。
```

## 本机安装策略

第一版安装必须可逆、非覆盖。

### Memory Source Policy

本机 MVP 使用 Cyrene 作为 Codex continuity 的唯一外部 memory source。

因此验证前必须停用：

```txt
agentmemory MCP server
```

原因：

- 避免 Cyrene memory 和 `agentmemory` 同时注入上下文。
- 避免同一轮对话被两个 memory system 重复提取。
- 避免后续排查 memory pollution 时无法判断 source of truth。

`cyrene codex install --dev` 不直接修改 `~/.codex/config.toml`，但必须打印停用 `agentmemory` 的明确操作建议。推荐策略：

```txt
1. 从 ~/.codex/config.toml 移除或注释 [mcp_servers.agentmemory] block。
2. 如果当前 Codex config 支持 enabled = false，也可以保留 block 但显式禁用。
3. 重新启动 Codex 后用 doctor 再检查。
```

如果 `agentmemory` 仍启用，MVP 验证状态应显示为 not ready。

### `cyrene codex doctor`

检查：

```txt
runtime:
  node >= 20
  cyrene CLI 可执行

codex:
  ~/.codex/config.toml 是否存在
  cyrene MCP 是否配置
  agentmemory 是否已停用
  hooks 是否存在但 MVP 忽略
  Codex built-in memory 状态只提示

skill:
  ~/.agents/skills/cyrene-continuity 是否存在
  symlink target 是否指向当前 repo

state:
  ~/.cyrene/codex 是否存在或可创建
  当前 cwd 是否能 identify project
```

doctor 不修改任何文件。

如果检测到 active `agentmemory` config，doctor 输出应包含：

```txt
agentmemory: enabled
status: not ready
action: disable [mcp_servers.agentmemory] before validating Cyrene as the authoritative memory source
```

### `cyrene codex install --dev`

第一版只做实际写入：

```txt
mkdir -p ~/.agents/skills
ln -snf /Users/phoenix/Assistant/Cyrene/integrations/codex/plugin/skills/cyrene-continuity ~/.agents/skills/cyrene-continuity
mkdir -p ~/.cyrene/codex
```

不写：

```txt
~/.codex/config.toml
~/.codex/hooks.json
```

它只打印 MCP config 建议：

```toml
[mcp_servers.cyrene]
command = "cyrene"
args = ["mcp-server", "--stdio"]
enabled = true
required = false
startup_timeout_sec = 20
tool_timeout_sec = 60
```

同时打印 `agentmemory` 停用建议，但不自动编辑 config。

如果 `cyrene` 不在 PATH，doctor 提示开发期可使用 `npx tsx /Users/phoenix/Assistant/Cyrene/src/main.ts mcp-server --stdio`。

## Safety And Privacy

本阶段的安全边界：

- MCP 只读。
- 不写 active memory。
- 不保存完整 transcript。
- 不返回完整 affect evidence。
- 不暴露 destructive tools。
- 不修改 Persona Contract。
- 不覆盖全局 Codex 配置。
- 不启用 hooks。

`PreToolUse` 这类 guardrail 留到后续阶段。MVP 不把 Cyrene 当作 Codex 的安全沙盒。

## 测试策略

新增或修改测试：

```txt
tests/codex-project-id.test.ts
tests/codex-memory-root.test.ts
tests/codex-continuity-context.test.ts
tests/mcp-server.test.ts
tests/codex-cli.test.ts
```

覆盖：

- git repo project identity 稳定。
- no-git directory project identity 稳定。
- remote URL 不出现在 model-visible context。
- Codex memory root 位于 `~/.cyrene/codex/projects/<projectId>/memory`。
- 无 memory 时 `continuity_get` 仍返回 strategy。
- MCP server 注册两个 tool。
- `cyrene codex doctor` 不写文件。
- `cyrene codex install --dev` 不写 `~/.codex/config.toml` 和 `~/.codex/hooks.json`。
- `agentmemory` active 时 doctor 标记 MVP not ready。
- `install --dev` 打印停用 `agentmemory` 的手动操作建议。

验证命令：

```bash
npm run typecheck
npm test
npm run dev -- codex doctor
npm run dev -- codex install --dev
```

`mcp-server --stdio` 是长期进程，验证时用 MCP inspector 或专门测试启动，不把它作为会自然退出的普通 command。

## 验收标准

本阶段完成时应满足：

```txt
[ ] npm run typecheck 通过
[ ] npm test 通过
[ ] cyrene mcp-server --stdio 可被 Codex 配置启动
[ ] cyrene_project_identify 可返回稳定 project id
[ ] cyrene_continuity_get 在无 memory 时仍返回 compact strategy
[ ] ~/.agents/skills/cyrene-continuity symlink 可创建
[ ] agentmemory 已停用，doctor 显示 ready
[ ] ~/.codex/config.toml 未被自动覆盖
[ ] ~/.codex/hooks.json 未被修改
[ ] 外部项目未被自动创建 .cyrene/
```

## 后续阶段

MVP 验证通过后，再考虑：

```txt
Phase B:
  - cyrene_memory_propose
  - pending-only write
  - Stop hook optional install

Phase C:
  - SessionStart / UserPromptSubmit / PreToolUse hooks
  - hook merge strategy
  - redaction

Phase D:
  - integrations/codex/plugin/.codex-plugin/plugin.json
  - .mcp.json
  - personal marketplace packaging

Phase E:
  - contrast eval suite
  - baseline vs skill vs MCP vs full hooks
```

不要在 MVP 中提前实现这些阶段。
