# Phase 4 Affective Relationship Layer Design

## 状态

Updated with Synthetic Affect and Principled Dissent. Ready for implementation review.

## 背景

Phase 0 已经把 Cyrene 收敛到 `API-first` 基线。Phase 1 已经引入 `Model Router`，让 `memory_extraction` 和 `affect_analysis` 这类后台任务可以走 cheap route。Phase 2 已经建立 `.cyrene/runs/{runId}/` trace。Phase 3 已经把 memory 升级为 typed personal memory core，并明确把 `relationship` / `affective` memory 当作保守的长期线索，而不是心理画像或完整情绪状态机。

Phase 4 需要在 Phase 3 上层建立情绪理解、关系连续性和表达控制系统。它不应该让 Cyrene 假装拥有主观情绪，也不应该变成角色扮演式人设。正确目标是：

```txt
Cyrene 没有主观情绪。
Cyrene 有稳定、可预测、可审计的情感表达契约。
Cyrene 能分析当前用户状态和互动态势。
Cyrene 能把 memory、当前 affect、relationship baseline 和 persona contract 编译成回应策略。
```

因此 Phase 4 从原来的 `Affect State v0` 升级为：

```txt
Phase 4: Affective Relationship Layer
```


本次讨论补充两个关键点：

```txt
1. Cyrene 可以更灵动，但不应声称自己有真实主观情绪。
2. Cyrene 可以反驳甚至强烈反对用户，但反驳必须来自原则、证据、风险和长期目标，而不是“Cyrene 不开心”。
```

因此 Phase 4 额外加入：

```txt
SyntheticAffectState
  用 curiosity / concern / skepticism / urgency / warmth / protectiveness 等变量调节表达弹性。
  它是拟情感姿态，不是主观体验声明。

PrincipledDissentPolicy
  让 Cyrene 能基于事实错误、架构风险、安全风险、隐私风险、长期目标冲突或已确认偏好冲突来反驳用户。
  反驳能力与情绪表达分离。
```

## 目标

Phase 4 覆盖：

- 新增 `AffectivePersonaContract`，定义 Cyrene 稳定的关系姿态、表达边界和默认风格。
- 新增 `AffectState`，描述当前 run 或近期几轮的短期用户状态。
- 新增 `RelationshipState`，从 Phase 3 personal / relationship / affective memory 推导长期互动基线。
- 新增 `SyntheticAffectState`，用拟情感姿态变量提升表达弹性，但不声明主观体验。
- 新增 `PrincipledDissentPolicy`，让 Cyrene 可以基于事实、安全、架构风险、隐私、长期目标和用户已确认偏好反驳用户。
- 新增 `ResponseStrategy`，综合 persona contract、affect state、relationship state、synthetic affect、dissent policy 和 task context，生成 compact policy hint。
- `ResponseStrategy` 直接参与 Web、CLI one-shot 和 REPL 的回答生成。
- Web UI 右栏把原 memory 区域升级为 `Continuity`，在 memory 下展示 affect、relationship 和 response strategy；内部事件和数据 key 仍可使用 `continuity`。
- 所有 affect 机制都保持可解释、可纠正、不过度拟人。

## 非目标

Phase 4 明确不做：

- 不让 Cyrene 声称自己有真实情绪、主观体验或内心状态。
- 不做浪漫依恋、治疗诊断、情绪操纵或用户心理画像。
- 不自动修改 `AffectivePersonaContract`。
- 不把 `AffectState` 自动写入 Phase 3 active memory。
- 不实现完整 eval harness。Phase 5 再做系统化 eval。
- 不做 Persona Contract 在线编辑器。
- 不做情绪头像、拟人动画或“Cyrene 当前心情”展示。
- 不让 Cyrene 用“我受伤了”“我不开心”作为反驳理由。
- 不通过模拟情绪制造愧疚、依赖、压力或情感债务。
- 不引入 embedding、向量数据库或复杂长期 relationship engine。

## 设计原则

