# MonkAgents 🧘

基于西游记角色的多智能体协同平台。

## 项目简介

MonkAgents 是一个创新的多智能体协作平台，采用中国古典名著《西游记》中的角色模型。每个智能体都有独特的角色定位、人设和专业技能，通过协作完成复杂的软件工程任务。

### 角色介绍

| 角色 | 名称 | 职责 | 特点 |
|------|------|------|------|
| 🧘 唐僧 | Master | 团队领导者 | 深思熟虑，善于分析和协调，负责任务分解 |
| 🐵 孙悟空 | Executor | 主要执行者 | 技术能力强，反应迅速，负责编码实现 |
| 🐷 猪八戒 | Assistant | 助手 | 乐于助人，处理文档编写、格式整理等辅助任务 |
| 🧔 沙和尚 | Inspector | 检查者 | 细心认真，负责代码审查、测试验证、质量保证 |
| 🙏 如来佛祖 | Advisor | 资深顾问 | 经验丰富，提供架构设计和战略指导 |

## 功能特性

- 🤖 **多智能体协作** - 五个智能体各司其职，协同工作
- 🎭 **人设驱动** - 每个智能体拥有独特人设，回复风格鲜明
- 📝 **配置化架构** - 人设、任务匹配、执行提示完全由 YAML 配置驱动
- 💬 **实时通信** - WebSocket 支持实时消息推送和流式输出
- 📝 **会话管理** - 支持多会话、工作目录配置
- 🗄️ **数据持久化** - MySQL 数据库 + Redis 缓存
- 🔧 **目录浏览** - 前端可选择服务器端工作目录
- ⚙️ **灵活配置** - YAML 格式的系统和智能体配置
- 🎨 **现代前端** - 三栏式响应式界面

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- MySQL >= 8.0
- Redis >= 6.0 (可选，用于对话历史持久化)
- Claude CLI (用于实际智能体执行)

### 安装

```bash
# 克隆项目
git clone https://github.com/fridayaha/MonkAgents.git
cd MonkAgents

# 安装依赖
npm install

# 构建项目
npm run build
```

### 数据库配置

创建 MySQL 数据库：
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS monkagents CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

配置 `configs/system.yaml`:

```yaml
database:
  type: mysql
  host: localhost
  port: 3306
  username: root
  password: your_password
  database: monkagents

redis:
  host: localhost
  port: 6379
  keyPrefix: 'monkagents:'
```

### 运行

```bash
# 同时启动前后端 (推荐)
npm run start:all

# 或分别启动
npm run start:dev      # 后端服务 (开发模式，热重载)
npm run start:frontend # 前端服务
```

访问 http://localhost:5173 打开前端界面。

后端 API 运行在 http://localhost:3000。

### 服务管理

```bash
# 查看服务状态
npm run status

# 重启所有服务
npm run restart

# 单独重启
npm run restart:backend
npm run restart:frontend

# 停止服务
npm run stop           # 停止所有
npm run stop:backend   # 停止后端
npm run stop:frontend  # 停止前端
```

### 测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test -w @monkagents/backend -- --testPathIgnorePatterns="e2e"

# 运行测试覆盖率
npm run test:cov -w @monkagents/backend

