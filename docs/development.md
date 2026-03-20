# 开发指南

本文档为开发者提供 MonkAgents 项目的开发指导。

## 开发环境设置

### 前置条件

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git
- 推荐使用 VS Code

### 克隆项目

```bash
git clone <repository-url>
cd MonkAgents
```

### 安装依赖

```bash
npm install
```

### IDE 配置

推荐安装以下 VS Code 扩展：

- ESLint
- Prettier
- TypeScript Hero
- NestJS Files

## 项目结构

```
MonkAgents/
├── packages/
│   ├── frontend/          # 前端代码
│   ├── backend/           # 后端代码
│   └── shared/            # 共享代码
├── configs/               # 配置文件
├── data/                  # 数据存储
├── skills/                # 技能模块
├── docker/                # Docker 配置
└── docs/                  # 文档
```

## 开发流程

### 1. 创建功能分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 开发

#### 修改共享包

```bash
# 编辑 packages/shared/src/ 下的文件
npm run build -w @monkagents/shared
```

#### 修改后端

```bash
# 启动开发服务器
npm run start:dev -w @monkagents/backend
```

#### 修改前端

```bash
cd packages/frontend
npm run dev
```

### 3. 编写测试

测试文件放在源文件同级目录，命名为 `*.spec.ts`：

```typescript
// src/my-service/my-service.spec.ts
import { MyService } from './my-service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

### 4. 运行测试

```bash
# 运行所有测试
npm test

# 运行特定文件测试
npm test -- my-service.spec.ts

# 监听模式
npm run test:watch
```

### 5. 提交代码

```bash
git add .
git commit -m "feat: 添加某某功能"
```

提交信息格式：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具

## 代码规范

### TypeScript 规范

```typescript
// 使用接口定义对象结构
interface User {
  id: string;
  name: string;
}

// 使用类型别名定义联合类型
type Status = 'active' | 'inactive';

// 优先使用 const
const MAX_COUNT = 100;

// 使用 async/await
async function fetchData(): Promise<User> {
  const response = await fetch('/api/user');
  return response.json();
}
```

### NestJS 规范

```typescript
// 控制器
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }
}

// 服务
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }
}

// 模块
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

### 测试规范

```typescript
// 单元测试
describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UserService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('findAll', () => {
    it('should return users', async () => {
      const users = [{ id: '1', name: 'Test' }];
      jest.spyOn(repository, 'find').mockResolvedValue(users);

      const result = await service.findAll();
      expect(result).toEqual(users);
    });
  });
});
```

## 添加新功能

### 添加新 API 端点

1. 创建 DTO：

```typescript
// src/user/dto/create-user.dto.ts
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;
}
```

2. 创建控制器：

```typescript
// src/user/user.controller.ts
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }
}
```

3. 创建服务：

```typescript
// src/user/user.service.ts
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(dto);
    return this.userRepository.save(user);
  }
}
```

4. 创建模块：

```typescript
// src/user/user.module.ts
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

5. 注册模块：

```typescript
// src/app.module.ts
import { UserModule } from './user/user.module';

@Module({
  imports: [UserModule, ...],
})
export class AppModule {}
```

### 添加新智能体

1. 创建配置文件 `configs/agents/new-agent.yaml`：

```yaml
id: new-agent
name: 新智能体
emoji: 🤖
role: executor
persona: |
  你是新智能体...
model: claude-sonnet-4-6
cli:
  command: claude
  args: [-p, --output-format, stream-json]
skills: []
capabilities: []
boundaries: []
```

2. 创建智能体类（可选）：

```typescript
// src/agents/new-agent.agent.ts
@Injectable()
export class NewAgentAgent extends AgentBase {
  constructor() {
    const config: AgentConfig = { ... };
    super(config);
  }

  override async analyze(prompt: string): Promise<string> {
    // 实现分析逻辑
  }

  override async execute(task: string): Promise<AgentExecutionResult> {
    // 实现执行逻辑
  }
}
```

## 调试技巧

### 后端调试

```bash
# 启动调试模式
npm run start:debug -w @monkagents/backend
```

然后在 VS Code 中配置 launch.json：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach NestJS",
      "port": 9229
    }
  ]
}
```

### 数据库调试

```bash
# 查看 SQLite 数据
sqlite3 data/sqlite/monkagents.db

# 常用命令
.tables
.schema tasks
SELECT * FROM tasks;
```

### 日志调试

```typescript
import { Logger } from '@nestjs/common';

class MyService {
  private readonly logger = new Logger(MyService.name);

  someMethod() {
    this.logger.debug('调试信息');
    this.logger.log('普通日志');
    this.logger.warn('警告信息');
    this.logger.error('错误信息');
  }
}
```

## 常见问题

### 依赖安装失败

```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules packages/*/node_modules

# 重新安装
npm install
```

### 构建失败

```bash
# 清理构建产物
npm run clean

# 重新构建
npm run build
```

### 测试失败

```bash
# 更新快照
npm test -- -u

# 详细输出
npm test -- --verbose
```

## 发布流程

1. 更新版本号
2. 更新 CHANGELOG
3. 运行测试
4. 构建项目
5. 创建标签
6. 发布

```bash
npm version minor
npm test
npm run build
git tag v0.2.0
git push --tags
```