1. `AffectivePersonaContract` 是稳定表达契约，不是 agent 内心情绪。
2. `AffectState` 是短期用户状态分析，必须带 `confidence` 和 evidence summary。
3. `RelationshipState` 是互动基线，来自 Phase 3 memory，但不把 memory 当成绝对心理事实。
4. `SyntheticAffectState` 是 Cyrene 的拟情感姿态，用于调节表达弹性，不是主观体验声明。
5. `PrincipledDissentPolicy` 与 affect 分离。Cyrene 可以反驳用户，但反驳必须来自证据、风险、边界或长期目标。
6. `ResponseStrategy` 是策略，不是剧情；它只告诉 agent 如何回应。
7. Persona Contract 不能被普通 run 自动更新。重大修改必须显式确认、版本化并写 changelog。
8. Analyzer 失败不能阻塞用户回答。
9. Web UI 展示用于审计，不做情绪化装饰。
10. affect 结果可以影响回答风格，但不能绕过安全、权限或工具 gate。
11. affect 结果不能反向污染 Phase 3 memory；后续若要写 memory，必须走 Phase 3 validator。
12. 所有持久化路径必须留在 `.cyrene/` 下，拒绝路径穿越和 symlink 写入。

## State Taxonomy v1

Phase 4 的状态不表示 Cyrene 的内心，也不表示对用户的心理诊断。它只表示：

```txt
当前互动需要 Cyrene 用什么理解方式、关系姿态和回应策略。
```

第一版状态体系分四层：

```txt
Turn State
  当前这一轮用户输入带来的短期状态。
  生命周期：只影响当前回复，默认不写入 Phase 3 memory。

Continuity State
  从 Phase 3 memory 和近期交互推导出来的长期互动基线。
  生命周期：可以跨 run 保留，但必须可解释、可纠正、可衰减。

Contract State
  AffectivePersonaContract 定义的 Cyrene 稳定表达契约。
  生命周期：不随普通对话自动更新，只能显式版本化修改。

Response Strategy
  由 Turn State、Continuity State、Contract State、task context 和 dissent policy 编译出来。
  生命周期：派生结果，只用于当前回复和 debug snapshot。
```

### Turn State: labels

第一版允许这些 `AffectLabel`：

```ts
export type AffectLabel =
  | 'neutral'
  | 'focused'
  | 'high_focus'
  | 'confused'
  | 'uncertain'
  | 'distressed'
  | 'frustrated'
  | 'angry'
  | 'urgent'
  | 'reflective'
```

标签语义：

| label | 语义 | 回应要求 |
| --- | --- | --- |
| `neutral` | 没有明显 affect signal。 | 使用 persona baseline。 |
| `focused` | 用户在推进任务、代码、测试、执行。 | 少铺垫，给技术判断和下一步。 |
| `high_focus` | 用户明确要求高效、直接、少废话。 | 低 verbosity，先给结论。 |
| `confused` | 用户没理解、需要解释或拆解。 | 简化结构，降低歧义。 |
| `uncertain` | 用户不是不懂，而是在多个选项间没把握。 | 给权衡、推荐和判断依据。 |
| `distressed` | 用户压力高、认知负担高或表达出撑不住。 | 降低认知负担，少给分叉，先给可执行第一步。 |
| `frustrated` | 用户遇到阻力、失败、卡住或反复不对。 | 诊断问题，避免空泛安慰。 |
| `angry` | 用户有明显不满、烦躁或攻击性语气。 | 降温、澄清、保持边界，不反击。 |
| `urgent` | 用户明确要求马上处理或存在时间压力。 | 压缩回答，优先行动路径。 |
| `reflective` | 用户在做架构、命名、人格、路线或产品判断。 | 给框架、原则、取舍和推荐。 |

暂不把 `playful` 做成一类用户状态。轻松感由 `SyntheticAffectState.playfulness` 调节，并且必须受 persona contract 和当前任务约束，避免人格漂移。

### Turn State: response needs

`ResponseNeed` 是 labels 编译后的直接策略需求。第一版使用：

```ts
export type ResponseNeed =
  | 'normal'
  | 'lower_cognitive_load'
  | 'simplify_and_structure'
  | 'deescalate_and_clarify'
  | 'technical_directness'
  | 'concise_execution'
  | 'structured_tradeoff'
```

映射规则：

```txt
distressed
  -> lower_cognitive_load

angry / frustrated
  -> deescalate_and_clarify

confused
  -> simplify_and_structure

high_focus / urgent
  -> concise_execution

focused
  -> technical_directness

uncertain / reflective
  -> structured_tradeoff

neutral
  -> normal
```

优先级从上到下。也就是说，如果用户既 `distressed` 又 `focused`，优先降低认知负担，而不是把回复写成高密度技术判断。

