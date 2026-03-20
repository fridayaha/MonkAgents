# API 接口文档

本文档描述 MonkAgents 提供的所有 API 接口。

## 基础信息

- **基础 URL**: `http://localhost:3000/api`
- **内容类型**: `application/json`
- **字符编码**: `UTF-8`

## 通用响应格式

### 成功响应

```json
{
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 错误响应

```json
{
  "statusCode": 400,
  "message": "错误描述",
  "error": "Bad Request"
}
```

---

## 健康检查

### 获取健康状态

```http
GET /api/health
```

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "0.1.0"
}
```

---

## 系统信息

### 获取系统信息

```http
GET /api/info
```

**响应示例**:

```json
{
  "name": "MonkAgents",
  "description": "多智能体协作平台",
  "agents": ["tangseng", "wukong", "bajie", "shaseng", "rulai"]
}
```

---

## 智能体接口

### 获取智能体列表

```http
GET /api/agents
```

**响应示例**:

```json
[
  {
    "id": "tangseng",
    "config": {
      "id": "tangseng",
      "name": "唐僧",
      "emoji": "🙏",
      "role": "master",
      "persona": "你是唐僧...",
      "model": "claude-opus-4-6",
      "skills": [],
      "capabilities": ["planning", "coordination", "review"]
    },
    "status": "idle",
    "lastActivity": "2024-01-15T10:30:00.000Z"
  },
  ...
]
```

### 获取智能体详情

```http
GET /api/agents/:id
```

**路径参数**:

| 参数 | 类型 | 描述 |
|------|------|------|
| id | string | 智能体 ID |

**响应示例**:

```json
{
  "id": "wukong",
  "config": { ... },
  "status": "idle",
  "currentTaskId": null,
  "lastActivity": "2024-01-15T10:30:00.000Z"
}
```

**错误响应**:

- `404 Not Found` - 智能体不存在

### 按角色获取智能体

```http
GET /api/agents/role/:role
```

**路径参数**:

| 参数 | 类型 | 描述 |
|------|------|------|
| role | string | 角色类型 (master/executor/inspector/assistant/advisor) |

**响应示例**:

```json
[
  {
    "id": "wukong",
    "config": { ... },
    "status": "idle"
  }
]
```

---

## 会话接口

### 创建会话

```http
POST /api/sessions
Content-Type: application/json

{
  "title": "我的项目",
  "workingDirectory": "/path/to/project"
}
```

**请求体**:

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| title | string | 否 | 会话标题 |
| workingDirectory | string | 是 | 工作目录路径 |
| primaryAgent | string | 否 | 首选智能体 ID |

**响应示例**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "我的项目",
  "status": "active",
  "workingDirectory": "/path/to/project",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "messageCount": 0,
  "taskCount": 0
}
```

**错误响应**:

- `400 Bad Request` - 参数验证失败

### 获取会话列表

```http
GET /api/sessions
```

**响应示例**:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "我的项目",
    "status": "active",
    "workingDirectory": "/path/to/project",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "messageCount": 5,
    "taskCount": 2
  }
]
```

### 获取会话详情

```http
GET /api/sessions/:id
```

**路径参数**:

| 参数 | 类型 | 描述 |
|------|------|------|
| id | string | 会话 ID |

**响应示例**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "我的项目",
  "status": "active",
  "config": {
    "workingDirectory": "/path/to/project"
  },
  "workingDirectory": "/path/to/project",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "messageCount": 5,
  "taskCount": 2,
  "messages": [
    {
      "id": "msg-001",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "sender": "user",
      "senderId": "user-1",
      "senderName": "用户",
      "type": "text",
      "content": "帮我写一个排序算法",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "tasks": []
}
```

**错误响应**:

- `404 Not Found` - 会话不存在

### 删除会话

```http
DELETE /api/sessions/:id
```

**路径参数**:

| 参数 | 类型 | 描述 |
|------|------|------|
| id | string | 会话 ID |

**响应**:

- `204 No Content` - 删除成功
- `404 Not Found` - 会话不存在

---

## WebSocket 接口

### 连接

```javascript
const socket = io('/', {
  path: '/socket.io',
  transports: ['websocket', 'polling']
});
```

### 事件列表

#### 客户端发送事件

##### join - 加入会话

```javascript
socket.emit('join', 'session-id');
```

##### leave - 离开会话

```javascript
socket.emit('leave', 'session-id');
```

##### message - 发送消息

```javascript
socket.emit('message', {
  sessionId: 'session-id',
  content: '帮我实现一个功能'
});
```

##### cancel - 取消任务

```javascript
socket.emit('cancel', 'task-id');
```

#### 服务端推送事件

##### message - 新消息

```javascript
socket.on('message', (data) => {
  // data: Message 对象
  console.log(data.senderName, data.content);
});
```

**消息对象结构**:

```typescript
interface Message {
  id: string;
  sessionId: string;
  taskId?: string;
  sender: 'user' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'status' | 'error' | 'stream';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

##### agent_status - 智能体状态更新

```javascript
socket.on('agent_status', (data) => {
  // data: { agentId: string, status: string }
  console.log(`智能体 ${data.agentId} 状态: ${data.status}`);
});
```

##### task_status - 任务状态更新

```javascript
socket.on('task_status', (data) => {
  // data: { taskId: string, status: string }
  console.log(`任务 ${data.taskId} 状态: ${data.status}`);
});
```

##### stream - 流式输出

```javascript
socket.on('stream', (data) => {
  // data: StreamChunk
  console.log(data.content);
});
```

**流式输出块结构**:

```typescript
interface StreamChunk {
  messageId: string;
  index: number;
  content: string;
  isComplete: boolean;
}
```

##### error - 错误通知

```javascript
socket.on('error', (data) => {
  // data: { code: string, message: string }
  console.error(`错误 [${data.code}]: ${data.message}`);
});
```

---

## 状态码说明

| 状态码 | 描述 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无内容） |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 错误代码

| 代码 | 描述 |
|------|------|
| SESSION_NOT_FOUND | 会话不存在 |
| AGENT_NOT_FOUND | 智能体不存在 |
| AGENT_BUSY | 智能体忙碌中 |
| TASK_NOT_FOUND | 任务不存在 |
| INVALID_MESSAGE | 无效消息 |
| UNAUTHORIZED | 未授权 |

---

## 速率限制

API 请求速率限制：

- 标准接口: 100 次/分钟
- 消息发送: 30 次/分钟
- 会话创建: 10 次/分钟

超过限制将返回 `429 Too Many Requests`。