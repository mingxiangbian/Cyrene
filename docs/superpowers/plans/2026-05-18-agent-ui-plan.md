# Agent UI 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 cc-local 加入终端 UI 层——实时展示思考状态和工具调用链，不改 llm-client 接口。

**架构：** 在 agent-loop 和调用者之间插入 AgentObserver 接口。agent-loop 在关键节点（思考开始/结束、工具调用开始/结束、最终响应）回调 observer，observer 的终端实现负责用 chalk + readline 渲染。agent-loop 不感知渲染细节。

**技术栈：** TypeScript, chalk（已有）, Node.js readline（已有），零新增依赖。

---

### 任务 1：定义 AgentObserver 接口

**文件：**
- 创建：`src/ui-observer.ts`

**方向：**

1. 定义 `AgentObserver` 接口，五个方法全是 `void` 返回、不抛异常：
   - `onThinkingStart()` — 模型开始推理
   - `onThinkingStop(durationMs: number)` — 模型推理结束，传入耗时
   - `onToolCallStart(name: string, summary: string)` — 工具调用开始，name 是工具名，summary 是从 arguments 提取的一行摘要（如文件名、行号、命令片段）
   - `onToolCallResult(name: string, ok: boolean, durationMs: number, summary: string)` — 工具执行完成，summary 是结果摘要（成功时简短，失败时截取错误信息前几个字）
   - `onResponse(text: string)` — 模型最终文本回答

2. 导出工具名到图标的映射函数 `toolIcon(name: string): string`，按此映射：
   - `file_read` `grep` `glob` → `📖`
   - `file_edit` `file_write` → `✏️`
   - `bash` → `⚡`
   - `web_search` → `🌐`
   - `ask_user` → `💬`
   - 其他 → `🔧`

3. 导出工具调用的参数摘要提取函数 `toolCallSummary(name: string, argumentsText: string): string`：
   - `file_read` → 取 file_path 的 basename
   - `file_edit` → 取 file_path basename + `:line`（若有）
   - `file_write` → 取 file_path basename
   - `grep` → 取 pattern
   - `glob` → 取 pattern
   - `bash` → 取 command 的前 60 个字符，去除换行
   - `web_search` → 取 query 的前 60 个字符
   - `ask_user` → 取 question 的前 60 个字符
   - 解析 argumentsText（JSON.parse），失败时返回原始字符串的前 40 字符

4. 编写 `summary` 和 `icon` 的测试，覆盖所有工具类型和 JSON 解析失败场景。

5. Commit。

---

### 任务 2：实现终端渲染 Observer

**文件：**
- 编辑：`src/ui-observer.ts`（在任务 1 的文件上追加）

**方向：**

1. 导出 `createTerminalObserver(output: NodeJS.WriteStream): AgentObserver` 工厂函数。默认用 `process.stderr`。

2. 内部维护状态：
   - `spinnerInterval` — setInterval 的引用，用于停止 spinner
   - `thinkingStartTime` — 毫秒时间戳
   - Braille spinner 帧序列：`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`

3. `onThinkingStart` 实现：
   - 记录当前时间到 `thinkingStartTime`
   - 启动 80ms 间隔的定时器，每次 tick 用 `\r` + `readline.clearLine` + 当前 spinner 帧 + `⏳ Thinking · X.Xs` 覆写同一行
   - 用 `process.stderr.write` 输出，保证管道/重定向时状态走 stderr

4. `onThinkingStop` 实现：
   - 清除定时器
   - `\r` + `readline.clearLine` 清除 spinner 行

5. `onToolCallStart` 实现：
   - 打印新行：`  ${icon} ${name} · ${summary}`（两个空格缩进，便于视觉对齐）

6. `onToolCallResult` 实现：
   - 成功：同行追加 `  ✓ ${duration}s`（绿色）
   - 失败：同行追加 `  ✗ ${summary}`（红色，summary 截取前 80 字符）
   - 同行的意思是 `process.stderr.write`，不换行以追加

7. `onResponse` 实现：
   - 打印分隔线：`chalk.dim('─'.repeat(process.stdout.columns || 60))`
   - 打印 text

8. 测试点：
   - `onToolCallStart` 输出格式含正确图标和缩进
   - `onToolCallResult` 成功标记绿色、失败标记红色
   - `onThinkingStart`/`onThinkingStop` 不崩溃（spinner 的定时器逻辑用 fake timers 测试）

9. Commit。

---

### 任务 3：在 agent-loop 中植入 Observer 回调

**文件：**
- 编辑：`src/agent-loop.ts`

**方向：**

1. 在 `RunAgentLoopBaseInput` 接口中新增可选字段：`observer?: AgentObserver`。从 `./ui-observer.js` 导入类型。

