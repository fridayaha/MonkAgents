import { ConfigService } from './config.service';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockedReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Default mock implementations
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue('');
  });

  describe('constructor', () => {
    it('should initialize with default config when files not found', () => {
      service = new ConfigService();
      const dbConfig = service.getDatabaseConfig();
      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.database).toBe('monkagents');
    });

    it('should load system config from file', () => {
      const mockConfig = `
database:
  type: mysql
  host: db.example.com
  port: 3307
  username: admin
  password: secret
  database: testdb
server:
  port: 4000
`;
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(mockConfig);

      service = new ConfigService();
      expect(service.getServerPort()).toBe(4000);
      const dbConfig = service.getDatabaseConfig();
      expect(dbConfig.host).toBe('db.example.com');
      expect(dbConfig.port).toBe(3307);
      expect(dbConfig.password).toBe('secret');
    });

    it('should load agent configs from files', () => {
      const mockAgentConfig = `
id: wukong
name: 孙悟空
emoji: 🐵
role: executor
persona: Test persona
model: claude-sonnet-4-6
cli:
  command: claude
  args: []
skills: []
mcps: []
capabilities: []
boundaries: []
`;
      mockedExistsSync
        .mockReturnValueOnce(false) // system config not found
        .mockReturnValue(true); // agents dir found

      mockedReadFileSync.mockReturnValue(mockAgentConfig);

      service = new ConfigService();
      const configs = service.getAllAgentConfigs();
      expect(configs.length).toBeGreaterThan(0);
    });
  });

  describe('getDatabaseConfig', () => {
    it('should return default MySQL config', () => {
      service = new ConfigService();
      const dbConfig = service.getDatabaseConfig();
      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.port).toBe(3306);
      expect(dbConfig.database).toBe('monkagents');
    });
  });

  describe('getServerPort', () => {
    it('should return default port 3000', () => {
      service = new ConfigService();
      expect(service.getServerPort()).toBe(3000);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      service = new ConfigService();
      expect(service.isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      service = new ConfigService();
      expect(service.isDevelopment()).toBe(false);
    });
  });

  describe('getAgentConfig', () => {
    it('should return undefined for non-existent agent', () => {
      service = new ConfigService();
      expect(service.getAgentConfig('non-existent')).toBeUndefined();
    });
  });

  describe('getAgentIds', () => {
    it('should return empty array when no agents loaded', () => {
      service = new ConfigService();
      const ids = service.getAgentIds();
      expect(Array.isArray(ids)).toBe(true);
    });
  });
});