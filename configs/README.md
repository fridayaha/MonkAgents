# 配置文件目录

本目录存放 MonkAgents 的所有配置文件。

## 目录结构

```
configs/
├── system.yaml          # 系统配置
└── agents/              # 智能体配置
    ├── tangseng.yaml    # 唐僧配置
    ├── wukong.yaml      # 孙悟空配置
    ├── bajie.yaml       # 猪八戒配置
    ├── shaseng.yaml     # 沙和尚配置
    └── rulai.yaml       # 如来佛祖配置
```

## 系统配置

`system.yaml` 包含系统级别的配置：

```yaml
# 数据库配置
database:
  type: sqlite                    # 数据库类型: sqlite | postgres
  path: ./data/sqlite/monkagents.db

# Redis 配置（可选，用于分布式场景）
redis:
  host: localhost
  port: 6379
  db: 0

# 服务器配置
server:
  port: 3000                      # 服务端口
  host: localhost                 # 服务地址

# 日志配置
logging:
  level: info                     # 日志级别: debug | info | warn | error
  format: pretty                  # 输出格式: json | pretty

# 智能体配置路径
agents:
  configPath: ./configs/agents
```

## 智能体配置

每个智能体都有独立的配置文件，定义其行为和能力。

### 配置字段说明

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | ✅ | 智能体唯一标识 |
| name | string | ✅ | 显示名称 |
| emoji | string | ✅ | 表情符号 |
| role | string | ✅ | 角色类型 |
| persona | string | ✅ | 人设描述 |
| model | string | ✅ | 使用的 AI 模型 |
| cli | object | ✅ | CLI 调用配置 |
| skills | string[] | ❌ | 技能列表 |
| mcps | string[] | ❌ | MCP 配置 |
| capabilities | string[] | ❌ | 能力列表 |
| boundaries | string[] | ❌ | 工作边界 |

### 角色类型

| 角色 | 标识 | 描述 |
|------|------|------|
| 师父 | master | 团队领导者 |
| 执行者 | executor | 主要执行者 |
| 助手 | assistant | 辅助支持 |
| 检查者 | inspector | 质量保证 |
| 顾问 | advisor | 战略指导 |

### 配置示例

```yaml
id: wukong
name: 孙悟空
emoji: 🐵
role: executor

persona: |
  你是孙悟空，团队的主力执行者。你拥有强大的技术能力，
  能够完成各种复杂的编程和技术任务。

  性格特点：
  - 技术能力出众，解决问题的能力强
  - 反应迅速，执行效率高
  - 有时会过于自信，但关键时刻值得信赖

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

## 配置热更新

配置文件支持热更新，修改配置后无需重启服务：

```bash
# 发送信号重载配置
kill -HUP <pid>
```

## 环境变量

支持通过环境变量覆盖配置：

```bash
# 服务器端口
export SERVER_PORT=4000

# 数据库路径
export DATABASE_PATH=/data/monkagents.db

# 日志级别
export LOG_LEVEL=debug
```

## 配置验证

配置文件采用 YAML 格式，启动时会自动验证：

- 必填字段检查
- 类型验证
- 值范围检查
- 依赖关系检查