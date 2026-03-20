# 智能体技能

本目录用于存放智能体的技能模块。

## 概述

技能是智能体的能力扩展，每个技能定义了智能体可以执行的一类操作。

## 技能结构

```
skills/
├── coding/
│   ├── index.ts      # 技能入口
│   ├── prompts/      # 提示词模板
│   └── tools/        # 工具函数
├── debugging/
├── testing/
└── documentation/
```

## 内置技能

### coding（编码）

生成、修改和重构代码的能力。

**触发关键词**: 编写、实现、开发、编码

**支持操作**:
- 生成新代码文件
- 修改现有代码
- 代码重构
- 代码解释

### debugging（调试）

定位和修复代码问题的能力。

**触发关键词**: 调试、修复、debug、报错、错误

**支持操作**:
- 错误分析
- 日志解读
- 问题定位
- 修复建议

### testing（测试）

编写和运行测试的能力。

**触发关键词**: 测试、test、单元测试、集成测试

**支持操作**:
- 生成单元测试
- 运行测试用例
- 测试覆盖率分析
- 测试报告生成

### documentation（文档）

编写和维护文档的能力。

**触发关键词**: 文档、注释、readme、说明

**支持操作**:
- 生成 API 文档
- 编写 README
- 添加代码注释
- 生成使用说明

## 创建新技能

1. 在 `skills/` 目录下创建新文件夹
2. 创建 `index.ts` 入口文件
3. 定义技能配置和处理器
4. 在智能体配置中引用

### 示例

```typescript
// skills/code-review/index.ts
export const skill = {
  name: 'code-review',
  description: '代码审查技能',
  triggers: ['审查', 'review', '检查代码'],
  execute: async (context) => {
    // 技能实现
  }
};
```

## 技能配置

在智能体配置文件中引用技能：

```yaml
skills:
  - coding
  - debugging
  - testing
```

## 开发计划

- [ ] 技能加载机制
- [ ] 技能热更新
- [ ] 技能组合
- [ ] 自定义技能模板