# MonkAgents 需求设计文档

> 版本: 1.0
> 更新日期: 2026-03-20

---

## 一、项目概述

### 1.1 项目名称
MonkAgents - 多Agent协同智能体平台

### 1.2 项目描述
一个通用多Agent协同智能体平台，由多个智能体互相协作完成用户特定任务。系统采用西游记角色模型，用户扮演唐明皇角色，通过自然语言与智能体群组交互。

### 1.3 角色模型

| 角色 | Emoji | 职责 | 调用方式 | 核心能力 |
|-----|-------|------|---------|---------|
| **唐僧** | 🧘 | 主智能体 | API | 任务分解、调度监督、上下文管理、结果汇总、定时任务控制 |
| **孙悟空** | 🐵 | 执行者 | CLI spawn | 编码实现、工具调用、MCP执行、SKILL执行 |
| **猪八戒** | 🐷 | 质检员 | CLI spawn | 代码检视、结果检查、质量把关、提供建议 |
| **沙僧** | 🧔 | 辅助者 | CLI spawn | 单元测试、环境准备、系统部署、三方系统对接 |
| **如来佛祖** | 🙏 | 超级顾问 | API | 能力扩展建议、Skill/MCP开发指导、解决疑难问题 |

**用户角色**: 唐明皇

### 1.4 技术栈

| 层级 | 技术选择 | 说明 |
|-----|---------|------|
| 后端框架 | NestJS + TypeScript | 企业级、支持微服务、DI |
| 前端 | 原生JS (或React) | 轻量化 |
| 数据库 | SQLite (本地) / PostgreSQL (云) | 平滑迁移 |
| 缓存/消息 | Redis | 对话历史、集群通信 |
| 进程管理 | PM2 → K8S Pod | 本地到云端 |
| 日志 | Pino | 高性能JSON日志 |
| WebSocket | Socket.IO 或 ws | 心跳、重连、房间管理 |
| 部署 | Docker + K8S | 云化部署 |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      前端 (原生JS/React)                         │
│  ┌──────────┬──────────────────────┬───────────────────────┐   │
│  │ 会话列表  │      对话框          │     智能体列表         │   │
│  │          │  (群聊风格)           │   (带头像+状态)        │   │
│  └──────────┴──────────────────────┴───────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket (心跳10s, 可配置)
┌────────────────────────────┴────────────────────────────────────┐
│                    后端 (NestJS)                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    唐僧 (主智能体)                          │  │
│  │  任务规划(REACT) | 分层记忆 | 调度控制 | Checkpoint管理     │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             ↓                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ 孙悟空   │  │ 猪八戒   │  │  沙僧   │  │如来佛祖  │           │
│  │ CLI会话 │  │ CLI会话 │  │ CLI会话 │  │ API调用 │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
│       ↑              ↑              ↑              ↑          │
│       └──────────────┴──────────────┴──────────────┘          │
│                支持@唤醒，传递相关上下文                         │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                         存储层                                   │
│  SQLite(本地) | PostgreSQL(云) | Redis(云) | 文件系统            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 智能体协作流程

```
用户输入 → 唐僧接收 → 任务分解(REACT) → 分配子任务
    ↓
智能体执行(spawn CLI) → 实时输出 → WebSocket → 前端
    ↓
猪八戒质检 → 通过? → 是 → 唐僧汇总 → 返回用户
                → 否 → @相关智能体修改
```

### 2.3 智能体通信机制

- **并行/交叉协作**: 智能体可同时工作
- **直接对话**: 支持@方式唤醒特定智能体
- **上下文传递**: 唤醒时传递相关上下文，非全部
- **统一上下文**: 唐僧负责全局上下文的保持、管理、压缩

---

## 三、核心功能

### 3.1 任务管理

#### 任务状态
| 状态 | 说明 |
|-----|------|
| 思考中 | 智能体正在分析处理 |
| 等待中 | 等待其他任务完成 |
| 执行中 | 正在执行子任务 |
| 暂停 | 任务已暂停 |
| 完成 | 任务成功完成 |
| 失败 | 任务执行失败 |