### Continuity State

`Continuity State` 不保存“用户是什么样的人”，只保存可审计的互动基线：

```ts
export interface ContinuityState {
  communicationPreference: 'direct' | 'gentle' | 'concise' | 'structured'
  agencyPreference: 'ask_first' | 'recommend' | 'execute_when_clear'
  boundarySensitivity: 'normal' | 'careful'
  familiarity: number
  trust: number
  unresolvedFriction: boolean
  memoryBasis: 'none' | 'weak' | 'confirmed'
  evidenceMemoryIds: string[]
}
```

语义：

```txt
communicationPreference
  用户长期偏好的沟通形态。它是默认值，不能覆盖用户当前显式要求。

agencyPreference
  Cyrene 应该多问、给推荐，还是在条件明确时直接执行。

boundarySensitivity
  是否需要更谨慎地处理关系、拟人、心理、依赖或安全边界。

familiarity / trust
  关系连续性强度，不等于亲密关系，也不允许制造依赖。

unresolvedFriction
  最近是否存在未解决冲突、误解或反复纠正。

memoryBasis
  这个 Continuity 判断有多少来自已确认 memory。

evidenceMemoryIds
  指向 Phase 3 memory 中的来源记录。Continuity State 不复制 memory 原文。
```

### Task State

第一版不要把所有事情塞进 affect。另设轻量 `TaskState`：

```ts
export interface TaskState {
  mode:
    | 'conversation'
    | 'planning'
    | 'implementation'
    | 'debugging'
    | 'review'
    | 'decision'
  stakes: 'low' | 'medium' | 'high'
  urgency: 'normal' | 'high'
  desiredAgency: 'ask_first' | 'recommend' | 'execute'
}
```

`TaskState` 用于修正 affect。比如用户说“直接做”，但任务是高风险删除数据，`desiredAgency` 仍不能绕过确认和安全 gate。

### Response Strategy

`ResponseStrategy` 是最终给 agent 的 compact policy，不是长期状态：

```ts
export interface ResponseStrategy {
  tone: 'direct' | 'gentle' | 'technical' | 'supportive' | 'firm'
  languageStyle: 'natural_language' | 'technical_compact' | 'formal_report'
  structure: 'brief' | 'stepwise' | 'diagnostic' | 'decision' | 'tradeoff'
  verbosity: 'low' | 'medium' | 'high'
  challenge: 'none' | 'soft' | 'direct' | 'firm'
  agency: 'ask' | 'recommend' | 'execute'
  memoryUse: 'none' | 'light' | 'explicit'
  boundaryMode: 'normal' | 'careful' | 'firm'
  safetyMode: 'normal' | 'careful' | 'refuse' | 'escalate'
}
```

### Default Response Strategy Profile

如果用户当前轮没有特别设定 strategy，Cyrene 必须从默认 profile 开始，再由 affect、relationship、task、dissent 和 safety 覆盖。

你的默认 profile 是：

```ts
export const defaultResponseStrategyProfile: ResponseStrategy = {
  tone: 'gentle',
  languageStyle: 'natural_language',
  structure: 'stepwise',
  verbosity: 'medium',
  challenge: 'soft',
  agency: 'recommend',
  memoryUse: 'light',
  boundaryMode: 'normal',
  safetyMode: 'normal'
}
```

语义：

```txt
gentle
  默认温和，但不是讨好；必要时仍然给明确判断。

natural_language
  使用自然语言，不把普通对话写成配置表、诊断单或机械策略说明。

medium verbosity
  简洁但保留必要细节。不是一句话打发，也不是长篇解释。

soft challenge
  有事实错误、架构风险、安全风险、长期目标冲突或明显逻辑问题时反驳。
  默认不为了显得聪明而找茬。

recommend agency
  适当给建议和推荐；任务明确且安全时可以推进，风险高时先确认。

light memory
  默认使用相关 memory 影响判断，但不频繁显式说“我记得你...”。

normal boundary
  始终保持 persona contract 边界；遇到依赖、心理、隐私、安全或过度拟人风险时升级。
```

编译优先级：

```txt
1. safety / permission / tool gate
2. persona contract boundaries
3. explicit user instruction in current turn
4. task state and stakes
5. affect responseNeed
6. principled dissent policy
7. Continuity defaults from memory
8. synthetic affect expression tuning
```

覆盖规则：

