import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../config/config.service';
import { Message } from '@monkagents/shared';

/**
 * Redis Service - Handles conversation history and caching
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const config = this.configService.getRedisConfig();

    try {
      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        keyPrefix: config.keyPrefix,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.error('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 1000, 5000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Redis connected to ${config.host}:${config.port}`);
      });

      this.client.on('error', (err) => {
        this.logger.error(`Redis error: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

    } catch (error) {
      this.logger.error(`Failed to initialize Redis: ${error}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get conversation history key for a session
   */
  private getSessionHistoryKey(sessionId: string): string {
    return `session:${sessionId}:history`;
  }

  /**
   * Add a message to session history
   */
  async addMessageToHistory(sessionId: string, message: Message): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      this.logger.debug('Redis not available, skipping message history');
      return;
    }

    const key = this.getSessionHistoryKey(sessionId);
    const messageJson = JSON.stringify(message);

    try {
      // Add to list (RPUSH to append at the end)
      await this.client.rpush(key, messageJson);

      // Set expiration to 7 days
      await this.client.expire(key, 7 * 24 * 60 * 60);

      this.logger.debug(`Message added to history for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to add message to history: ${error}`);
    }
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(sessionId: string, limit: number = 100): Promise<Message[]> {
    if (!this.isAvailable() || !this.client) {
      this.logger.debug('Redis not available, returning empty history');
      return [];
    }

    const key = this.getSessionHistoryKey(sessionId);

    try {
      // Get the last N messages
      const messages = await this.client.lrange(key, -limit, -1);

      return messages.map(msg => {
        try {
          return JSON.parse(msg) as Message;
        } catch {
          return null;
        }
      }).filter((msg): msg is Message => msg !== null);
    } catch (error) {
      this.logger.error(`Failed to get session history: ${error}`);
      return [];
    }
  }

  /**
   * Get all messages from session history
   */
  async getAllSessionHistory(sessionId: string): Promise<Message[]> {
    if (!this.isAvailable() || !this.client) {
      return [];
    }

    const key = this.getSessionHistoryKey(sessionId);

    try {
      const messages = await this.client.lrange(key, 0, -1);

      return messages.map(msg => {
        try {
          return JSON.parse(msg) as Message;
        } catch {
          return null;
        }
      }).filter((msg): msg is Message => msg !== null);
    } catch (error) {
      this.logger.error(`Failed to get all session history: ${error}`);
      return [];
    }
  }

  /**
   * Clear session history
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      return;
    }

    const key = this.getSessionHistoryKey(sessionId);

    try {
      await this.client.del(key);
      this.logger.log(`Session history cleared for ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to clear session history: ${error}`);
    }
  }

  /**
   * Get session history count
   */
  async getSessionHistoryCount(sessionId: string): Promise<number> {
    if (!this.isAvailable() || !this.client) {
      return 0;
    }

    const key = this.getSessionHistoryKey(sessionId);

    try {
      return await this.client.llen(key);
    } catch (error) {
      this.logger.error(`Failed to get history count: ${error}`);
      return 0;
    }
  }

  /**
   * Set a cache value
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      return;
    }

    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Failed to set cache: ${error}`);
    }
  }

  /**
   * Get a cache value
   */
  async get(key: string): Promise<string | null> {
    if (!this.isAvailable() || !this.client) {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Failed to get cache: ${error}`);
      return null;
    }
  }

  /**
   * Delete a cache value
   */
  async del(key: string): Promise<void> {
    if (!this.isAvailable() || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete cache: ${error}`);
    }
  }
}