# 运行 e2e 测试
npm run test:e2e -w @monkagents/backend
```

## 项目结构

```
MonkAgents/
├── packages/
│   ├── frontend/          # Web 前端 (Vite + 原生 JS)
│   │   └── src/
│   │       ├── index.html # 主页面 (三栏布局)
│   │       ├── styles/    # CSS 样式
│   │       │   └── main.css
│   │       └── scripts/   # JavaScript
│   │           ├── app.js       # 主应用逻辑
│   │           ├── api.js       # REST API 封装
│   │           └── websocket.js # WebSocket 通信
│   ├── backend/           # NestJS 后端
│   │   └── src/
│   │       ├── main.ts         # 入口文件
│   │       ├── app.module.ts   # 根模块
│   │       ├── config/         # 配置服务
│   │       ├── database/       # 数据库模块 (TypeORM)
│   │       │   └── entities/   # 数据实体
│   │       ├── agents/         # 智能体模块
│   │       │   ├── agent-base.ts            # 智能体基类
│   │       │   ├── executable-agent-base.ts # 可执行智能体基类
│   │       │   ├── agent-registry.service.ts # 智能体注册表
│   │       │   ├── agents.service.ts        # 智能体服务
│   │       │   ├── task-planner.ts          # 任务规划器
│   │       │   ├── tangseng.agent.ts        # 唐僧智能体 (协调者)
│   │       │   ├── wukong.agent.ts          # 孙悟空智能体 (执行者)
│   │       │   ├── bajie.agent.ts           # 猪八戒智能体 (助手)
│   │       │   ├── shaseng.agent.ts         # 沙和尚智能体 (检查者)
│   │       │   └── rulai.agent.ts           # 如来佛祖智能体 (顾问)
│   │       ├── session/        # 会话模块
│   │       ├── websocket/      # WebSocket 模块
│   │       ├── redis/          # Redis 模块 (对话历史)
│   │       ├── cli/            # CLI 进程管理
│   │       │   ├── cli.service.ts  # CLI 服务
│   │       │   ├── cli.parser.ts   # 流式输出解析
│   │       │   └── cli.session.ts  # 会话管理
│   │       ├── tasks/          # 任务模块
│   │       ├── scheduler/      # 调度器模块
│   │       └── debug/          # 调试接口
│   └── shared/            # 共享包
│       └── src/
│           ├── types/     # 类型定义
│           ├── constants/ # 常量
│           └── utils/     # 工具函数
├── configs/
│   ├── system.yaml        # 系统配置
│   └── agents/            # 智能体配置 (人设 + 行为)
│       ├── tangseng.yaml  # 唐僧配置
│       ├── wukong.yaml    # 孙悟空配置
│       ├── bajie.yaml     # 猪八戒配置
│       ├── shaseng.yaml   # 沙和尚配置
│       └── rulai.yaml     # 如来佛祖配置
├── data/                  # 数据存储目录
├── skills/                # 智能体技能
├── scripts/               # 服务管理脚本
│   ├── start-all.js       # 启动所有服务
│   ├── stop-all.js        # 停止所有服务
│   └── status.js          # 服务状态检查
├── docker/                # Docker 配置
└── docs/                  # 文档
```

## API 文档

### REST API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/info | 系统信息 |
| GET | /api/agents | 获取智能体列表 |
| GET | /api/agents/:id | 获取智能体详情 |
| POST | /api/sessions | 创建会话 |
| GET | /api/sessions | 获取会话列表 |
| GET | /api/sessions/:id | 获取会话详情 |
| DELETE | /api/sessions/:id | 删除会话 |
| GET | /api/debug/:taskId | 获取任务调试信息 |
| GET | /api/debug/:taskId/logs | 获取任务执行日志 |
| GET | /api/debug/metrics/summary | 获取系统指标摘要 |
| GET | /api/debug/fs/browse | 浏览服务器目录 |

### WebSocket 事件

**客户端 → 服务端:**

| 事件 | 参数 | 描述 |
|------|------|------|
| `join` | sessionId | 加入会话房间 |
| `leave` | sessionId | 离开会话房间 |
| `message` | { sessionId, content } | 发送消息 |
| `cancel` | taskId | 取消任务 |
| `ping` | - | 心跳检测 |

**服务端 → 客户端:**

| 事件 | 数据 | 描述 |
|------|------|------|
| `connected` | { message, timestamp } | 连接成功 |
| `joined` | { sessionId, message } | 加入会话确认 |
| `message` | Message | 新消息通知 |
| `session_history` | { sessionId, messages, count } | 会话历史消息 |
| `agent_status` | { agentId, status, action } | 智能体状态更新 |
| `task_status` | { taskId, status, message } | 任务状态更新 |
| `stream` | StreamChunk | 流式输出块 (打字机效果) |
| `error` | { code, message } | 错误通知 |
| `pong` | { timestamp } | 心跳响应 |

### 消息类型

```typescript
interface Message {
  id: string;
  sessionId: string;
  sender: 'user' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  type: 'text' | 'status' | 'thinking' | 'tool_use' | 'error';
  content: string;
  metadata?: {
    isStreaming?: boolean;    // 流式输出标记
    isComplete?: boolean;     // 流式输出完成
    toolName?: string;        // 工具名称
    input?: object;           // 工具输入
    status?: string;          // 状态类型
  };
  createdAt: Date;
}
```

## 配置说明

### 系统配置

编辑 `configs/system.yaml`:

```yaml
# 数据库配置
database:
  type: mysql
  host: localhost
  port: 3306
  username: root
  password: your_password
  database: monkagents

# Redis 配置 (可选，用于对话历史持久化)
redis:
  host: localhost
  port: 6379
  db: 0
  keyPrefix: 'monkagents:'

# 服务器配置
server:
  port: 3000
  host: localhost

# 日志配置
logging:
  level: info           # debug, info, warn, error
  format: pretty        # pretty 或 json

# 智能体配置路径
agents:
  configPath: ./configs/agents
```

### 智能体配置

每个智能体在 `configs/agents/` 目录下有独立的 YAML 配置文件。配置采用**人设与行为分离**的设计：

```yaml
id: wukong
name: 孙悟空
emoji: 🐵
role: executor

# 任务描述 (用于自动委托决策)
description: |
  主力技术执行者，负责代码编写、调试、测试等具体技术任务。

# 人设配置 (决定回复风格)
persona: |
  你是孙悟空，齐天大圣，团队的主力执行者。

  【性格核心】
  桀骜不驯、机智勇敢、行动力极强。

  【语言风格】
  语速快，自称"俺老孙"。示例："呔！又是何种技术难题？俺老孙来也！"

# 模型配置
model: claude-sonnet-4-6

# CLI 配置 (关键: --include-partial-messages 启用真正的流式输出)
cli:
  command: claude
  args:
    - -p
    - --output-format
    - stream-json
    - --include-partial-messages  # 启用流式输出
    - --verbose

