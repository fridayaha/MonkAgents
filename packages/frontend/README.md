# @monkagents/frontend

MonkAgents 前端应用，基于 Vite 构建。

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 目录结构

```
src/
├── index.html        # 主页面
├── styles/
│   └── main.css      # 样式文件
└── scripts/
    ├── app.js        # 主应用逻辑
    ├── api.js        # API 请求封装
    └── websocket.js  # WebSocket 客户端
```

## 页面布局

采用三栏式布局：

```
┌────────────────────────────────────────────┐
│                  顶部栏                     │
├───────────┬────────────────┬───────────────┤
│           │                │               │
│  会话列表  │    对话区域    │   智能体列表   │
│           │                │               │
│           │                │               │
│           ├────────────────┤               │
│           │    输入区域    │               │
│           └────────────────┘               │
└───────────┴────────────────┴───────────────┘
```

## 功能模块

### API 模块 (api.js)

封装了所有 REST API 请求：

```javascript
import { api } from './api.js';

// 健康检查
await api.health();

// 获取智能体列表
await api.getAgents();

// 创建会话
await api.createSession({
  title: '我的会话',
  workingDirectory: '/path/to/project'
});

// 获取会话列表
await api.getSessions();
```

### WebSocket 模块 (websocket.js)

处理实时通信：

```javascript
import { wsClient } from './websocket.js';

// 连接
wsClient.connect();

// 加入会话
wsClient.join('session-id');

// 发送消息
wsClient.sendMessage('session-id', '内容');

// 监听事件
wsClient.on('message', (data) => {
  console.log('收到消息:', data);
});
```

### 主应用 (app.js)

应用主逻辑：

- 会话管理
- 消息展示
- 智能体状态显示
- 用户交互处理

## 样式说明

### CSS 变量

```css
:root {
  --primary-color: #4a90d9;
  --primary-hover: #357abd;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --warning-color: #ffc107;
  --danger-color: #dc3545;
  --bg-color: #f5f7fa;
  --text-color: #333333;
  --border-color: #e0e0e0;
}
```

### 响应式设计

- 桌面端 (>1024px): 完整三栏布局
- 平板端 (768px-1024px): 简化布局
- 移动端 (<768px): 单栏布局

## 代理配置

开发环境代理配置 (vite.config.js):

```javascript
server: {
  proxy: {
    '/api': 'http://localhost:3000',
    '/socket.io': {
      target: 'http://localhost:3000',
      ws: true,
    },
  },
}
```

## 浏览器支持

- Chrome >= 80
- Firefox >= 75
- Safari >= 13
- Edge >= 80

## 许可证

MIT