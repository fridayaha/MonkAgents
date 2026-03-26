import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { ConfigService } from '../config/config.service';

describe('RedisService', () => {
  let service: RedisService;

  const mockConfigService = {
    getRedisConfig: jest.fn().mockReturnValue({
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      keyPrefix: 'monkagents:',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(async () => {
    // Clean up
    await service.onModuleDestroy();
  });

  describe('CLI Session Management', () => {
    describe('setCliSession', () => {
      it('should save CLI session ID with correct key format', async () => {
        // Mock the Redis client methods
        const mockClient = {
          setex: jest.fn().mockResolvedValue('OK'),
          on: jest.fn(),
          quit: jest.fn().mockResolvedValue('OK'),
        };

        // Access private client property for testing
        (service as any).client = mockClient;
        (service as any).isConnected = true;

        await service.setCliSession('session-123', 'wukong', 'cli-sess-456');

        // Verify the key format: cli_session:{sessionId}:{agentId}
        expect(mockClient.setex).toHaveBeenCalledWith(
          'cli_session:session-123:wukong',
          7 * 24 * 60 * 60, // 7 days TTL
          'cli-sess-456',
        );
      });

      it('should not save if Redis is not available', async () => {
        (service as any).isConnected = false;
        (service as any).client = null;

        // Should not throw
        await expect(
          service.setCliSession('session-123', 'wukong', 'cli-sess-456'),
        ).resolves.not.toThrow();
      });
    });

    describe('getCliSession', () => {
      it('should retrieve CLI session ID with correct key format', async () => {
        const mockClient = {
          get: jest.fn().mockResolvedValue('cli-sess-456'),
          on: jest.fn(),
          quit: jest.fn().mockResolvedValue('OK'),
        };

        (service as any).client = mockClient;
        (service as any).isConnected = true;

        const result = await service.getCliSession('session-123', 'wukong');

        expect(result).toBe('cli-sess-456');
        expect(mockClient.get).toHaveBeenCalledWith('cli_session:session-123:wukong');
      });

      it('should return null if session not found', async () => {
        const mockClient = {
          get: jest.fn().mockResolvedValue(null),
          on: jest.fn(),
          quit: jest.fn().mockResolvedValue('OK'),
        };

        (service as any).client = mockClient;
        (service as any).isConnected = true;

        const result = await service.getCliSession('session-123', 'wukong');

        expect(result).toBeNull();
      });

      it('should return null if Redis is not available', async () => {
        (service as any).isConnected = false;
        (service as any).client = null;

        const result = await service.getCliSession('session-123', 'wukong');

        expect(result).toBeNull();
      });
    });

    describe('deleteCliSession', () => {
      it('should delete CLI session with correct key format', async () => {
        const mockClient = {
          del: jest.fn().mockResolvedValue(1),
          on: jest.fn(),
          quit: jest.fn().mockResolvedValue('OK'),
        };

        (service as any).client = mockClient;
        (service as any).isConnected = true;

        await service.deleteCliSession('session-123', 'wukong');

        expect(mockClient.del).toHaveBeenCalledWith('cli_session:session-123:wukong');
      });

      it('should not throw if Redis is not available', async () => {
        (service as any).isConnected = false;
        (service as any).client = null;

        await expect(
          service.deleteCliSession('session-123', 'wukong'),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('isAvailable', () => {
    it('should return true when connected', async () => {
      const mockClient = {
        quit: jest.fn().mockResolvedValue('OK'),
      };

      (service as any).isConnected = true;
      (service as any).client = mockClient;

      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when not connected', () => {
      (service as any).isConnected = false;
      (service as any).client = null;

      expect(service.isAvailable()).toBe(false);
    });
  });
});