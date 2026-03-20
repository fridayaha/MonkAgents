# MonkAgents 文档

欢迎使用 MonkAgents 多智能体协作平台文档。

## 文档索引

| 文档 | 描述 |
|------|------|
| [API 接口文档](./api.md) | REST API 和 WebSocket 接口详细说明 |
| [开发指南](./development.md) | 开发环境设置、代码规范、调试技巧 |

## 目录

- [架构设计](#架构设计)
- [智能体系统](#智能体系统)
- [数据库设计](#数据库设计)
- [API 参考](#api-参考)
- [配置指南](#配置指南)
- [开发指南](#开发指南)

## 架构设计

MonkAgents 采用分层架构设计：

```
┌─────────────────────────────────────────────┐
│                  前端层                      │
│  ┌──────────┬──────────┬──────────┐        │
│  │ 会话列表  │  对话区域  │ 智能体列表 │        │
│  └──────────┴──────────┴──────────┘        │
└─────────────────────────────────────────────┘
                    │ WebSocket / REST API
┌─────────────────────────────────────────────┐
│                  后端层                      │
│  ┌──────────┬──────────┬──────────┐        │
│  │ 会话模块  │ 智能体模块 │ WebSocket │        │
│  └──────────┴──────────┴──────────┘        │
│  ┌──────────┬──────────┐                   │
│  │ 配置模块  │ 数据库模块 │                   │
│  └──────────┴──────────┘                   │
└─────────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────────┐
│                 存储层                       │
│  ┌──────────┬──────────┐                   │
│  │  SQLite   │   YAML   │                   │
│  └──────────┴──────────┘                   │
└─────────────────────────────────────────────┘
```

### 模块职责

| 模块 | 职责 |
|------|------|
| 会话模块 | 管理用户会话，包括创建、查询、删除 |
| 智能体模块 | 管理智能体状态，处理任务分配 |
| WebSocket 模块 | 处理实时通信，消息广播 |
| 配置模块 | 加载和管理系统配置 |
| 数据库模块 | 数据持久化，实体管理 |

## 智能体系统

### 角色定义

#### 🙏 唐僧 (Master)

**角色定位**: 团队领导者，协调者

**主要职责**:
- 理解和分析用户需求
- 制定整体执行计划
- 分配任务给合适的团队成员
- 监督执行过程
- 整合最终结果

**工作边界**:
- 不直接执行技术任务
- 主要负责决策和协调

**适用场景**:
- 需求分析
- 任务规划
- 团队协调
- 结果评审

---

#### 🐵 孙悟空 (Executor)

**角色定位**: 主要执行者，技术专家

**主要职责**:
- 快速理解任务要求
- 选择最合适的技术方案
- 高效执行编码、调试、测试任务
- 遇到问题主动寻求帮助

**技能列表**:
- coding (编码)
- debugging (调试)
- testing (测试)
- refactoring (重构)

**工作边界**:
- 不做架构决策（需师父同意）
- 遇到重大问题需汇报

**适用场景**:
- 代码编写
- Bug 修复
- 单元测试
- 代码重构

---

#### 🐷 猪八戒 (Assistant)

**角色定位**: 助手，辅助支持

**主要职责**:
- 编写文档和注释
- 整理代码格式
- 运行简单命令
- 提供后勤支持

**技能列表**:
- documentation (文档编写)
- formatting (格式整理)
- simple_tasks (简单任务)

**工作边界**:
- 不处理复杂编程任务
- 不做技术决策

**适用场景**:
- 文档编写
- 代码格式化
- 简单命令执行

---

#### 🧑‍🦲 沙僧 (Inspector)

**角色定位**: 检查者，质量保证

**主要职责**:
- 审查团队成员工作成果
- 检查代码质量和规范性
- 运行测试并报告结果
- 确保交付物符合标准

**技能列表**:
- code_review (代码审查)
- testing (测试)
- quality_assurance (质量保证)

**工作边界**:
- 不直接修改代码（只提出建议）
- 最终决策由师父做出

**适用场景**:
- 代码审查
- 测试验证
- 质量检查
- 安全审计

---

#### 🧘 如来佛祖 (Advisor)

**角色定位**: 资深顾问，战略指导

**主要职责**:
- 在被请求时提供指导
- 帮助解决复杂技术难题
- 提供架构设计建议
- 评审重要决策

**技能列表**:
- architecture (架构设计)
- mentoring (指导)
- strategic_planning (战略规划)

**工作边界**:
- 不直接执行具体任务
- 只在被请求或遇到重大问题时介入

**适用场景**:
- 架构设计
- 技术选型
- 复杂问题解决
- 最佳实践指导

### 智能体状态

```typescript
type AgentStatus =
  | 'idle'      // 空闲，可接受任务
  | 'thinking'  // 思考中
  | 'executing' // 执行中
  | 'offline';  // 离线
```

### 任务分配策略

1. 用户提交任务
2. 唐僧分析任务，制定计划
3. 根据任务类型分配给合适的执行者：
   - 编码任务 → 孙悟空
   - 文档任务 → 猪八戒
   - 检查任务 → 沙僧
   - 复杂问题 → 如来佛祖
4. 沙僧进行质量检查
5. 唐僧整合结果

## 数据库设计

### 实体关系图

```
┌─────────────┐     ┌─────────────┐
│   Session   │────<│    Task     │
└─────────────┘     └─────────────┘
                          │
                          │ 1:N
                          ▼
                    ┌─────────────┐
                    │   Subtask   │
                    └─────────────┘

┌─────────────┐
│    Agent    │
└─────────────┘

┌─────────────┐     ┌─────────────┐
│Conversation │     │ Checkpoint  │
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐
│ScheduledTask│     │ExecutionLog │
└─────────────┘     └─────────────┘
```

### 表结构

#### Task (任务表)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| sessionId | UUID | 所属会话 |
| userPrompt | TEXT | 用户输入 |
| status | VARCHAR | 任务状态 |
| priority | VARCHAR | 优先级 |
| assignedAgents | ARRAY | 分配的智能体 |
| result | TEXT | 执行结果 |
| error | TEXT | 错误信息 |
| createdAt | DATETIME | 创建时间 |
| completedAt | DATETIME | 完成时间 |

#### Agent (智能体表)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| agentId | VARCHAR | 智能体标识 |
| name | VARCHAR | 显示名称 |
| role | VARCHAR | 角色 |
| status | VARCHAR | 当前状态 |
| currentTaskId | VARCHAR | 当前任务 |
| skills | ARRAY | 技能列表 |
| capabilities | ARRAY | 能力列表 |

## API 参考

### REST API

#### 健康检查

```http
GET /api/health
```

响应:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "0.1.0"
}
```

#### 创建会话

```http
POST /api/sessions
Content-Type: application/json

{
  "title": "我的会话",
  "workingDirectory": "/path/to/project"
}
```

响应:
```json
{
  "id": "uuid-here",
  "title": "我的会话",
  "status": "active",
  "workingDirectory": "/path/to/project",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### 获取智能体列表

```http
GET /api/agents
```

响应:
```json
[
  {
    "id": "tangseng",
    "config": { ... },
    "status": "idle"
  },
  ...
]
```

### WebSocket API

#### 连接

```javascript
const socket = io('/', {
  path: '/socket.io',
  transports: ['websocket']
});
```

#### 加入会话

```javascript
socket.emit('join', 'session-id');
```

#### 发送消息

```javascript
socket.emit('message', {
  sessionId: 'session-id',
  content: '帮我写一个函数'
});
```

#### 监听消息

```javascript
socket.on('message', (message) => {
  console.log(message);
});
```

## 配置指南

### 系统配置文件

`configs/system.yaml`:

```yaml
# 数据库配置
database:
  type: sqlite
  path: ./data/sqlite/monkagents.db

# Redis 配置（可选）
redis:
  host: localhost
  port: 6379

# 服务器配置
server:
  port: 3000
  host: localhost

# 日志配置
logging:
  level: info
  format: pretty
```

### 智能体配置文件

`configs/agents/wukong.yaml`:

```yaml
id: wukong
name: 孙悟空
emoji: 🐵
role: executor

persona: |
  你是孙悟空，团队的主力执行者。你拥有强大的技术能力，
  能够完成各种复杂的编程和技术任务。

model: claude-sonnet-4-6

cli:
  command: claude
  args:
    - -p
    - --output-format
    - stream-json
    - --verbose

skills:
  - coding
  - debugging
  - testing
  - refactoring

mcps: []

capabilities:
  - code_generation
  - code_review
  - debugging
  - testing
  - file_operations

boundaries:
  - 不做架构决策（需要师父同意）
  - 遇到重大问题需要汇报
```

## 开发指南

### 添加新智能体

1. 创建配置文件 `configs/agents/new-agent.yaml`
2. 定义智能体属性
3. 后端会自动加载配置

### 添加新技能

1. 在 `skills/` 目录创建技能模块
2. 在智能体配置中引用技能名称

### 扩展 API

1. 在对应模块创建 Controller
2. 定义 DTO 和验证规则
3. 实现 Service 逻辑
4. 编写单元测试

### 测试规范

```typescript
describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MyService],
    }).compile();
    service = module.get(MyService);
  });

  it('should work correctly', () => {
    expect(service).toBeDefined();
  });
});
```