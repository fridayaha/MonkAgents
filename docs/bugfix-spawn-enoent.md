# BUG 修复复盘：spawn ENOENT 错误

## 问题描述

**症状**: 在前端界面创建会话并执行任务时，后端报错 `Error: spawn C:\Users\Lenovo\.local\bin\claude.exe ENOENT`

**环境**:
- Windows 11
- 后端服务在单独终端窗口运行
- 前端通过 WebSocket 发送任务

**复现步骤**:
1. 启动后端服务 `npm run start:dev -w @monkagents/backend`
2. 启动前端，创建新会话，选择工作目录
3. 发送任务（如"创建一个hello.txt"）
4. 后端报错，任务无法执行

## 排查过程

### 第一阶段：初步怀疑

初始怀疑是 `claude.exe` 不存在或路径问题。但：
- 直接运行 `claude` 命令正常
- 测试脚本 `test-spawn.js` 能正常调用

### 第二阶段：环境变量问题

发现 Claude CLI 不允许嵌套调用：
```
Error: Claude Code cannot be launched inside another Claude Code session.
To bypass this check, unset the CLAUDECODE environment variable.
```

**解决方案**: 在 spawn 时移除 `CLAUDECODE` 和 `CLAUDE_CODE` 相关环境变量。

修改了以下文件：
- `task-planner.ts`
- `executable-agent-base.ts`
- `agent-base.ts`
- `cli.session.ts`

**结果**: 测试脚本成功，但后端服务仍然失败。

### 第三阶段：深入调试

添加调试端点 `/api/debug/spawn/test`：
- 端点调用成功
- 后端服务调用失败

对比发现差异：
| 项目 | 调试端点 | 后端服务 |
|------|----------|----------|
| 工作目录 | `process.cwd()` (绝对路径) | `monkagent_test` (相对路径) |
| 目录存在 | ✅ | ❌ |

### 第四阶段：根因定位

**根本原因**: 前端传递工作目录时使用了 `dirHandle.name`（仅目录名），而不是完整路径。

```javascript
// 原代码 - 只获取目录名
document.getElementById('working-dir-input').value = dirHandle.name;
```

浏览器安全限制，`showDirectoryPicker` API 只返回目录名，不返回完整路径。

**问题链**:
1. 前端传递 `monkagent_test`（相对路径）
2. 后端解析为 `D:\workspace\MonkAgents\packages\backend\monkagent_test`
3. 该目录不存在
4. spawn 在不存在的目录下执行失败 → ENOENT

## 解决方案

### 1. 前端改进

**修改 `index.html`**:
- 输入框改为可编辑，允许用户直接输入完整路径
- 提示用户输入"完整的绝对路径"

**修改 `app.js`**:
- 实现 `showDirectoryBrowser()` 方法
- 通过后端 API 浏览服务器目录

### 2. 后端改进

**新增 API `/api/debug/fs/browse`**:
- 列出服务器目录
- 支持上级目录导航
- 返回绝对路径

**修改 `task-planner.ts` 和 `executable-agent-base.ts`**:
- 工作目录转换为绝对路径
- 检查目录是否存在，不存在则回退到 `process.cwd()`
- 添加警告日志

```typescript
// Resolve working directory to absolute path
let actualWorkingDir = workingDirectory
  ? (path.isAbsolute(workingDirectory) ? workingDirectory : path.resolve(process.cwd(), workingDirectory))
  : process.cwd();

// Ensure working directory exists
if (!fs.existsSync(actualWorkingDir)) {
  this.logger.warn(`工作目录不存在: ${actualWorkingDir}，使用当前目录: ${process.cwd()}`);
  actualWorkingDir = process.cwd();
}
```

## 经验总结

### 1. ENOENT 错误排查清单

当遇到 `spawn ENOENT` 时，检查：
- [ ] 可执行文件是否存在
- [ ] 工作目录是否存在（**本次根因**）
- [ ] 环境变量是否正确（嵌套调用限制）
- [ ] 路径是绝对路径还是相对路径
- [ ] Windows 下 shell 选项设置

### 2. 调试技巧

1. **创建最小复现脚本** - 隔离问题，排除框架干扰
2. **对比成功/失败场景** - 找出差异点
3. **添加调试端点** - 在服务内验证逻辑
4. **详细日志** - 记录每一步的实际值

### 3. 设计改进

- **前端**: 不要依赖浏览器 API 返回完整路径，改用服务器端浏览
- **后端**: 对外部输入（工作目录）进行验证和容错处理
- **日志**: 在关键路径添加调试日志，便于快速定位

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/index.html` | 输入框可编辑，更新提示文字 |
| `packages/frontend/src/scripts/app.js` | 新增 `showDirectoryBrowser()` 方法 |
| `packages/backend/src/agents/task-planner.ts` | 添加 path/fs 导入，工作目录验证，清理环境变量 |
| `packages/backend/src/agents/executable-agent-base.ts` | 添加 path/fs 导入，工作目录验证 |
| `packages/backend/src/debug/debug.controller.ts` | 新增 spawn 测试端点和目录浏览端点 |
| `README.md` | 更新文档，添加常见问题说明 |

## 后续改进建议

1. **前端验证**: 创建会话时验证工作目录格式（是否为绝对路径）
2. **后端创建目录**: 可选择自动创建不存在的目录
3. **配置默认目录**: 在系统配置中设置默认工作目录
4. **单元测试**: 添加工作目录处理的测试用例

---

*修复日期: 2026-03-21*