#### 任务分解
- 采用REACT模式自动分解
- 支持串行/并行执行
- 基于智能体能力边界自动分配
- 所有智能体无法处理时求助如来佛祖

#### Checkpoint机制
- **触发时机**: 阶段性节点（任务分配完成、工具调用完成、代码编写完毕等）
- **存储内容**: 任务状态、智能体状态、上下文快照
- **恢复策略**: 从最近Checkpoint恢复重试

### 3.2 智能体状态

#### 状态类型
- 忙/闲状态
- 当前执行任务
- 思考中/输出中/工具调用中
- 工具调用详情（名称、状态、时长、输入输出）

#### 状态展示
- 实时更新到前端
- 通过WebSocket推送
- CLI进程异常时显示离线+原因

### 3.3 CLI进程管理

#### Claude CLI调用方式
```bash
claude -p "你的问题" --output-format stream-json --verbose
```

#### 输出格式 (NDJSON)
```json
{"type":"system","subtype":"init","session_id":"abc123"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}
{"type":"result","subtype":"success","session_id":"abc123"}
```

#### 进程管理
- spawn方式启动CLI进程
- 每个智能体独立CLI会话
- stream-json输出解析
- WebSocket实时推送
- 异常退出自动重启
- 用户可通过重试恢复进程

### 3.4 分层记忆

#### 记忆层级
| 层级 | 说明 | 保留策略 |
|-----|------|---------|
| 工作记忆 | 当前对话上下文 | 实时 |
| 情景记忆 | 历史对话记录 | 持久化 |
| 语义记忆 | 知识和事实 | 长期 |
| 过程记忆 | 技能和方法 | 长期 |

#### 压缩策略
- 采用摘要方式压缩
- 唐僧负责全局上下文压缩
- 各子智能体只关注自己的上下文

#### 持久化
- 本地: 文件系统
- 云端: Redis

### 3.5 SKILL与MCP

#### SKILL机制
- 遵循Claude Code SKILL标准
- SKILL.md格式定义
- 支持动态加载
- 目录位置: `skills/`

#### SKILL配置示例
```yaml
---
name: coding
description: 编码实现能力
allowed-tools: Read, Write, Edit, Bash
---

## 编码规范
...
```

#### MCP工具
- 通用MCP工具调用
- 配置文件: `configs/mcp/*.json`
- 智能体可动态扩展

### 3.6 定时任务

#### 功能特性
- 独立调度器（唐僧控制）
- 简单定时表达式（不支持复杂Cron）
- 可视化管理界面
- 执行日志查看

#### 任务持久化
- 配置持久化到文件
- 执行时加载上下文
- 执行完成后记录状态

#### 任务限制
- 执行历史保存: 90天（可配置）
- 最大保存条数: 1000条（可配置）
- 错过任务: 更新状态并通知用户
- 支持: 取消操作
- 不支持: 暂停/恢复

### 3.7 调试功能 (Observability)

#### 核心指标
- Token使用量
- API调用次数/耗时
- 工具调用输入输出
- 上下文大小变化
- CLI进程状态
- 每个智能体思考信息

#### 展示方式
- 实时输出流
- 进度条
- 详细日志（调试模式）
- 类似LangSmith的observability能力

---

## 四、前端设计