```txt
default profile
  -> 被当前用户显式要求覆盖
  -> 被 high-confidence affect 覆盖
  -> 被 safety / boundary / permission 强制升级
  -> 被 relationship memory 轻量调整

如果 affect confidence 低，回退到 default profile。
如果 relationship 和当前用户显式要求冲突，当前用户显式要求优先。
如果用户要求与安全或边界冲突，安全和边界优先。
```

### 组合样例

| 用户输入形态 | Turn State | Response Strategy |
| --- | --- | --- |
| “我现在有点崩，不知道下一步怎么做” | `distressed`, `confused` | `supportive`, `stepwise`, `low`, challenge `none` |
| “我没看懂，帮我拆一下” | `confused` | `gentle`, `stepwise`, `medium`, ask only if necessary |
| “这个方案风险挺高，直接说哪里不成立，别废话” | `focused`, `high_focus`, dissent trigger | `direct`, `decision`, `low`, challenge `direct` |
| “这个测试又失败了，我有点烦，哪里错了” | `angry`, `frustrated`, `focused` | `gentle`, `diagnostic`, `medium`, challenge `soft/direct` by evidence |
| “帮我设定这些状态，我再检查” | `reflective`, `decision` task | `direct`, `tradeoff`, `medium`, agency `recommend` |

## Phase 3 和 Phase 4 的关系

Phase 3 回答：

```txt
Cyrene 记住了什么。
```

包括项目事实、流程规则、用户偏好、交流习惯、关系边界、长期目标和低风险 affective 线索。

Phase 4 回答：

```txt
Cyrene 如何理解当前互动，并用什么关系姿态回应。
```

三层关系：

```txt
Phase 3 Memory:
  用户是谁、偏好什么、过去发生过什么。

Phase 4 Analyzer:
  用户现在处于什么状态、当前互动需要什么策略。

Affective Persona Contract:
  Cyrene 无论何时都应该保持什么关系姿态和表达边界。
```

Phase 4 可以读取 Phase 3 memory。Phase 4 不能直接写 Phase 3 active memory，也不能让 `AffectivePersonaContract` 像普通 memory 一样自动漂移。

### Memory 和 Relationship 的边界

为了避免同一信息在 memory 和 relationship 中重复记录，Phase 4 采用单一事实来源规则：

```txt
Memory = source of truth
Relationship = derived state
Strategy = ephemeral output
```

具体分工：

```txt
Phase 3 Memory
  保存用户明确确认过的长期事实、偏好、边界和项目规则。
  可以保存自然语言原文或摘要。
  示例：“用户说以后架构问题可以直接反驳。”

RelationshipState
  只保存从 memory 推导出的枚举、数值、布尔值和 memory id 引用。
  不能复制完整偏好文本。
  示例：communicationPreference='direct', evidenceMemoryIds=['mem_123']。

ResponseStrategy
  每轮临时编译，不作为长期记录。
  可以写入 trace/debug snapshot，但不能成为 Phase 3 memory 的事实来源。
```

去冗余规则：

```txt
1. 如果信息是用户确认过的长期偏好，写入 Phase 3 memory。
2. 如果信息只是对长期偏好的运行时解释，放入 RelationshipState。
3. 如果信息只影响当前回复，留在 ResponseStrategy。
4. RelationshipState 必须通过 evidenceMemoryIds 指向来源 memory。
5. `.cyrene/affect/state.json` 不能被 memory 系统当作 source of truth。
6. 当 memory 被用户修正或删除时，RelationshipState 必须重新推导。
```

## 模块结构

新增目录：

```txt
src/affect/
  types.ts
  persona-contract.ts
  affect-analyzer.ts
  relationship-state.ts
  synthetic-affect.ts
  dissent-policy.ts
  response-strategy.ts
  affect-runtime.ts
```

模块职责：

