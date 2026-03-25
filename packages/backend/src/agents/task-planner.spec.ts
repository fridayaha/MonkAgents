import { Test, TestingModule } from '@nestjs/testing';
import { TaskPlanner } from './task-planner';

describe('TaskPlanner', () => {
  let planner: TaskPlanner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskPlanner],
    }).compile();

    planner = module.get<TaskPlanner>(TaskPlanner);
  });

  describe('parsePlanResult', () => {
    it('should parse valid JSON', () => {
      const result = planner['parsePlanResult'](`{
        "type": "task",
        "analysis": "测试分析",
        "steps": [
          {
            "stepId": 1,
            "taskName": "测试任务",
            "agentRole": "wukong",
            "taskDetail": "测试详情",
            "dependencies": [],
            "priority": "high"
          }
        ],
        "summary": "测试总结",
        "needsHelp": false
      }`);

      expect(result.type).toBe('task');
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].agentRole).toBe('wukong');
    });

    it('should parse JSON in code block', () => {
      const result = planner['parsePlanResult'](`\`\`\`json
{
  "type": "chat",
  "analysis": "闲聊测试",
  "steps": [],
  "summary": "闲聊",
  "needsHelp": false
}
\`\`\``);

      expect(result.type).toBe('chat');
    });

    it('should handle chat type with chatResponders', () => {
      const result = planner['parsePlanResult'](`{
        "type": "chat",
        "analysis": "问候测试",
        "chatTopic": "问候",
        "chatResponders": [
          {
            "agentRole": "wukong",
            "reason": "测试原因",
            "topic": "问候话题"
          }
        ],
        "steps": [],
        "summary": "问候回复",
        "needsHelp": false
      }`);

      expect(result.type).toBe('chat');
      expect(result.chatResponders).toHaveLength(1);
      expect(result.chatResponders![0].agentRole).toBe('wukong');
    });

    it('should fix truncated JSON with incomplete string', () => {
      // 模拟实际的截断情况：南京天气查询
      const truncated = `{
  "type": "chat",
  "analysis": "用户询问南京明天的天气情况，属于日常生活中的简单查询问题，归类为闲聊模式",
  "chatTopic": "天气查询",
  "chatResponders": [
    {
      "agentRole": "bajie",
      "reason": "天气是生活日常话题，符合猪八戒擅长的生活趣事和轻松话题风格",
      "topic": "以轻松幽默的方式告诉用户如何查询天气，或提供天气查询建议"
    },
    {
      "agentRole": "wukong",
      "rea`;

      const result = planner['parsePlanResult'](truncated);

      // 应该能够解析出部分结果，而不是抛出异常
      expect(result.type).toBe('chat');
      expect(result.chatResponders).toHaveLength(1);
      expect(result.chatResponders![0].agentRole).toBe('bajie');
    });

    it('should fix truncated JSON with incomplete array element', () => {
      const truncated = `{
  "type": "chat",
  "analysis": "测试分析",
  "chatResponders": [
    {"agentRole": "wukong", "reason": "原因1"},
    {"agentRole": "bajie", "reason": "原因2",`;

      const result = planner['parsePlanResult'](truncated);

      expect(result.type).toBe('chat');
      expect(result.chatResponders).toHaveLength(1);
      expect(result.chatResponders![0].agentRole).toBe('wukong');
    });

    it('should return default plan when JSON is completely broken', () => {
      // 完全无法解析的内容
      const broken = 'this is not json at all';

      expect(() => planner['parsePlanResult'](broken)).toThrow('No JSON found in result');
    });

    it('should handle Chinese agent roles', () => {
      const result = planner['parsePlanResult'](`{
        "type": "task",
        "analysis": "测试",
        "steps": [
          {
            "stepId": 1,
            "taskName": "测试",
            "agentRole": "孙悟空",
            "taskDetail": "测试",
            "dependencies": [],
            "priority": "medium"
          }
        ],
        "summary": "测试",
        "needsHelp": false
      }`);

      expect(result.steps[0].agentRole).toBe('wukong');
    });

    it('should handle various agent role formats', () => {
      const testCases = [
        { input: 'wukong', expected: 'wukong' },
        { input: '孙悟空', expected: 'wukong' },
        { input: 'executor', expected: 'wukong' },
        { input: 'tangseng', expected: 'tangseng' },
        { input: '唐僧', expected: 'tangseng' },
        { input: 'master', expected: 'tangseng' },
        { input: 'bajie', expected: 'bajie' },
        { input: '猪八戒', expected: 'bajie' },
        { input: 'assistant', expected: 'bajie' },
        { input: 'shaseng', expected: 'shaseng' },
        { input: '沙和尚', expected: 'shaseng' },
        { input: '沙僧', expected: 'shaseng' },
        { input: 'inspector', expected: 'shaseng' },
        { input: 'rulai', expected: 'rulai' },
        { input: '如来', expected: 'rulai' },
        { input: '如来佛祖', expected: 'rulai' },
        { input: 'advisor', expected: 'rulai' },
        { input: 'unknown', expected: 'wukong' }, // fallback
      ];

      for (const tc of testCases) {
        const result = planner['parsePlanResult'](`{
          "type": "task",
          "analysis": "测试",
          "steps": [{"stepId": 1, "taskName": "测试", "agentRole": "${tc.input}", "taskDetail": "测试", "dependencies": [], "priority": "medium"}],
          "summary": "测试",
          "needsHelp": false
        }`);
        expect(result.steps[0].agentRole).toBe(tc.expected);
      }
    });
  });

  describe('getDefaultPlan', () => {
    it('should return a valid default plan', () => {
      const plan = planner['getDefaultPlan']('测试任务');

      expect(plan.type).toBe('task');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].agentRole).toBe('wukong');
      expect(plan.steps[0].taskDetail).toBe('测试任务');
    });
  });

  describe('normalizeAgentRole', () => {
    it('should normalize all valid roles', () => {
      const testCases = [
        { input: 'wukong', expected: 'wukong' },
        { input: 'WUKONG', expected: 'wukong' },
        { input: '孙悟空', expected: 'wukong' },
        { input: 'tangseng', expected: 'tangseng' },
        { input: '唐僧', expected: 'tangseng' },
        { input: 'bajie', expected: 'bajie' },
        { input: '猪八戒', expected: 'bajie' },
        { input: 'shaseng', expected: 'shaseng' },
        { input: '沙和尚', expected: 'shaseng' },
        { input: 'rulai', expected: 'rulai' },
        { input: '如来佛祖', expected: 'rulai' },
      ];

      for (const tc of testCases) {
        const result = planner['normalizeAgentRole'](tc.input);
        expect(result).toBe(tc.expected);
      }
    });
  });
});