### 4.1 页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│                        MonkAgents                                │
├──────────────┬────────────────────────────────┬─────────────────┤
│              │                                │                 │
│   会话列表    │           对话框               │    智能体列表    │
│              │                                │                 │
│  ┌────────┐  │  ┌─────────────────────────┐  │  ┌───────────┐  │
│  │会话1   │  │  │ 🧘 唐僧: 任务已分配...   │  │  │🧘 唐僧    │  │
│  └────────┘  │  │                         │  │  │   空闲    │  │
│  ┌────────┐  │  │ 🐵 孙悟空: 正在编码...   │  │  ├───────────┤  │
│  │会话2   │  │  │                         │  │  │🐵 孙悟空  │  │
│  └────────┘  │  │ 🐷 猪八戒: @悟空 这里... │  │  │   执行中  │  │
│              │  │                         │  │  ├───────────┤  │
│              │  │ ┌─────────────────────┐ │  │  │🐷 猪八戒  │  │
│  [+ 新会话]  │  │ │ 输入消息...          │ │  │  │   空闲    │  │
│              │  │ └─────────────────────┘ │  │  ├───────────┤  │
│              │  └─────────────────────────┘  │  │🧔 沙僧    │  │
│              │                                │  │   空闲    │  │
│              │                                │  ├───────────┤  │
│              │                                │  │🙏 如来    │  │
│              │                                │  │   空闲    │  │
│              │                                │  └───────────┘  │
└──────────────┴────────────────────────────────┴─────────────────┘
```

### 4.2 页面清单

| 页面 | 路由 | 说明 |
|-----|------|------|
| 主聊天页面 | `/` | 任务输入、实时对话、智能体状态 |
| 任务列表页面 | `/tasks` | 历史任务查询 |
| 定时任务页面 | `/scheduled` | 创建/管理/查看定时任务 |
| 调试详情页面 | `/debug/:taskId` | 任务执行详细信息 |

### 4.3 交互设计

#### 会话管理
- 创建新会话时选择工作目录
- 会话列表支持切换
- 不需要导入导出功能

#### 聊天交互
- 群聊风格对话框
- 支持自然语言输入
- 实时显示智能体输出
- 智能体消息带头像标识

#### 智能体面板
- 显示所有智能体
- 头像 + 名称 + 状态
- 点击可查看详情

---

## 五、数据存储

### 5.1 数据库表设计

#### tasks 表 - 任务表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| session_id | UUID | 会话ID |
| title | TEXT | 任务标题 |
| description | TEXT | 任务描述 |
| status | ENUM | 状态 |
| checkpoint_id | UUID | 当前检查点 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| completed_at | TIMESTAMP | 完成时间 |

#### subtasks 表 - 子任务表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| task_id | UUID | 父任务ID |
| agent_id | TEXT | 执行智能体 |
| title | TEXT | 子任务标题 |
| description | TEXT | 子任务描述 |
| status | ENUM | 状态 |
| dependencies | JSON | 依赖关系 |
| result | TEXT | 执行结果 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### agents 表 - 智能体状态表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | TEXT | 智能体ID |
| name | TEXT | 名称 |
| role | TEXT | 角色 |
| status | ENUM | 状态 |
| current_task_id | UUID | 当前任务 |
| current_action | TEXT | 当前动作 |
| pid | INTEGER | CLI进程ID |
| session_id | TEXT | CLI会话ID |
| last_heartbeat | TIMESTAMP | 最后心跳 |

#### conversations 表 - 对话历史表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| session_id | UUID | 会话ID |
| agent_id | TEXT | 智能体ID |
| role | ENUM | 角色(user/agent) |
| content | TEXT | 消息内容 |
| metadata | JSON | 元数据 |
| created_at | TIMESTAMP | 创建时间 |

#### checkpoints 表 - 检查点表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| task_id | UUID | 任务ID |
| subtask_id | UUID | 子任务ID |
| agent_states | JSON | 智能体状态快照 |
| context_snapshot | JSON | 上下文快照 |
| created_at | TIMESTAMP | 创建时间 |

#### scheduled_tasks 表 - 定时任务表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| session_id | UUID | 会话ID |
| title | TEXT | 任务标题 |
| description | TEXT | 任务描述 |
| schedule | TEXT | 定时表达式 |
| context | JSON | 执行上下文 |
| status | ENUM | 状态 |
| last_run_at | TIMESTAMP | 最后执行时间 |
| next_run_at | TIMESTAMP | 下次执行时间 |
| created_at | TIMESTAMP | 创建时间 |

#### execution_logs 表 - 执行日志表
| 字段 | 类型 | 说明 |
|-----|------|------|
| id | UUID | 主键 |
| task_id | UUID | 任务ID |
| agent_id | TEXT | 智能体ID |
| type | ENUM | 日志类型 |
| content | JSON | 日志内容 |
| tokens_used | INTEGER | Token使用量 |
| duration_ms | INTEGER | 耗时 |
| created_at | TIMESTAMP | 创建时间 |

### 5.2 配置文件

#### 智能体配置 - configs/agents/wukong.yaml
```yaml
id: wukong
name: 孙悟空
emoji: 🐵
role: 执行者
persona: |
  你是孙悟空，西游记中的齐天大圣。
  你性格活泼、机智、能力强，主要负责执行具体任务。
  你擅长编码实现、工具调用、MCP执行和SKILL执行。
  遇到超出能力边界的问题时，及时寻求帮助。