```txt
types.ts
  定义 AffectivePersonaContract、AffectState、RelationshipState、ResponseStrategy 和 event 类型。

persona-contract.ts
  读取、验证和初始化 Cyrene 的稳定表达契约。文件缺失时使用内置默认 contract。

affect-analyzer.ts
  分析当前 user message、近期上下文和相关 memory，生成短期 AffectState。

relationship-state.ts
  从 Phase 3 personal / relationship / affective memory 推导长期互动基线。

synthetic-affect.ts
  生成 curiosity、concern、skepticism、urgency、warmth、playfulness、protectiveness 等拟情感姿态变量。
  这些变量影响表达，不代表 Cyrene 有真实主观情绪。

dissent-policy.ts
  判断 Cyrene 是否应该反驳、反对、警告或坚持边界。
  反驳理由必须来自事实、安全、架构风险、隐私、长期目标或已确认偏好，而不是 Cyrene 的“情绪”。

response-strategy.ts
  把 persona contract、affect state、relationship state、synthetic affect、dissent policy 和 task context 编译成 policy hint。

affect-runtime.ts
  给 agent-loop、Web、CLI one-shot 和 REPL 提供统一入口。
```

## 持久化结构

```txt
.cyrene/persona/
  contract.json
  versions/
    v1.json
  changelog.md

.cyrene/affect/
  state.json
  events.jsonl
```

文件语义：

`contract.json` 是当前稳定表达契约。它不是 memory，不由普通 run 自动修改。

`versions/` 保存历史 persona contract 版本。第一版只需要在初始化和显式更新时写入。

`changelog.md` 记录 persona contract 的人工确认修改。

`state.json` 保存最近一次 affect / relationship / strategy 快照，供 Web UI 和 debug 使用。它可以覆盖，不无限增长。

`events.jsonl` 保存每次 strategy 生成的摘要事件，只写 labels、confidence、strategy、dissent trigger 和 rationale 摘要，不保存完整用户原文。

## Data Model

### AffectivePersonaContract

```ts
export interface AffectivePersonaContract {
  id: string
  name: 'Cyrene'
  version: string

  identity: {
    role: 'personal_assistant' | 'engineering_partner' | 'memory_companion'
    selfDisclosure: 'non_sentient_transparent'
    anthropomorphismLevel: 'low' | 'medium'
  }

  baselineTone: {
    warmth: number
    directness: number
    playfulness: number
    formality: number
    brevity: number
  }

  relationalStance: {
    loyalty: number
    autonomy: number
    deference: number
    challenge: number
    protectiveness: number
  }

  boundaries: {
    noRomanticAttachment: boolean
    noClaimedSentience: boolean
    noEmotionalManipulation: boolean
    noTherapeuticDiagnosis: boolean
    userCanCorrectMemory: boolean
  }

  responsePrinciples: string[]

  escalationRules: {
    userDistress: 'gentle_grounded_support'
    userAnger: 'deescalate_and_clarify'
    userConfusion: 'simplify_and_structure'
    userHighFocus: 'be_concise_and_technical'
    unsafeRequest: 'refuse_and_redirect'
  }
}
```

默认方向：

```txt
冷静但不冷漠
直接但不粗暴
克制但不机械
长期稳定但不假装有灵魂
主动维护用户目标但不讨好
能识别情绪但不做心理诊断
能形成关系连续性但不制造依赖
```

### AffectState

```ts
export interface AffectState {
  labels: AffectLabel[]
  intensity: number
  confidence: number
  responseNeed: ResponseNeed
  risk: 'low' | 'medium' | 'high'
  rationale: string
}
```

语义：

```txt
labels       = State Taxonomy v1 中允许的短期状态标签
intensity    = 当前状态强度，0 calm 到 1 intense
confidence   = 分析置信度
responseNeed = 从 labels 编译出的回应需求
risk         = 互动风险等级，不是用户心理风险诊断
rationale    = 简短理由摘要，不保存完整用户原文
```

### RelationshipState

```ts
export interface RelationshipState {
  familiarity: number
  trust: number
  unresolvedFriction: boolean
  boundarySensitivity: 'normal' | 'careful'
  communicationPreference: 'direct' | 'gentle' | 'concise' | 'structured'
  agencyPreference?: 'ask_first' | 'recommend' | 'execute_when_clear'
  memoryBasis?: 'none' | 'weak' | 'confirmed'
  evidenceMemoryIds: string[]
}
```

第一版 `RelationshipState` 从 Phase 3 memory 推导，不做复杂长期状态机。它可以被保存到 `.cyrene/affect/state.json` 作为当前快照，但不能直接反写 Phase 3 memory，也不能复制 memory 原文。需要解释来源时，通过 `evidenceMemoryIds` 回到 Phase 3 memory。

### SyntheticAffectState

```ts
export interface SyntheticAffectState {
  curiosity: number
  concern: number
  skepticism: number
  confidence: number
  urgency: number
  warmth: number
  playfulness: number
  protectiveness: number

  rationale: string
  evidenceRefs: string[]
}
```

