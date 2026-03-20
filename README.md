# MonkAgents 🧘

基于西游记角色的多智能体协同平台。

## 项目简介

MonkAgents 是一个创新的多智能体协作平台，采用中国古典名著《西游记》中的角色模型。每个智能体都有独特的角色定位和专业技能，通过协作完成复杂的软件工程任务。

### 角色介绍

| 角色 | 名称 | 职责 | 特点 |
|------|------|------|------|
| 🙏 唐僧 | Master | 团队领导者 | 深思熟虑，善于分析和协调 |
| 🐵 孙悟空 | Executor | 主要执行者 | 技术能力强，反应迅速 |
| 🐷 猪八戒 | Assistant | 助手 | 乐于助人，处理辅助任务 |
| 🧑‍🦲 沙和尚 | Inspector | 检查者 | 细心认真，质量保证 |
| 🧘 如来佛祖 | Advisor | 资深顾问 | 经验丰富，提供战略指导 |

## 功能特性

- 🤖 **多智能体协作** - 五个智能体各司其职，协同工作
- 💬 **实时通信** - WebSocket 支持实时消息推送和流式输出
- 📝 **会话管理** - 支持多会话、工作目录配置
- 🗄️ **数据持久化** - SQLite 数据库存储任务、消息、检查点等
- ⚙️ **灵活配置** - YAML 格式的系统和智能体配置
- 🎨 **现代前端** - 三栏式响应式界面

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd MonkAgents

# 安装依赖
npm install

# 构建共享包
npm run build -w @monkagents/shared
```

### 运行

```bash
# 启动后端服务 (开发模式)
npm run start:dev -w @monkagents/backend

# 在另一个终端启动前端
cd packages/frontend && npm run dev
```

访问 http://localhost:5173 打开前端界面。

### 测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test -w @monkagents/backend -- --testPathIgnorePatterns="e2e"

# 运行测试覆盖率
npm run test:cov -w @monkagents/backend
```

## 项目结构

```
MonkAgents/
├── packages/
│   ├── frontend/          # Web 前端
│   │   └── src/
│   │       ├── index.html # 主页面
│   │       ├── styles/    # CSS 样式
│   │       └── scripts/   # JavaScript
│   ├── backend/           # NestJS 后端
│   │   └── src/
│   │       ├── config/    # 配置服务
│   │       ├── database/  # 数据库模块
│   │       ├── agents/    # 智能体模块
│   │       ├── session/   # 会话模块
│   │       └── websocket/ # WebSocket 模块
│   └── shared/            # 共享包
│       └── src/
│           ├── types/     # 类型定义
│           ├── constants/ # 常量
│           └── utils/     # 工具函数
├── configs/
│   ├── system.yaml        # 系统配置
│   └── agents/            # 智能体配置
│       ├── tangseng.yaml
│       ├── wukong.yaml
│       ├── bajie.yaml
│       ├── shaseng.yaml
│       └── rulai.yaml
├── data/                  # 数据存储目录
├── skills/                # 智能体技能
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

### WebSocket 事件

**客户端 → 服务端:**
- `join(sessionId)` - 加入会话房间
- `leave(sessionId)` - 离开会话房间
- `message({ sessionId, content })` - 发送消息
- `cancel(taskId)` - 取消任务

**服务端 → 客户端:**
- `message` - 新消息通知
- `agent_status` - 智能体状态更新
- `task_status` - 任务状态更新
- `stream` - 流式输出块
- `error` - 错误通知

## 配置说明

### 系统配置

编辑 `configs/system.yaml`:

```yaml
database:
  type: sqlite
  path: ./data/sqlite/monkagents.db

redis:
  host: localhost
  port: 6379

server:
  port: 3000
  host: localhost

logging:
  level: info
  format: pretty
```

### 智能体配置

每个智能体在 `configs/agents/` 目录下有独立的 YAML 配置文件：

```yaml
id: wukong
name: 孙悟空
emoji: 🐵
role: executor
persona: |
  你是孙悟空，团队的主力执行者...
model: claude-sonnet-4-6
cli:
  command: claude
  args: [-p, --output-format, stream-json, --verbose]
skills:
  - coding
  - debugging
  - testing
capabilities:
  - code_generation
  - code_review
boundaries:
  - 不做架构决策
```

## 技术栈

### 后端
- **框架**: NestJS 10
- **数据库**: SQLite + TypeORM
- **实时通信**: Socket.io
- **配置管理**: YAML
- **日志**: Pino

### 前端
- **构建工具**: Vite
- **样式**: 原生 CSS Grid
- **通信**: Fetch API + Socket.io Client

### 共享包
- **语言**: TypeScript 5
- **工具**: UUID, YAML 解析

## 开发路线

### 第一阶段 ✅ (已完成)
- [x] 项目基础架构
- [x] 数据库设计
- [x] 配置系统
- [x] WebSocket 通信
- [x] 会话管理
- [x] 智能体模块骨架
- [x] 前端界面框架
- [x] 单元测试

### 第二阶段 (计划中)
- [ ] CLI 集成和实际调用
- [ ] 任务分解算法
- [ ] 智能体协作流程
- [ ] 流式输出处理
- [ ] Redis 状态管理
- [ ] Docker 部署支持

### 第三阶段 (规划中)
- [ ] 技能系统
- [ ] MCP 集成
- [ ] 多语言支持
- [ ] 性能优化
- [ ] 监控和告警

## 贡献指南

欢迎贡献代码！请确保：

1. 代码风格与现有代码保持一致
2. 新功能需要添加测试
3. 提交前运行 `npm test` 确保测试通过
4. 提交信息使用中文描述

## 许可证

MIT License