2. 在 `runAgentLoop` 函数的 while 循环中插入回调点：

   - **callModel 之前**：调用 `observer.onThinkingStart()`，记录开始时间。
   
   - **callModel 之后**：调用 `observer.onThinkingStop(elapsed)`。
   
   - **工具调用循环开始**（进入 for 循环，每个 toolCall 执行前）：调用 `observer.onToolCallStart(name, summary)`，其中 summary 来自 `toolCallSummary(name, argumentsText)`。在执行前记录开始时间。
   
   - **工具调用执行后**：调用 `observer.onToolCallResult(name, ok, elapsed, summary)`，其中 summary 是结果的一行摘要——成功时截取 content 前 60 字符，失败时取 content 前 80 字符。
   
   - **最终响应**（纯文本返回或超过 maxToolCalls 后）：调用 `observer.onResponse(text)`。

3. 关键细节：
   - observer 上的所有调用都用 `observer?.` 可选链，observer 为 undefined 时零影响。
   - `onThinkingStart` 在空响应重试的路径中也调用（用户需要看到每次推理都在进行）。
   - 工具调用循环中 `break` 前也要调 `onToolCallResult`，保证状态不丢失。

4. 一次性模式的 toolCallCount 统计逻辑不变，observer 调用不影响它。

5. 注释现有的 `runAgentLoop` 返回值和 while 循环结构，标记 observer 插入点。

6. Commit。

---

### 任务 4：升级 REPL 层

**文件：**
- 编辑：`src/repl.ts`

**方向：**

1. 在 `runRepl` 函数中创建 terminal observer：`const observer = createTerminalObserver(process.stderr)`。

2. 将 observer 传入 `runReplTurn` → `runAgentLoop` 调用链。

3. REPL 启动时打印欢迎行（在 while 循环之前）：
   - 格式：`cc-local · ${modelName} · /help`（modelName 从 config.model.model 取）
   - 用 chalk.dim

4. 实现两个新的 REPL 内置命令（在调用模型之前拦截）：

   - **`/help`**：打印可用命令列表：
     ```
     Commands:
       /help       Show this help
       /model      Show model info
       exit, quit, q   Exit REPL
     ```
   
   - **`/model`**：打印当前模型和 API 地址：
     ```
     Model:  Qwen3.5-9B-MLX-4bit
     API:    http://127.0.0.1:8080/v1
     ```
     从 `config.model.model` 和 `config.model.baseUrl` 取值。
   
   - **空输入**：continue 到下一轮循环（不调模型，不打印错误）。
   
   内置命令通过 `runReplTurn` 中新增的判断（在调 `runAgentLoop` 之前）。

5. REPL 正常退出时的每日 memory 压缩逻辑不变。

6. 注意：observer 通过 `runReplTurn` 的参数传递给 `runAgentLoop`。`runReplTurn` 的输入接口新增 `observer?: AgentObserver`。

7. Commit。

---

### 任务 5：一次性模式接入 Observer

**文件：**
- 编辑：`src/main.ts`

**方向：**

1. 在 `main` 函数的非 REPL 分支（`if (options.repl)` 的 else 块）中创建 terminal observer。

2. 将 observer 传入 `runAgentLoop` 调用。

3. 一次性模式不做 `/help` `/model` 命令（那些是 REPL 专属）。

4. 一次性模式下 `runAgentLoop` 完成后的 `console.log(chalk.green(result.finalText))` 保留不变——最终回答仍走 stdout，observer 的工具链状态已走 stderr，管道兼容性保持。

5. Commit。

---

### 任务 6：端到端验证

**文件：**
- 编辑：`tests/` 中对应测试文件

**方向：**

1. 为新加的 `toolCallSummary` 和 `toolIcon` 函数写单元测试——覆盖所有工具类型、未知工具、JSON 解析失败。

2. 为 `AgentObserver` 的终端渲染写测试——mock `process.stderr.write`，验证：
   - `onToolCallStart` 输出包含图标、工具名、参数摘要
   - `onToolCallResult` 成功输出包含 `✓`，失败包含 `✗`
   - `onThinkingStart` 启动了定时器，`onThinkingStop` 清除了它

3. 为 REPL 内置命令写测试——验证 `/help` `/model` 不调用 agent-loop，空输入跳过。

4. 运行全量测试确认无回归：`npm test`。

5. 手动测试 REPL 模式：
   - 启动 `npm run dev -- --repl`
   - 验证欢迎信息出现
   - 执行一个简单任务，观察 spinner → 工具调用 → 最终回答的完整流程
   - 执行 `/help` `/model` `/exit`
   - 输入空行确认无错误

6. 手动测试一次性模式：
   - `npm run dev -- "读取 package.json 并告诉我项目名"`
   - 验证工具链状态出现在终端，最终回答正确

7. Commit。
