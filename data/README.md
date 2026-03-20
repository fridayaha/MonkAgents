# 数据存储目录

本目录用于存放 MonkAgents 的持久化数据。

## 目录结构

```
data/
├── sqlite/              # SQLite 数据库文件
│   └── monkagents.db
└── checkpoints/         # 智能体检查点
    └── *.json
```

## 数据库文件

### SQLite

默认使用 SQLite 作为数据库，文件位于：

```
data/sqlite/monkagents.db
```

数据库文件会在首次启动时自动创建。

### 备份

建议定期备份数据库文件：

```bash
# 创建备份
cp data/sqlite/monkagents.db data/sqlite/monkagents.db.$(date +%Y%m%d).bak

# 或使用 sqlite3 在线备份
sqlite3 data/sqlite/monkagents.db ".backup data/sqlite/backup.db"
```

### 迁移

数据库迁移由 TypeORM 自动管理，表结构会根据实体定义自动同步。

## 检查点

智能体执行过程中的检查点数据存储在 `checkpoints/` 目录：

- 用于任务恢复
- 状态快照
- 断点续传

### 检查点格式

```json
{
  "id": "checkpoint-uuid",
  "sessionId": "session-id",
  "agentId": "wukong",
  "state": { ... },
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## 数据清理

### 清理过期数据

```bash
# 清理 30 天前的检查点
find data/checkpoints -name "*.json" -mtime +30 -delete
```

### 重置数据库

```bash
# 停止服务
# 删除数据库文件
rm data/sqlite/monkagents.db
# 重启服务将自动创建新数据库
```

## 存储容量

SQLite 支持：
- 最大数据库大小：140 TB
- 最大单表行数：18,446,744,073,709,551,615
- 最大单表大小：无限制

对于大规模部署，建议迁移到 PostgreSQL。

## 数据安全

- 数据库文件权限应设置为仅应用可读写
- 敏感数据应加密存储
- 定期备份重要数据
- 生产环境建议使用专用数据库服务器