# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

MonkAgents 是一个多智能体协同平台，采用西游记角色模型。项目使用 monorepo 结构，基于 npm workspaces 管理。

## 常用命令

### 安装依赖
```bash
npm install
```

### 构建项目
```bash
# 构建共享包
npm run build -w @monkagents/shared

# 构建后端
npm run build -w @monkagents/backend

# 构建所有
npm run build
```

### 开发运行

```bash
# 首次运行需先构建
npm run build

# 启动后端开发服务器（热重载）
npm run start:dev -w @monkagents/backend

# 启动前端开发服务器
npm run start:frontend

# 同时启动前后端
npm run start:all
```

### 服务管理

```bash
# 查看服务状态
npm run status

# 重启所有服务
npm run restart

# 单独重启后端
npm run restart:backend

# 单独重启前端
npm run restart:frontend

# 停止所有服务
npm run stop

# 单独停止后端
npm run stop:backend

# 单独停止前端
npm run stop:frontend
```

### 测试
```bash
# 运行所有测试
npm test

# 仅运行单元测试
npm run test -w @monkagents/backend -- --testPathIgnorePatterns="e2e"

# 运行 e2e 测试
npm run test:e2e -w @monkagents/backend

# 测试覆盖率
npm run test:cov -w @monkagents/backend
```

### 清理
```bash
npm run clean
```

## 项目结构

```
MonkAgents/
├── packages/
│   ├── frontend/          # Web 前端 (Vite + 原生 JS)
│   │   └── src/
│   │       ├── index.html # 三栏布局页面
│   │       ├── styles/    # CSS 样式
│   │       └── scripts/   # JavaScript (app.js, api.js, websocket.js)
│   ├── backend/           # NestJS 后端服务
│   │   └── src/
│   │       ├── main.ts    # 入口文件
│   │       ├── app.module.ts
│   │       ├── config/    # 配置模块
│   │       ├── database/  # 数据库模块 (TypeORM)
│   │       ├── agents/    # 智能体模块
│   │       ├── session/   # 会话模块
│   │       └── websocket/ # WebSocket 模块
│   └── shared/            # 共享类型和工具
│       └── src/
│           ├── types/     # 类型定义
│           ├── constants/ # 常量配置
│           └── utils/     # 工具函数
├── configs/
│   ├── system.yaml        # 系统配置
│   └── agents/            # 智能体配置
├── data/                  # 数据存储
├── skills/                # 智能体技能
├── docker/                # Docker 配置
└── docs/                  # 文档
```

## 架构设计

### 智能体角色

| 角色 | 名称 | 职责 |
|------|------|------|
| master | 唐僧 🙏 | 协调者/领导者，负责理解需求、制定计划、分配任务 |
| executor | 孙悟空 🐵 | 主要执行者，处理编程、调试、测试等技术任务 |
| assistant | 猪八戒 🐷 | 助手，处理文档编写、格式整理等辅助任务 |
| inspector | 沙和尚 🧑‍🦲 | 检查者，负责代码审查、质量保证 |
| advisor | 如来佛祖 🧘 | 资深顾问，提供架构设计和战略指导 |

### 数据库实体

- **Task**: 任务主表
- **Subtask**: 子任务表
- **Agent**: 智能体状态表
- **Conversation**: 对话消息表
- **Checkpoint**: 检查点表
- **ScheduledTask**: 定时任务表
- **ExecutionLog**: 执行日志表

### API 端点

- `GET /api/health` - 健康检查
- `GET /api/info` - 系统信息
- `GET /api/agents` - 智能体列表
- `GET /api/agents/:id` - 智能体详情
- `POST /api/sessions` - 创建会话
- `GET /api/sessions` - 会话列表
- `GET /api/sessions/:id` - 会话详情
- `DELETE /api/sessions/:id` - 删除会话

### WebSocket 事件

**客户端发送:**
- `join` - 加入会话
- `leave` - 离开会话
- `message` - 发送消息
- `cancel` - 取消任务

**服务端推送:**
- `message` - 新消息
- `agent_status` - 智能体状态更新
- `task_status` - 任务状态更新
- `stream` - 流式输出
- `error` - 错误消息

## 开发规范

### TypeScript 配置

- 使用 ES2022 目标
- 启用严格模式
- 使用 ES 模块（shared）/ CommonJS（backend）

### 代码风格

- 使用装饰器模式（NestJS）
- 接口和类型定义放在 shared 包
- 配置使用 YAML 格式

### 测试规范

- 单元测试放在源文件同级目录，命名为 `*.spec.ts`
- E2E 测试放在 `test/` 目录，命名为 `*.e2e-spec.ts`
- 使用 Jest 测试框架

## 配置说明

### 系统配置 (configs/system.yaml)

```yaml
database:
  type: mysql
  host: localhost
  port: 3306
  username: root
  password: root
  database: monkagents

redis:
  host: localhost
  port: 6379
  keyPrefix: 'monkagents:'

server:
  port: 3000
  host: localhost

logging:
  level: info
  format: pretty
```

### 智能体配置 (configs/agents/*.yaml)

每个智能体配置包含：
- `id`: 唯一标识
- `name`: 显示名称
- `emoji`: 表情符号
- `role`: 角色类型
- `persona`: 人设描述
- `model`: 使用的模型
- `cli`: CLI 调用配置
- `skills`: 技能列表
- `capabilities`: 能力列表
- `boundaries`: 边界约束

## 项目状态

### 第一阶段 (已完成) ✅

- [x] Monorepo 项目结构
- [x] 共享类型和工具包
- [x] NestJS 后端框架
- [x] MySQL 数据库和实体
- [x] YAML 配置系统
- [x] WebSocket 通信模块
- [x] 会话管理功能
- [x] 智能体模块骨架
- [x] 前端页面框架
- [x] 单元测试覆盖

### 第二阶段 (已完成) ✅

- [x] CLI 调用集成
- [x] 任务分解和分配
- [x] 智能体协作流程
- [x] 流式输出处理

### 第三阶段 (待实现)

- [x] Redis 集成
- [ ] Docker 部署
- [ ] 定时任务调度器
- [ ] Checkpoint 保存与恢复
- [ ] 分层记忆管理