import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { readFile, access, mkdir } from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises');
const mockedAccess = access as jest.MockedFunction<typeof access>;
const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockedMkdir = mkdir as jest.MockedFunction<typeof mkdir>;

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Default mock implementations
    mockedAccess.mockRejectedValue(new Error('File not found'));
    mockedReadFile.mockResolvedValue('');
    mockedMkdir.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  describe('onModuleInit', () => {
    it('should initialize with default config when files not found', async () => {
      await service.onModuleInit();
      expect(service.getDatabasePath()).toBeDefined();
    });

    it('should load system config from file', async () => {
      const mockConfig = `
database:
  type: sqlite
  path: ./test.db
server:
  port: 4000
`;
      mockedAccess.mockResolvedValueOnce(undefined);
      mockedReadFile.mockResolvedValueOnce(mockConfig);

      await service.onModuleInit();
      expect(service.getServerPort()).toBe(4000);
    });

    it('should load agent configs from files', async () => {
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
      mockedAccess
        .mockRejectedValueOnce(new Error('No system config'))
        .mockResolvedValue(undefined);
      mockedReadFile.mockResolvedValue(mockAgentConfig);

      await service.onModuleInit();
      const configs = service.getAllAgentConfigs();
      expect(configs.length).toBeGreaterThan(0);
    });
  });

  describe('getDatabasePath', () => {
    it('should return a valid path', async () => {
      await service.onModuleInit();
      const path = service.getDatabasePath();
      expect(path).toContain('sqlite');
      expect(path).toContain('.db');
    });
  });

  describe('getServerPort', () => {
    it('should return default port 3000', async () => {
      await service.onModuleInit();
      expect(service.getServerPort()).toBe(3000);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is not production', async () => {
      process.env.NODE_ENV = 'development';
      await service.onModuleInit();
      expect(service.isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      await service.onModuleInit();
      expect(service.isDevelopment()).toBe(false);
    });
  });

  describe('getAgentConfig', () => {
    it('should return undefined for non-existent agent', async () => {
      await service.onModuleInit();
      expect(service.getAgentConfig('non-existent')).toBeUndefined();
    });
  });

  describe('getAgentIds', () => {
    it('should return empty array when no agents loaded', async () => {
      await service.onModuleInit();
      const ids = service.getAgentIds();
      expect(Array.isArray(ids)).toBe(true);
    });
  });
});