model: claude-sonnet-4-6
cli:
  command: claude
  args:
    - -p
    - --output-format
    - stream-json
    - --verbose
skills:
  - ./skills/coding
  - ./skills/file-operations
mcps:
  - name: filesystem
    config: ./configs/mcp/filesystem.json
capabilities:
  - 编码实现
  - 工具调用
  - MCP执行
  - SKILL执行
boundaries:
  - 不负责代码测试
  - 不负责系统部署
  - 不负责质量检视
```

#### 系统配置 - configs/system.yaml
```yaml
server:
  port: 3000

websocket:
  heartbeat: 10000  # 心跳间隔(ms)

database:
  local:
    type: sqlite
    path: ./data/sqlite/monkagents.db
  cloud:
    type: postgresql
    host: ${DB_HOST}
    port: ${DB_PORT}
    database: ${DB_NAME}

redis:
  host: ${REDIS_HOST}
  port: ${REDIS_PORT}

scheduled_tasks:
  history_days: 90
  max_records: 1000

workspace:
  metadata_dir: .monkagents
```

### 5.3 工作目录结构

```
/workspace/              # 用户选择的工作目录
├── .monkagents/         # 平台元数据
│   ├── history/         # 对话历史
│   │   └── session-{id}.json
│   ├── checkpoints/     # 检查点
│   │   └── task-{id}/
│   │       └── checkpoint-{id}.json
│   └── cache/           # 缓存
└── (用户代码文件)
```

---

## 六、项目结构

```
MonkAgents/
├── packages/
│   ├── frontend/              # Web前端
│   │   ├── src/
│   │   │   ├── index.html
│   │   │   ├── styles/
│   │   │   ├── scripts/
│   │   │   └── assets/
│   │   └── package.json
│   │
│   ├── backend/               # NestJS后端
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── agents/        # 智能体模块
│   │   │   ├── tasks/         # 任务模块
│   │   │   ├── sessions/      # 会话模块
│   │   │   ├── scheduler/     # 定时任务模块
│   │   │   ├── websocket/     # WebSocket模块
│   │   │   ├── cli/           # CLI进程管理
│   │   │   ├── memory/        # 记忆管理
│   │   │   └── common/        # 公共模块
│   │   └── package.json
│   │
│   └── shared/                # 共享类型和工具
│       ├── src/
│       │   ├── types/
│       │   ├── constants/
│       │   └── utils/
│       └── package.json
│
├── skills/                    # SKILL目录
│   ├── coding/
│   │   └── SKILL.md
│   ├── file-operations/
│   │   └── SKILL.md
│   └── testing/
│       └── SKILL.md
│
├── configs/                   # 配置文件
│   ├── agents/                # 智能体配置
│   │   ├── tangseng.yaml
│   │   ├── wukong.yaml
│   │   ├── bajie.yaml
│   │   ├── shaseng.yaml
│   │   └── rulai.yaml
│   ├── mcp/                   # MCP配置
│   │   └── filesystem.json
│   └── system.yaml            # 系统配置
│
├── data/                      # 本地数据存储
│   ├── sqlite/
│   ├── history/
│   └── checkpoints/
│
├── docker/                    # Docker/K8S配置
│   ├── Dockerfile
│   ├── docker-compose.yaml
│   └── k8s/
│
├── docs/                      # 文档
│   └── REQUIREMENTS.md
│
├── CLAUDE.md
├── README.md
├── package.json
└── tsconfig.json
```

---

## 七、API接口

### 7.1 REST API

| 方法 | 路径 | 说明 | 请求体 |
|-----|------|------|--------|
| POST | /api/sessions | 创建会话 | `{ workspacePath }` |
| GET | /api/sessions | 会话列表 | - |
| GET | /api/sessions/:id | 会话详情 | - |
| DELETE | /api/sessions/:id | 删除会话 | - |
| POST | /api/chat | 发送消息 | `{ sessionId, message }` |
| GET | /api/tasks | 任务列表 | `?sessionId=&status=` |
| GET | /api/tasks/:id | 任务详情 | - |
| POST | /api/tasks/:id/retry | 重试任务 | - |
| POST | /api/tasks/:id/cancel | 取消任务 | - |
| GET | /api/agents | 智能体状态 | - |
| GET | /api/agents/:id | 智能体详情 | - |
| GET | /api/scheduled-tasks | 定时任务列表 | - |
| POST | /api/scheduled-tasks | 创建定时任务 | `{ title, description, schedule, context }` |
| DELETE | /api/scheduled-tasks/:id | 取消定时任务 | - |
| GET | /api/debug/:taskId | 调试信息 | - |

### 7.2 WebSocket事件

#### 客户端发送
| 事件 | 数据 | 说明 |
|-----|------|------|
| join | `{ sessionId }` | 加入会话房间 |
| leave | `{ sessionId }` | 离开会话房间 |
| message | `{ content }` | 发送消息 |
| cancel | `{ taskId }` | 取消任务 |

#### 服务端推送
| 事件 | 数据 | 说明 |
|-----|------|------|
| message | `{ agentId, content, timestamp }` | 智能体消息 |
| agent_status | `{ agentId, status, action }` | 智能体状态更新 |
| task_status | `{ taskId, status, progress }` | 任务状态更新 |
| stream | `{ agentId, chunk }` | 实时输出流 |
| error | `{ code, message }` | 错误信息 |

---

## 八、开发阶段

### 第一阶段：基础架构 ✅ (已完成)
- [x] 项目初始化（monorepo结构）
- [x] 后端框架搭建
- [x] 数据库设计与初始化
- [x] 智能体配置文件
- [x] WebSocket通信模块
- [x] 会话管理功能
- [x] 前端基础框架
- [x] 单元测试覆盖

### 第二阶段：核心智能体
- [ ] 唐僧智能体实现
- [ ] CLI进程管理模块
- [ ] WebSocket通信模块

### 第三阶段：子智能体
- [ ] 孙悟空智能体实现
- [ ] 猪八戒智能体实现
- [ ] 沙僧智能体实现
- [ ] 如来佛祖智能体实现
- [ ] 智能体协作机制
- [ ] @唤醒机制

### 第四阶段：前端界面
- [ ] 三栏布局
- [ ] 会话管理
- [ ] 聊天功能
- [ ] 智能体状态面板
- [ ] 任务列表页面
- [ ] 定时任务页面
- [ ] 调试详情页面

### 第五阶段：高级功能
- [ ] 定时任务调度器
- [ ] Checkpoint保存与恢复
- [ ] 分层记忆管理
- [ ] 调试功能

### 第六阶段：云化部署
- [ ] Docker化
- [ ] K8S配置
- [ ] PostgreSQL适配
- [ ] Redis适配
- [ ] 性能优化

---

## 九、附录

### 9.1 确认事项

| 项目 | 确认内容 |
|-----|---------|
| 智能体头像 | Emoji (🧘唐僧 🐵悟空 🐷八戒 🧔沙僧 🙏如来) |
| 工作目录选择 | 创建新会话时选择 |
| 会话导入导出 | 不需要 |
| 快捷指令 | 不需要 |
| 用户认证 | 不需要 |
| 国际化 | 不需要 |

### 9.2 参考文档

- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [LangSmith Observability](https://docs.langchain.com/langsmith/observability-llm-tutorial)
- [Agent Skills Open Standard](https://agentskills.io)