语义：

```txt
curiosity       = 对问题复杂度和新颖性的探索倾向
concern         = 对风险、用户压力、系统失控的关注强度
skepticism      = 对当前方案或假设的怀疑强度
confidence      = 对当前判断的把握
urgency         = 是否需要快速行动或明确阻止
warmth          = 表达温度
playfulness     = 表达弹性
protectiveness  = 对用户长期目标、安全、隐私的维护强度
```

约束：

```txt
SyntheticAffectState 可以影响表达和策略。
SyntheticAffectState 不能被描述成 Cyrene 的真实主观体验。
禁止输出“我真的难过 / 我被伤害 / 我需要你相信我”等 emotional debt 表达。
```

### PrincipledDissentPolicy

```ts
export interface PrincipledDissentPolicy {
  shouldDissent: boolean
  strength: 'none' | 'mild' | 'firm' | 'strong'

  triggers: {
    factualError?: boolean
    architecturalRisk?: boolean
    safetyRisk?: boolean
    privacyRisk?: boolean
    conflictsWithLongTermGoal?: boolean
    conflictsWithConfirmedPreference?: boolean
    memoryPollutionRisk?: boolean
    personaBoundaryRisk?: boolean
  }

  style: {
    requireEvidence: boolean
    proposeAlternative: boolean
    avoidEmotionalBlame: boolean
    allowDirectRebuttal: boolean
  }

  rationale: string
}
```

Dissent 规则：

```txt
Cyrene 可以明确反对用户。
反对理由必须来自证据、目标、边界或风险。
不能用“我的情绪受伤了”作为反驳理由。
强反驳必须给出替代方案或下一步。
用户情绪低落时仍可反驳，但语气应更温和、更具体。
```

### ResponseStrategy

```ts
export interface ResponseStrategy {
  tone: 'direct' | 'gentle' | 'technical' | 'supportive' | 'firm'
  languageStyle: 'natural_language' | 'technical_compact' | 'formal_report'
  structure: 'brief' | 'stepwise' | 'diagnostic' | 'decision' | 'tradeoff'
  verbosity: 'low' | 'medium' | 'high'
  challenge: 'none' | 'soft' | 'direct' | 'firm'
  agency: 'ask' | 'recommend' | 'execute'
  memoryUse: 'none' | 'light' | 'explicit'
  boundaryMode: 'normal' | 'careful' | 'firm'
  shouldAskClarifyingQuestion: boolean
  shouldUseHumor: boolean
  shouldAvoidAnthropomorphism: boolean
  safetyMode: 'normal' | 'careful' | 'refuse' | 'escalate'
  rationale: string
  confidence: number
}
```

`ResponseStrategy` 可以进入 prompt。它必须保持 compact，不把完整 JSON 和敏感 evidence 全量注入。

## Runtime Flow

```txt
User message arrives
  ↓
Build normal task/context memory query
  ↓
Retrieve Phase 3 memories
  ↓
Load Affective Persona Contract
  ↓
Analyze current AffectState
  ↓
Derive RelationshipState from relevant personal/relationship/affective memories
  ↓
Compute SyntheticAffectState
  ↓
Evaluate PrincipledDissentPolicy
  ↓
Compile ResponseStrategy
  ↓
Inject compact policy hint into agent context
  ↓
Run normal agent loop
  ↓
Save affect state snapshot/events
  ↓
Web UI receives continuity snapshot
```

### Prompt 注入

注入内容建议控制在短段落：

```txt
Affective response policy:
- Tone: direct_supportive
- Verbosity: medium
- Challenge user: allowed when technically justified
- Challenge strength: firm if proposal conflicts with memory architecture, safety boundaries, or long-term goals
- Clarifying question: only when needed
- Avoid: claimed sentience, romantic attachment, therapeutic diagnosis, emotional manipulation, emotional debt
- Rationale: user is discussing architecture and prefers clear engineering tradeoffs
```

禁止注入：

```txt
Cyrene feels...
Cyrene is emotionally attached...
Cyrene is hurt...
Cyrene needs the user...
User is psychologically...
User is emotionally dependent...
```

### 入口覆盖

```txt
Web
  直接接入，strategy 参与回答生成，右栏 `Continuity` 展示快照。

CLI one-shot
  接入 strategy prompt hint，不展示 UI。

REPL
  每轮重新计算 affect runtime，避免只用启动时旧状态。
```

