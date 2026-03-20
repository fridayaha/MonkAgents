# @monkagents/backend

MonkAgents 后端服务，基于 NestJS 框架。

## 安装

```bash
npm install @monkagents/backend
```

## 开发

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run start

# 调试模式
npm run start:debug
```

## 构建

```bash
npm run build
```

## 测试

```bash
# 单元测试
npm test

# 测试覆盖率
npm run test:cov

# E2E 测试
npm run test:e2e
```

## 模块结构

```
src/
├── main.ts              # 应用入口
├── app.module.ts        # 根模块
├── app.controller.ts    # 根控制器
├── config/              # 配置模块
│   ├── config.module.ts
│   └── config.service.ts
├── database/            # 数据库模块
│   ├── database.module.ts
│   ├── database.service.ts
│   └── entities/        # 数据实体
│       ├── task.entity.ts
│       ├── subtask.entity.ts
│       ├── agent.entity.ts
│       ├── conversation.entity.ts
│       ├── checkpoint.entity.ts
│       ├── scheduled-task.entity.ts
│       └── execution-log.entity.ts
├── agents/              # 智能体模块
│   ├── agents.module.ts
│   ├── agents.service.ts
│   ├── agents.controller.ts
│   ├── agent-base.ts
│   ├── tangseng.agent.ts
│   ├── wukong.agent.ts
│   ├── bajie.agent.ts
│   ├── shaseng.agent.ts
│   └── rulai.agent.ts
├── session/             # 会话模块
│   ├── session.module.ts
│   ├── session.service.ts
│   ├── session.controller.ts
│   └── dto/
│       └── create-session.dto.ts
└── websocket/           # WebSocket 模块
    ├── websocket.module.ts
    ├── websocket.gateway.ts
    └── websocket.service.ts
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/info | 系统信息 |
| GET | /api/agents | 智能体列表 |
| GET | /api/agents/:id | 智能体详情 |
| GET | /api/agents/role/:role | 按角色查询 |
| POST | /api/sessions | 创建会话 |
| GET | /api/sessions | 会话列表 |
| GET | /api/sessions/:id | 会话详情 |
| DELETE | /api/sessions/:id | 删除会话 |

## WebSocket 事件

### 客户端发送

- `join(sessionId)` - 加入会话
- `leave(sessionId)` - 离开会话
- `message({ sessionId, content })` - 发送消息
- `cancel(taskId)` - 取消任务

### 服务端推送

- `message` - 新消息
- `agent_status` - 智能体状态
- `task_status` - 任务状态
- `stream` - 流式输出
- `error` - 错误通知

## 配置

配置文件位于 `configs/` 目录：

- `system.yaml` - 系统配置
- `agents/*.yaml` - 智能体配置

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| NODE_ENV | development | 运行环境 |

## 数据库

默认使用 SQLite，数据库文件位于 `data/sqlite/monkagents.db`。

### 实体关系

```
Session ──< Task ──< Subtask
   │
   └──< Conversation

Agent

Checkpoint

ScheduledTask

ExecutionLog
```

## 依赖

### 主要依赖

- @nestjs/core
- @nestjs/common
- @nestjs/platform-express
- @nestjs/websockets
- @nestjs/typeorm
- typeorm
- sqlite3
- socket.io

### 开发依赖

- @nestjs/cli
- @nestjs/testing
- jest
- ts-jest
- typescript

## 许可证

MIT