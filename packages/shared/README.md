# @monkagents/shared

MonkAgents 共享类型和工具库。

## 安装

```bash
npm install @monkagents/shared
```

## 使用

### 类型定义

```typescript
import {
  AgentStatus,
  AgentRole,
  AgentConfig,
  TaskStatus,
  TaskPriority,
  Task,
  Message,
  Session,
} from '@monkagents/shared';
```

### 工具函数

```typescript
import {
  generateId,
  generateShortId,
  delay,
  retry,
  formatDate,
  truncate,
  safeJsonParse,
} from '@monkagents/shared';

// 生成 UUID
const id = generateId(); // '550e8400-e29b-41d4-a716-446655440000'

// 生成短 ID
const shortId = generateShortId(); // 'a1b2c3d4'

// 延迟
await delay(1000);

// 带重试的异步操作
const result = await retry(
  () => fetchData(),
  { maxAttempts: 3, initialDelay: 1000 }
);

// 格式化日期
const formatted = formatDate(new Date()); // '2024/01/15 10:30'

// 截断字符串
const short = truncate('很长的文本...', 10); // '很长的文本...'

// 安全 JSON 解析
const data = safeJsonParse('{"a":1}', {}); // { a: 1 }
```

### 常量

```typescript
import {
  AGENT_ROLE_NAMES,
  AGENT_IDS,
  AGENT_ROLE_PRIORITY,
  DEFAULT_AGENT_MODELS,
  DEFAULT_AGENTS,
} from '@monkagents/shared';

// 角色名称映射
AGENT_ROLE_NAMES.master; // '师父'
AGENT_ROLE_NAMES.executor; // '执行者'

// 智能体 ID
AGENT_IDS.TANGSENG; // 'tangseng'
AGENT_IDS.WUKONG; // 'wukong'

// 角色优先级
AGENT_ROLE_PRIORITY; // ['master', 'executor', 'inspector', 'assistant', 'advisor']

// 默认模型配置
DEFAULT_AGENT_MODELS.master; // 'claude-opus-4-6'
```

## 类型说明

### AgentStatus

智能体状态类型。

```typescript
type AgentStatus =
  | 'idle'      // 空闲
  | 'thinking'  // 思考中
  | 'executing' // 执行中
  | 'offline';  // 离线
```

### AgentRole

智能体角色类型。

```typescript
type AgentRole =
  | 'master'    // 师父 - 协调者
  | 'executor'  // 执行者 - 主要执行
  | 'inspector' // 检查者 - 质量保证
  | 'assistant' // 助手 - 辅助支持
  | 'advisor';  // 顾问 - 战略指导
```

### TaskStatus

任务状态类型。

```typescript
type TaskStatus =
  | 'pending'    // 等待处理
  | 'thinking'   // 分析中
  | 'waiting'    // 等待中
  | 'executing'  // 执行中
  | 'paused'     // 已暂停
  | 'completed'  // 已完成
  | 'failed';    // 已失败
```

### AgentConfig

智能体配置接口。

```typescript
interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: AgentRole;
  persona: string;
  model: string;
  cli: {
    command: string;
    args: string[];
  };
  skills: string[];
  mcps: string[];
  capabilities: string[];
  boundaries: string[];
}
```

## 构建

```bash
npm run build
```

## 测试

```bash
npm test
```

## 许可证

MIT