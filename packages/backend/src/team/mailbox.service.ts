import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  MailboxMessage,
  MailboxPayload,
  MailboxMessageType,
} from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

/**
 * Message handler callback type
 */
export type MessageHandler = (message: MailboxMessage) => Promise<void> | void;

/**
 * Mailbox Service
 * Manages inter-agent communication via Redis Pub/Sub
 */
@Injectable()
export class MailboxService implements OnModuleDestroy {
  private readonly logger = new Logger(MailboxService.name);

  /** Redis service for persistence */
  private redisService: RedisService | null = null;

  /** Redis subscriber client for Pub/Sub */
  private subscriber: Redis | null = null;

  /** Message handlers by agent ID */
  private handlers: Map<string, MessageHandler> = new Map();

  /** Message queues by agent ID (for polling) */
  private queues: Map<string, MailboxMessage[]> = new Map();

  /** Subscribed channels */
  private subscribedChannels: Set<string> = new Set();

  constructor() {}

  /**
   * Set Redis service and initialize subscriber
   */
  async setRedisService(redisService: RedisService): Promise<void> {
    this.redisService = redisService;

    if (redisService.isAvailable()) {
      // Create a separate subscriber connection
      const config = (redisService as any).config;
      this.subscriber = new Redis({
        host: config?.host || 'localhost',
        port: config?.port || 6379,
        password: config?.password,
        db: config?.db || 0,
        keyPrefix: config?.keyPrefix || '',
      });

      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      this.subscriber.on('error', (err) => {
        this.logger.error(`Redis subscriber error: ${err.message}`);
      });

      this.logger.log('Mailbox Redis subscriber initialized');
    }
  }

  /**
   * Register a message handler for an agent
   */
  registerHandler(agentId: string, handler: MessageHandler): void {
    this.handlers.set(agentId, handler);
    this.logger.debug(`Registered handler for agent: ${agentId}`);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(agentId: string): void {
    this.handlers.delete(agentId);
    this.logger.debug(`Unregistered handler for agent: ${agentId}`);
  }

  /**
   * Subscribe an agent to receive messages
   */
  async subscribeAgent(teamId: string, agentId: string): Promise<void> {
    if (!this.subscriber) {
      this.logger.warn('Redis subscriber not available, using in-memory queue');
      return;
    }

    const channel = this.getChannel(teamId, agentId);
    if (!this.subscribedChannels.has(channel)) {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
      this.logger.debug(`Subscribed to channel: ${channel}`);
    }
  }

  /**
   * Unsubscribe an agent from receiving messages
   */
  async unsubscribeAgent(teamId: string, agentId: string): Promise<void> {
    if (!this.subscriber) return;

    const channel = this.getChannel(teamId, agentId);
    if (this.subscribedChannels.has(channel)) {
      await this.subscriber.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      this.logger.debug(`Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Send a message to a specific agent
   */
  async sendMessage(
    teamId: string,
    from: string,
    to: string,
    type: MailboxMessageType,
    payload: MailboxPayload,
  ): Promise<MailboxMessage> {
    const message: MailboxMessage = {
      id: uuidv4(),
      teamId,
      from,
      to,
      type,
      payload,
      timestamp: new Date(),
    };

    // Persist to Redis for durability
    await this.persistMessage(message);

    // Publish to channel
    await this.publishMessage(message);

    this.logger.debug(`Message sent: ${from} -> ${to} (${type})`);

    return message;
  }

  /**
   * Broadcast a message to all agents in a team
   */
  async broadcastMessage(
    teamId: string,
    from: string,
    type: MailboxMessageType,
    payload: MailboxPayload,
  ): Promise<MailboxMessage> {
    const message: MailboxMessage = {
      id: uuidv4(),
      teamId,
      from,
      to: 'broadcast',
      type,
      payload,
      timestamp: new Date(),
    };

    // Persist to Redis
    await this.persistMessage(message);

    // Publish to broadcast channel
    const channel = `team:${teamId}:broadcast`;
    if (this.subscriber && this.subscribedChannels.has(channel)) {
      await this.subscriber.publish(channel, JSON.stringify(message));
    }

    // Also add to all agent queues (for polling fallback)
    for (const [agentId] of this.handlers) {
      if (agentId !== from) {
        const agentQueue = this.queues.get(agentId) || [];
        agentQueue.push(message);
        this.queues.set(agentId, agentQueue);
      }
    }

    this.logger.debug(`Broadcast message from ${from} to team ${teamId}`);

    return message;
  }

  /**
   * Get pending messages for an agent (polling mode)
   */
  getPendingMessages(agentId: string): MailboxMessage[] {
    const messages = this.queues.get(agentId) || [];
    this.queues.set(agentId, []); // Clear queue after retrieval
    return messages;
  }

  /**
   * Check if agent has pending messages
   */
  hasPendingMessages(agentId: string): boolean {
    const queue = this.queues.get(agentId);
    return queue !== undefined && queue.length > 0;
  }

  /**
   * Get channel name for an agent
   */
  private getChannel(teamId: string, agentId: string): string {
    return `team:${teamId}:agent:${agentId}`;
  }

  /**
   * Handle incoming message from Redis subscription
   */
  private handleMessage(channel: string, messageStr: string): void {
    try {
      const message: MailboxMessage = JSON.parse(messageStr);

      // Extract agent ID from channel
      const parts = channel.split(':');
      const agentId = parts[parts.length - 1];

      // Find handler and call it
      const handler = this.handlers.get(agentId);
      if (handler) {
        const result = handler(message);
        if (result instanceof Promise) {
          result.catch((err: Error) => {
            this.logger.error(`Handler error for ${agentId}: ${err}`);
          });
        }
      } else {
        // No handler, add to queue for polling
        const queue = this.queues.get(agentId) || [];
        queue.push(message);
        this.queues.set(agentId, queue);
      }
    } catch (error) {
      this.logger.error(`Failed to handle message: ${error}`);
    }
  }

  /**
   * Persist message to Redis for durability
   */
  private async persistMessage(message: MailboxMessage): Promise<void> {
    if (!this.redisService?.isAvailable()) return;

    try {
      const key = `mailbox:${message.teamId}:${message.id}`;
      await this.redisService.set(
        key,
        JSON.stringify(message),
        24 * 60 * 60, // 24 hours TTL
      );
    } catch (error) {
      this.logger.error(`Failed to persist message: ${error}`);
    }
  }

  /**
   * Publish message to Redis channel
   */
  private async publishMessage(message: MailboxMessage): Promise<void> {
    if (!this.subscriber) {
      // Fallback to in-memory queue
      const queue = this.queues.get(message.to) || [];
      queue.push(message);
      this.queues.set(message.to, queue);
      return;
    }

    const channel = this.getChannel(message.teamId, message.to);
    await this.subscriber.publish(channel, JSON.stringify(message));
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      // Unsubscribe from all channels
      for (const channel of this.subscribedChannels) {
        await this.subscriber.unsubscribe(channel);
      }
      await this.subscriber.quit();
      this.logger.log('Mailbox Redis subscriber closed');
    }
  }

  /**
   * Clear all messages for a team
   */
  async clearTeamMessages(teamId: string): Promise<void> {
    // Clear in-memory queues
    for (const [agentId, queue] of this.queues) {
      this.queues.set(
        agentId,
        queue.filter(m => m.teamId !== teamId),
      );
    }

    // Redis messages will expire automatically due to TTL
    this.logger.debug(`Cleared messages for team ${teamId}`);
  }
}