# Permission & Security System — 权限与安全

## 来源
- GitHub: VILA-Lab/Dive-into-Claude-Code
- GitHub: LDCRsddh/analysis_claude_code
- 51CTO: Claude Code 遭深度逆向工程

---

## 7 层独立安全防护

Claude Code 不是靠单层安全机制，而是 7 层独立防线：

```
1. UI 输入验证         — 用户输入预处理
2. 消息路由验证        — 消息分发前的安全检查
3. 工具调用验证        — Tool Call 前的规则匹配
4. 参数内容验证        — 参数值的深度检查
5. 系统资源访问控制    — Shell 沙箱、文件系统边界
6. 输出内容过滤        — 响应内容的安全审查
7. Hook 拦截           — 用户自定义拦截规则
```

### 6 层安全链（逆向工程发现）

```
UI输入验证 → 消息路由验证 → 工具调用验证
→ 参数内容验证 → 系统资源访问 → 输出内容过滤
```

---

## 7 种权限模式

| 模式 | 行为 |
|------|------|
| plan | 只读，仅允许计划相关操作 |
| default | 每次工具调用需用户确认 |
| acceptEdits | 自动接受编辑类工具 |
| bypassPermissions | 完全自动（需用户显式授权） |
| acceptAll | 接受所有操作 |
| denyAll | 拒绝所有操作 |
| custom | 自定义规则组合 |

---

## Deny-First 规则引擎

权限检查的核心算法：

```
1. 检查 deny 规则列表 → 匹配则拒绝
2. 检查 allow 规则列表 → 匹配则允许
3. 检查权限模式约束 → 决定是否需要用户确认
4. 检查自动模式 ML 分类器 → 判断是否安全自动执行
5. 默认：提示用户确认
```

### 拒绝优先（Deny-First）原则
- 即使工具调用不匹配 deny 规则，也不会自动允许
- 必须先通过 deny 规则检查，才能进入 allow 检查
- 默认立场：任何不安全操作都需要用户确认

---

## Auto-Mode ML 分类器

在 `bypassPermissions` 模式下，一个 ML 分类器判断操作是否可以自动执行：
- 分析工具类型、参数、历史模式
- 高风险操作（如 `rm -rf`）始终需要确认
- 低风险操作（如 `ls`）自动通过

---

## Shell 沙箱

- Bash 命令在受限环境中执行
- 可配置允许/禁止的命令
- 文件系统访问边界控制
- 非恢复原则：恢复会话时不清除沙箱限制

---

## 工具安全属性

每个工具必须声明：

```typescript
{
  isReadOnly: boolean,        // 是否只读
  isConcurrencySafe: boolean, // 是否可并发
  isDestructive: boolean,     // 是否破坏性
  needsUserInteraction: boolean, // 是否需要用户交互
}
```

### FileEditTool 的安全约束
- **硬约束**（非 Prompt 软约束）：编辑前必须先 Read 文件
- 系统层面强制，不可通过 Prompt 绕过
- 防止 Agent 基于幻觉编辑文件

---

## Hook 安全拦截

Hooks 是确定性的安全机制（不同于 Prompt 的软约束）：

### 关键 Hook 事件
| 事件 | 用途 |
|------|------|
| PreToolUse | 工具执行前检查，可用 `exit 2` 阻止 |
| PostToolUse | 工具执行后审计日志 |
| SubagentStop | 子 Agent 停止时的检查 |
| PreCompact | 压缩前验证 |

### Hooks vs Prompts
| 维度 | Prompts | Hooks |
|------|---------|-------|
| 约束性质 | 软约束（模型可能忽略） | 硬约束（exit 2 不可绕过） |
| 可靠性 | 取决于模型理解 | 确定性执行 |
| 适用场景 | 引导、建议 | 安全策略、合规要求 |
