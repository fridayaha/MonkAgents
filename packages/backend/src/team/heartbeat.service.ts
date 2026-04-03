import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  AgentHeartbeat,
  HeartbeatConfig,
  HeartbeatStatus,
  HeartbeatEvent,
  AgentTimeoutEvent,
  DEFAULT_HEARTBEAT_CONFIG,
} from './interfaces';

/**
 * Heartbeat callback type for timeout notifications
 */
export type TimeoutCallback = (heartbeat: AgentHeartbeat) => Promise<void> | void;

/**
 * HeartbeatService
 * Manages agent heartbeat monitoring and timeout detection
 */
@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);

  /** Redis service for persistence */
  private redisService: RedisService | null = null;

  /** Heartbeat storage: agentId -> heartbeat */
  private heartbeats: Map<string, AgentHeartbeat> = new Map();

  /** Heartbeats by team: teamId -> Set<agentId> */
  private heartbeatsByTeam: Map<string, Set<string>> = new Map();

  /** Timeout check timer */
  private checkTimer: NodeJS.Timeout | null = null;

  /** Timeout callbacks */
  private timeoutCallbacks: TimeoutCallback[] = [];

  /** Configuration */
  private config: HeartbeatConfig = { ...DEFAULT_HEARTBEAT_CONFIG };

  /** WebSocket service for broadcasting */
  private wsService: any = null;

  constructor() {}

  /**
   * Set Redis service
   */
  setRedisService(redisService: RedisService): void {
    this.redisService = redisService;
  }

  /**
   * Set WebSocket service for broadcasting
   */
  setWebSocketService(wsService: any): void {
    this.wsService = wsService;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log(`Heartbeat config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * Register timeout callback
   */
  onTimeout(callback: TimeoutCallback): void {
    this.timeoutCallbacks.push(callback);
  }

  /**
   * Module init - start timeout check timer
   */
  onModuleInit(): void {
    this.startTimeoutCheck();
  }

  /**
   * Module destroy - stop timer
   */
  onModuleDestroy(): void {
    this.stopTimeoutCheck();
  }

  /**
   * Send heartbeat from an agent
   */
  async sendHeartbeat(heartbeat: AgentHeartbeat): Promise<void> {
    const { agentId, teamId } = heartbeat;

    // Update timestamp
    heartbeat.timestamp = new Date();

    // Store in memory
    this.heartbeats.set(agentId, heartbeat);

    // Add to team index
    let teamAgents = this.heartbeatsByTeam.get(teamId);
    if (!teamAgents) {
      teamAgents = new Set();
      this.heartbeatsByTeam.set(teamId, teamAgents);
    }
    teamAgents.add(agentId);

    // Persist to Redis
    if (this.redisService?.isAvailable()) {
      const key = this.getHeartbeatKey(teamId, agentId);
      const ttlSeconds = Math.ceil(this.config.timeoutMs / 1000);
      await this.redisService.set(key, JSON.stringify(heartbeat), ttlSeconds);
    }

    // Broadcast heartbeat event
    this.broadcastHeartbeat(heartbeat);

    this.logger.debug(`Heartbeat received: ${agentId} (${heartbeat.status})`);
  }

  /**
   * Get heartbeat for an agent
   */
  getHeartbeat(agentId: string): AgentHeartbeat | undefined {
    return this.heartbeats.get(agentId);
  }

  /**
   * Get all heartbeats for a team
   */
  getTeamHeartbeats(teamId: string): AgentHeartbeat[] {
    const agentIds = this.heartbeatsByTeam.get(teamId);
    if (!agentIds) return [];

    return Array.from(agentIds)
      .map(id => this.heartbeats.get(id))
      .filter((h): h is AgentHeartbeat => h !== undefined);
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): HeartbeatStatus {
    const heartbeat = this.heartbeats.get(agentId);
    if (!heartbeat) return 'offline';

    const elapsed = Date.now() - new Date(heartbeat.timestamp).getTime();
    if (elapsed > this.config.timeoutMs) {
      return 'offline';
    }

    return heartbeat.status;
  }

  /**
   * Check for timed out agents
   */
  async checkTimeouts(): Promise<AgentHeartbeat[]> {
    const now = Date.now();
    const timedOut: AgentHeartbeat[] = [];

    for (const [agentId, heartbeat] of this.heartbeats) {
      const elapsed = now - new Date(heartbeat.timestamp).getTime();
      if (elapsed > this.config.timeoutMs) {
        timedOut.push(heartbeat);
        this.logger.warn(
          `Agent ${agentId} timed out (last heartbeat: ${elapsed}ms ago)`
        );
      }
    }

    // Call timeout callbacks
    for (const heartbeat of timedOut) {
      await this.handleTimeout(heartbeat);
    }

    return timedOut;
  }

  /**
   * Handle agent timeout
   */
  private async handleTimeout(heartbeat: AgentHeartbeat): Promise<void> {
    // Broadcast timeout event
    this.broadcastTimeout(heartbeat);

    // Call registered callbacks
    for (const callback of this.timeoutCallbacks) {
      try {
        await callback(heartbeat);
      } catch (error) {
        this.logger.error(`Timeout callback error: ${error}`);
      }
    }
  }

  /**
   * Clear heartbeat for an agent
   */
  clearHeartbeat(agentId: string, teamId: string): void {
    this.heartbeats.delete(agentId);

    const teamAgents = this.heartbeatsByTeam.get(teamId);
    if (teamAgents) {
      teamAgents.delete(agentId);
      if (teamAgents.size === 0) {
        this.heartbeatsByTeam.delete(teamId);
      }
    }

    // Clear from Redis
    if (this.redisService?.isAvailable()) {
      const key = this.getHeartbeatKey(teamId, agentId);
      this.redisService.del(key).catch(err => {
        this.logger.error(`Failed to clear heartbeat from Redis: ${err}`);
      });
    }
  }

  /**
   * Clear all heartbeats for a team
   */
  clearTeamHeartbeats(teamId: string): void {
    const agentIds = this.heartbeatsByTeam.get(teamId);
    if (!agentIds) return;

    for (const agentId of agentIds) {
      this.heartbeats.delete(agentId);
    }

    this.heartbeatsByTeam.delete(teamId);

    this.logger.debug(`Cleared heartbeats for team ${teamId}`);
  }

  /**
   * Get heartbeat key for Redis
   */
  private getHeartbeatKey(teamId: string, agentId: string): string {
    return `heartbeat:${teamId}:${agentId}`;
  }

  /**
   * Start timeout check timer
   */
  private startTimeoutCheck(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkTimeouts().catch(err => {
        this.logger.error(`Timeout check error: ${err}`);
      });
    }, this.config.checkIntervalMs);

    this.logger.log(
      `Heartbeat timeout check started (interval: ${this.config.checkIntervalMs}ms, timeout: ${this.config.timeoutMs}ms)`
    );
  }

  /**
   * Stop timeout check timer
   */
  private stopTimeoutCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.logger.log('Heartbeat timeout check stopped');
    }
  }

  /**
   * Broadcast heartbeat event via WebSocket
   */
  private broadcastHeartbeat(heartbeat: AgentHeartbeat): void {
    if (!this.wsService) return;

    const event: HeartbeatEvent = {
      type: 'heartbeat',
      teamId: heartbeat.teamId,
      agentId: heartbeat.agentId,
      status: heartbeat.status,
      timestamp: heartbeat.timestamp,
    };

    this.wsService.emitToSession(heartbeat.teamId, 'heartbeat', event);
  }

  /**
   * Broadcast timeout event via WebSocket
   */
  private broadcastTimeout(heartbeat: AgentHeartbeat): void {
    if (!this.wsService) return;

    const event: AgentTimeoutEvent = {
      type: 'agent_timeout',
      teamId: heartbeat.teamId,
      agentId: heartbeat.agentId,
      lastHeartbeat: heartbeat.timestamp,
      currentTaskId: heartbeat.currentTaskId,
      timestamp: new Date(),
    };

    this.wsService.emitToSession(heartbeat.teamId, 'agent_timeout', event);
  }

  /**
   * Get heartbeat statistics for a team
   */
  getTeamStats(teamId: string): {
    total: number;
    idle: number;
    working: number;
    offline: number;
    error: number;
  } {
    const heartbeats = this.getTeamHeartbeats(teamId);
    const now = Date.now();

    let idle = 0, working = 0, offline = 0, error = 0;

    for (const h of heartbeats) {
      const elapsed = now - new Date(h.timestamp).getTime();
      if (elapsed > this.config.timeoutMs) {
        offline++;
      } else {
        switch (h.status) {
          case 'idle': idle++; break;
          case 'working': working++; break;
          case 'error': error++; break;
          default: offline++;
        }
      }
    }

    return {
      total: heartbeats.length,
      idle,
      working,
      offline,
      error,
    };
  }
}