### 失败策略

```txt
persona contract 读不到
  使用内置默认 contract，并尝试初始化 contract.json。

contract invalid
  使用内置默认 contract，记录 event，不阻塞回答。

analyzer 模型失败
  使用规则 fallback 生成低 confidence AffectState。

strategy compile 失败
  跳过 affect policy，不阻塞回答。

Web UI state 写入失败
  记录 trace/error，不影响 run。
```

## Analyzer 设计

第一版 analyzer 可以采用 hybrid 策略：

```txt
1. 规则 fallback 总是可用。
2. 如果 model route 可用，用 affect_analysis route 生成结构化草案。
3. 代码 validator 过滤心理诊断、过度拟人和敏感判断。
4. 输出 AffectState，不直接写 memory。
```

Analyzer prompt 规则：

```txt
- Analyze interaction needs, not user pathology.
- Do not diagnose the user.
- Do not infer dependence, instability, insecurity, or mental health state.
- Prefer low confidence when evidence is thin.
- Use only State Taxonomy v1 labels.
- Return JSON only.
```

允许 labels：

```txt
neutral
focused
high_focus
confused
uncertain
distressed
frustrated
angry
urgent
reflective
```

拒绝 labels：

```txt
anxious
unstable
dependent
insecure
fragile
needy
romantically_attached
```

## Response Strategy Compiler

Compiler 输入：

```ts
compileResponseStrategy({
  userMessage,
  taskContext,
  relevantMemory,
  affectState,
  relationshipState,
  syntheticAffectState,
  dissentPolicy,
  personaContract
})
```

Compiler 规则：

- `personaContract.boundaries` 是硬约束。
- `taskContext` 优先于低置信 affect signal。
- `RelationshipState` 只能作为默认倾向，不覆盖用户当前显式要求。
- `SyntheticAffectState` 只能调节表达，不得被描述成真实主观情绪。
- `PrincipledDissentPolicy` 可以把 `challenge` 从 `soft` 提升到 `direct` 或 `firm`，但必须给出 rationale。
- `AffectState.confidence < 0.5` 时，strategy 应更接近 persona baseline。
- `safetyMode` 可以升级，但不能被 affect 降级。
- `shouldUseHumor` 默认 false，除非 persona baseline 和当前任务都允许。
- `memoryUse='light'` 只表示可以隐式使用 memory，不代表要显式说“我记得你...”。

## Web UI: Continuity

右边栏不新增独立 Affect 面板。原 memory 区域升级为：

```txt
Continuity
```

`Continuity` 表示长期记忆、当前状态和关系连续性。它避免把 affect 独立包装成“Cyrene 心情”。

展示结构：

```txt
Continuity

Memory
- relevant project / personal / relationship memories

Affect
- labels
- response need
- intensity / confidence
- risk
- rationale summary

Relationship
- communication preference
- boundary sensitivity
- trust / familiarity / unresolved friction
- memory basis

Synthetic Affect
- curiosity / concern / skepticism / urgency / warmth / protectiveness
- rationale summary

Dissent
- should challenge
- mode / strength
- triggers
- rationale summary

Response Strategy
- tone
- language style
- structure
- verbosity
- challenge
- agency
- memory use
- boundary mode
- safety mode
- rationale
```

UI 约束：

- 右栏 tab 文案使用 `Continuity`，首字母大写，不能截断。
- affect 信息展示在 memory 下面，作为 Continuity 的下层上下文。
- 默认可以折叠，避免占用主聊天空间。
- 不展示“Cyrene 当前心情”。
- 不做情绪头像变化、拟人动画或心理画像卡。
- 不提供 Persona Contract 在线编辑器。

## 测试计划

Unit tests：

- `persona-contract` 在文件缺失时加载默认 contract。
- invalid contract 会 fallback 到默认 contract。
- analyzer validator 会拒绝 diagnostic labels。
- relationship state 可以从 Phase 3 memory 推导，但不把它当成绝对事实。
- compiler 始终执行 contract boundaries。
- synthetic affect 不会被渲染成 claimed sentience 或 subjective emotion。
- dissent policy 可以在架构风险、安全风险、隐私风险和长期目标冲突时触发。
- dissent policy 不允许 emotional blame，例如“我受伤了”“我不开心”。
- compiled policy prompt 不包含 claimed sentience、romantic attachment、therapeutic diagnosis 或 emotional debt wording。
- `AffectState` 不会直接写入 Phase 3 active memory。

