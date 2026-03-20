import {
  AGENT_ROLE_NAMES,
  AGENT_IDS,
  AGENT_ROLE_PRIORITY,
  DEFAULT_AGENT_MODELS,
  DEFAULT_AGENTS,
} from './agents';
import { AgentRole } from '../types/agent';

describe('Agent Constants', () => {
  describe('AGENT_ROLE_NAMES', () => {
    it('should have names for all roles', () => {
      const roles: AgentRole[] = ['master', 'executor', 'inspector', 'assistant', 'advisor'];
      roles.forEach(role => {
        expect(AGENT_ROLE_NAMES[role]).toBeDefined();
        expect(typeof AGENT_ROLE_NAMES[role]).toBe('string');
      });
    });

    it('should have Chinese names', () => {
      expect(AGENT_ROLE_NAMES.master).toBe('师父');
      expect(AGENT_ROLE_NAMES.executor).toBe('执行者');
      expect(AGENT_ROLE_NAMES.inspector).toBe('检查者');
      expect(AGENT_ROLE_NAMES.assistant).toBe('助手');
      expect(AGENT_ROLE_NAMES.advisor).toBe('顾问');
    });
  });

  describe('AGENT_IDS', () => {
    it('should have all expected agent IDs', () => {
      expect(AGENT_IDS.TANGSENG).toBe('tangseng');
      expect(AGENT_IDS.WUKONG).toBe('wukong');
      expect(AGENT_IDS.BAJIE).toBe('bajie');
      expect(AGENT_IDS.SHASENG).toBe('shaseng');
      expect(AGENT_IDS.RULAI).toBe('rulai');
    });
  });

  describe('AGENT_ROLE_PRIORITY', () => {
    it('should have 5 roles in priority order', () => {
      expect(AGENT_ROLE_PRIORITY).toHaveLength(5);
    });

    it('should have master as highest priority', () => {
      expect(AGENT_ROLE_PRIORITY[0]).toBe('master');
    });

    it('should have executor as second priority', () => {
      expect(AGENT_ROLE_PRIORITY[1]).toBe('executor');
    });

    it('should have all unique roles', () => {
      const uniqueRoles = new Set(AGENT_ROLE_PRIORITY);
      expect(uniqueRoles.size).toBe(AGENT_ROLE_PRIORITY.length);
    });
  });

  describe('DEFAULT_AGENT_MODELS', () => {
    it('should have models for all roles', () => {
      const roles: AgentRole[] = ['master', 'executor', 'inspector', 'assistant', 'advisor'];
      roles.forEach(role => {
        expect(DEFAULT_AGENT_MODELS[role]).toBeDefined();
        expect(DEFAULT_AGENT_MODELS[role]).toContain('claude');
      });
    });

    it('should use opus for master and advisor', () => {
      expect(DEFAULT_AGENT_MODELS.master).toContain('opus');
      expect(DEFAULT_AGENT_MODELS.advisor).toContain('opus');
    });

    it('should use sonnet for executor, inspector, assistant', () => {
      expect(DEFAULT_AGENT_MODELS.executor).toContain('sonnet');
      expect(DEFAULT_AGENT_MODELS.inspector).toContain('sonnet');
      expect(DEFAULT_AGENT_MODELS.assistant).toContain('sonnet');
    });
  });

  describe('DEFAULT_AGENTS', () => {
    it('should have 5 default agents', () => {
      expect(DEFAULT_AGENTS).toHaveLength(5);
    });

    it('should have correct structure for each agent', () => {
      DEFAULT_AGENTS.forEach(agent => {
        expect(agent.id).toBeDefined();
        expect(agent.name).toBeDefined();
        expect(agent.emoji).toBeDefined();
        expect(agent.role).toBeDefined();
      });
    });

    it('should have unique IDs', () => {
      const ids = DEFAULT_AGENTS.map(a => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique roles', () => {
      const roles = DEFAULT_AGENTS.map(a => a.role);
      const uniqueRoles = new Set(roles);
      expect(uniqueRoles.size).toBe(roles.length);
    });

    it('should have Tangseng as master', () => {
      const tangseng = DEFAULT_AGENTS.find(a => a.id === 'tangseng');
      expect(tangseng).toBeDefined();
      expect(tangseng?.role).toBe('master');
    });

    it('should have Wukong as executor', () => {
      const wukong = DEFAULT_AGENTS.find(a => a.id === 'wukong');
      expect(wukong).toBeDefined();
      expect(wukong?.role).toBe('executor');
    });
  });
});