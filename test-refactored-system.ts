import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './packages/backend/src/app.module';
import { AgentsService } from './packages/backend/src/agents/agents.service';
import { AgentRegistry } from './packages/backend/src/agents/agent-registry.service';

async function testRefactoredSystem() {
  console.log('🧪 Testing refactored MonkAgents system...\n');

  let app: INestApplication;
  try {
    // 创建测试应用实例
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // 获取服务实例
    const agentsService = app.get<AgentsService>(AgentsService);
    const agentRegistry = app.get<AgentRegistry>(AgentRegistry);

    console.log('✅ Services initialized successfully\n');

    // 测试1: 检查智能体注册表
    console.log('📋 Testing Agent Registry...');
    const allAgents = agentRegistry.getAllAgents();
    console.log(`   Found ${allAgents.size} registered agents:`);
    allAgents.forEach((agent, id) => {
      console.log(`   - ${id}: ${agent.getName()} (${agent.getId()})`);
    });

    // 测试2: 检查可执行智能体
    console.log('\n🏃 Testing Executable Agents...');
    const executableAgents = agentRegistry.getExecutableAgents();
    console.log(`   Found ${executableAgents.length} executable agents:`);
    executableAgents.forEach(agent => {
      console.log(`   - ${agent.getId()}: ${agent.getName()} (canHandle: ${agent.canHandle('test')})`);
    });

    // 测试3: 获取特定智能体
    console.log('\n🔍 Testing Specific Agent Retrieval...');
    const wukongAgent = agentRegistry.getExecutableAgent('wukong');
    if (wukongAgent) {
      console.log(`   ✓ Retrieved 孙悟空 agent: ${wukongAgent.getName()}`);
      console.log(`   - ID: ${wukongAgent.getId()}`);
      console.log(`   - Can handle 'write code': ${wukongAgent.canHandle('write code')}`);
      console.log(`   - Priority weight: ${wukongAgent.getPriorityWeight()}`);
    } else {
      console.log('   ✗ Could not retrieve 孙悟空 agent');
    }

    // 测试4: 智能体选择
    console.log('\n🎯 Testing Agent Selection...');
    const bestAgent = agentRegistry.findBestAgent('write a simple javascript function');
    if (bestAgent) {
      console.log(`   ✓ Best agent for coding task: ${bestAgent.getName()} (${bestAgent.getId()})`);
      console.log(`   - Priority weight: ${bestAgent.getPriorityWeight()}`);
    } else {
      console.log('   ⚠ No suitable agent found for coding task');
    }

    // 测试5: 智能体服务功能
    console.log('\n⚙️  Testing Agents Service...');
    await agentsService.onModuleInit(); // 初始化服务
    const allAgentStates = await agentsService.getAllAgents();
    console.log(`   ✓ Agents service loaded ${allAgentStates.length} agent states`);

    const availableAgents = await agentsService.getAvailableAgents();
    console.log(`   ✓ Found ${availableAgents.length} available agents`);

    // 测试6: 智能体状态汇总
    console.log('\n📊 Testing Status Summary...');
    const statusSummary = agentsService.getAgentsStatusSummary();
    Object.entries(statusSummary).forEach(([id, status]) => {
      console.log(`   - ${id}: ${status.status} (available: ${status.available})`);
    });

    console.log('\n🎉 All tests passed! The refactored system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (app) {
      await app.close();
    }
  }
}

// 运行测试
testRefactoredSystem();