# 允许使用的工具
tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash

# 任务匹配关键词 (决定任务分配)
taskKeywords:
  high: ['代码', '实现', '编写', 'code']      # 优先级 0.95
  medium: ['调试', 'debug', '修复', 'fix']    # 优先级 0.85
  low: ['测试', 'test', '重构', 'refactor']   # 优先级 0.75
  general: ['开发', 'create']                  # 优先级 0.65

# 技能
skills:
  - coding
  - debugging
  - testing

# 工作边界
boundaries:
  - 不做架构决策（需要师父同意）
  - 不负责文档编写
  - 不负责质量审查

# 权限模式
permissionMode: acceptEdits
maxTurns: 50
```

### 配置驱动特性

| 特性 | 说明 |
|------|------|
| `persona` | 智能体人设，决定回复风格和语言特点 |
| `description` | 任务描述，用于自动委托决策 |
| `taskKeywords` | 任务匹配关键词，按优先级分类 |
| `cli.args` | CLI 参数配置，`--include-partial-messages` 启用流式输出 |
| `tools` | 允许使用的工具列表 |
| `boundaries` | 工作边界约束 |
| `permissionMode` | 权限模式 (acceptEdits, plan, auto) |
| `maxTurns` | 最大对话轮数 |

## 技术栈

### 后端
- **框架**: NestJS 10
- **数据库**: MySQL + TypeORM
- **缓存**: Redis (ioredis) - 对话历史持久化
- **实时通信**: Socket.io
- **配置管理**: YAML (js-yaml)
- **日志**: Pino

### 前端
- **构建工具**: Vite
- **样式**: 原生 CSS Grid
- **通信**: Fetch API + Socket.io Client

### 共享包
- **语言**: TypeScript 5
- **工具**: UUID, YAML 解析

### 外部依赖
- **Claude CLI**: 用于实际智能体执行
- **Claude API**: 支持流式输出 (打字机效果)

## 开发路线

### 第一阶段 ✅ (已完成)
- [x] 项目基础架构 (Monorepo)
- [x] 数据库设计 (MySQL + TypeORM)
- [x] 配置系统 (YAML)
- [x] WebSocket 通信
- [x] 会话管理
- [x] 智能体模块骨架
- [x] 前端界面框架
- [x] 单元测试覆盖

### 第二阶段 ✅ (已完成)
- [x] CLI 进程管理模块
- [x] 流式输出解析 (NDJSON)
- [x] 唐僧智能体实现
- [x] 任务分解算法

### 第三阶段 ✅ (已完成)
- [x] 孙悟空智能体实现
- [x] 猪八戒智能体实现
- [x] 沙和尚智能体实现
- [x] 如来佛祖智能体实现
- [x] 智能体协作机制
- [x] @唤醒机制

### 第四阶段 ✅ (已完成)
- [x] 三栏布局前端
- [x] 会话管理界面
- [x] 聊天功能
- [x] 智能体状态面板

### 第五阶段 ✅ (已完成)
- [x] CLI 集成与实际调用
- [x] 人设配置与代码分离
- [x] 配置驱动的任务匹配

### 第六阶段 ✅ (已完成)
- [x] Redis 状态管理 (对话历史持久化)
- [x] 服务管理脚本 (start/stop/status/restart)
- [x] 流式输出打字机效果

### 第七阶段 (计划中)
- [ ] Docker 部署支持
- [ ] 定时任务调度器
- [ ] Checkpoint 保存与恢复
- [ ] 分层记忆管理

## 常见问题

### spawn ENOENT 错误

如果遇到 `spawn ENOENT` 错误，请检查：

1. **工作目录是否存在** - 创建会话时指定的工作目录必须是服务器上存在的绝对路径
2. **Claude CLI 是否安装** - 确保已安装 Claude CLI 并在 PATH 中
3. **嵌套调用限制** - Claude CLI 不允许在 Claude Code 会话中直接调用，代码已处理此问题

### 工作目录配置

- 前端创建会话时需要输入**完整的绝对路径**（如 `D:\workspace\MonkAgents`）
- 可以点击"浏览"按钮通过服务器端目录浏览器选择
- 相对路径可能导致 spawn 失败

### Redis 连接问题

如果 Redis 未启动，系统会自动降级运行，对话历史将仅保存在内存中：

```bash
# Windows - 启动 Redis
redis-server

# 或使用 Docker
docker run -d -p 6379:6379 redis
```

### MySQL 连接问题

确保 MySQL 服务已启动，并创建了对应的数据库：

```bash
# 检查 MySQL 服务状态
# Windows
net start MySQL84

# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS monkagents CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 流式输出不生效

确保智能体配置中包含 `--include-partial-messages` 参数：

```yaml
cli:
  args:
    - -p
    - --output-format
    - stream-json
    - --include-partial-messages  # 关键参数
    - --verbose
```

## 贡献指南

欢迎贡献代码！请确保：

1. 代码风格与现有代码保持一致
2. 新功能需要添加测试
3. 提交前运行 `npm test` 确保测试通过
4. 提交信息使用中文描述

## 许可证

MIT License