import { AgentRole, AgentConfig } from '../types/agent';

/**
 * Agent role descriptions
 */
export const AGENT_ROLE_NAMES: Record<AgentRole, string> = {
  master: '师父',
  executor: '执行者',
  inspector: '检查者',
  assistant: '助手',
  advisor: '顾问',
};

/**
 * Default agent IDs
 */
export const AGENT_IDS = {
  TANGSENG: 'tangseng',
  WUKONG: 'wukong',
  BAJIE: 'bajie',
  SHASENG: 'shaseng',
  RULAI: 'rulai',
} as const;

/**
 * Agent roles priority order (for task assignment)
 */
export const AGENT_ROLE_PRIORITY: AgentRole[] = [
  'master',    // Tangseng - coordinator
  'executor',  // Wukong - primary executor
  'inspector', // Shaseng - quality checker
  'assistant', // Bajie - helper
  'advisor',   // Rulai - senior advisor
];

/**
 * Default model for each agent role
 */
export const DEFAULT_AGENT_MODELS: Record<AgentRole, string> = {
  master: 'claude-opus-4-6',
  executor: 'claude-sonnet-4-6',
  inspector: 'claude-sonnet-4-6',
  assistant: 'claude-sonnet-4-6',
  advisor: 'claude-opus-4-6',
};

/**
 * Default agent configurations
 */
export const DEFAULT_AGENTS: Partial<AgentConfig>[] = [
  {
    id: AGENT_IDS.TANGSENG,
    name: '唐僧',
    emoji: '🙏',
    role: 'master',
    model: DEFAULT_AGENT_MODELS.master,
  },
  {
    id: AGENT_IDS.WUKONG,
    name: '孙悟空',
    emoji: '🐵',
    role: 'executor',
    model: DEFAULT_AGENT_MODELS.executor,
  },
  {
    id: AGENT_IDS.BAJIE,
    name: '猪八戒',
    emoji: '🐷',
    role: 'assistant',
    model: DEFAULT_AGENT_MODELS.assistant,
  },
  {
    id: AGENT_IDS.SHASENG,
    name: '沙和尚',
    emoji: '🧑‍🦲',
    role: 'inspector',
    model: DEFAULT_AGENT_MODELS.inspector,
  },
  {
    id: AGENT_IDS.RULAI,
    name: '如来佛祖',
    emoji: '🧘',
    role: 'advisor',
    model: DEFAULT_AGENT_MODELS.advisor,
  },
];