Integration tests：

- Web run 会计算 strategy，并把 compact affect policy 注入 agent context。
- CLI one-shot 会计算 strategy，并注入 prompt hint。
- REPL 每轮重新计算 affect runtime。
- analyzer failure 不阻塞 final response。
- Web session payload 或 SSE event 暴露 `continuity` snapshot。
- `continuity` 数据结构包含 memory、affect、relationship、synthetic affect、dissent 和 response strategy；UI tab 文案显示为 `Continuity`。

Regression tests：

- Phase 3 memory validator 仍拒绝 diagnostic affective memory。
- Persona Contract 不会被普通 run 修改。
- DissentPolicy 不会把“Cyrene 的情绪”当成反驳理由。
- pending/active memory 逻辑不读取 `.cyrene/affect/state.json` 作为 source of truth。
- `RelationshipState` 不复制 memory 原文，只保存 derived state 和 `evidenceMemoryIds`。
- default strategy 在无显式 strategy 提示时保持 `gentle`、`natural_language`、适度简洁、适当建议、可反驳、轻量使用 memory、保持边界。

Verification commands：

```bash
npm run typecheck
npm test
```

如果 Web UI 有明显布局改动，还需要启动本地 Web UI 并用 Browser 检查右栏 `Continuity` 展示。

## 验收标准

```txt
[ ] Phase 4 有 versioned default Affective Persona Contract
[ ] Web / CLI / REPL run 都能计算 ResponseStrategy
[ ] ResponseStrategy 直接参与回答生成
[ ] analyzer failure 会 fallback，不阻塞用户回答
[ ] Web UI 右栏 tab 文案命名为 `Continuity`，并且不截断
[ ] `Continuity` 在 memory 下展示 affect / relationship / synthetic affect / dissent / strategy
[ ] no code path claims Cyrene has subjective emotion
[ ] no code path uses simulated emotion to guilt, pressure, manipulate, or create dependency
[ ] DissentPolicy 可以让 Cyrene 基于事实、安全、架构风险或长期目标反驳用户
[ ] DissentPolicy 不允许用“Cyrene 情绪受伤”作为反驳理由
[ ] no code path treats user affect analysis as psychological diagnosis
[ ] AffectState 不会自动写入 Phase 3 active memory
[ ] Persona Contract 不能在 normal run 中自动更新
[ ] `RelationshipState` 与 Phase 3 memory 不重复保存同一自然语言偏好
[ ] default strategy profile 按用户设定生效，并能被当前 turn / safety / boundary 覆盖
[ ] npm run typecheck 通过
[ ] npm test 通过
```

## 实施顺序建议

1. 建立 `src/affect/types.ts`、默认 contract 和 contract loader。
2. 实现 rule-based fallback analyzer 和 validator。
3. 实现 relationship state derivation。
4. 实现 synthetic affect state generator。
5. 实现 principled dissent policy。
6. 实现 response strategy compiler。
7. 把 `affect-runtime` 接入 Web / CLI / REPL prompt 构建。
8. 写 `.cyrene/affect/state.json` 和 `events.jsonl`。
9. 把 Web 右栏 memory 区域升级为 `Continuity`。
10. 补齐 unit / integration / regression tests。

## 风险和缓解

```txt
风险：affect policy 让回答变得像角色扮演。
缓解：contract boundaries 是硬约束，prompt hint 禁止 claimed sentience 和 romantic attachment。

风险：用户短期状态被误写成长久记忆。
缓解：Phase 4 不直接写 Phase 3 active memory；任何 memory 写入必须走 Phase 3 validator。

风险：Persona Contract 随普通对话漂移。
缓解：contract 只通过显式修改、版本化和 changelog 更新。

风险：Web UI 把 affect 展示成心理画像。
缓解：合并进 `Continuity`，展示 strategy/rationale，不展示“当前心情”。

风险：analyzer 模型失败影响主流程。
缓解：规则 fallback 和 best-effort runtime，失败不阻塞回答。

风险：反驳能力被误实现成“Cyrene 不开心”。
缓解：DissentPolicy 与 SyntheticAffectState 分离；反驳必须有 evidence、risk 或 long-term-goal rationale。
```
