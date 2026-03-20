import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Message, StreamChunk } from '@monkagents/shared';

@Injectable()
export class WebSocketService implements OnModuleInit {
  private readonly logger = new Logger(WebSocketService.name);
  private clients: Map<string, Socket> = new Map();
  private clientSessions: Map<string, Set<string>> = new Map();
  private server: Server;

  onModuleInit() {
    // Server will be set by the gateway after initialization
  }

  setServer(server: Server) {
    this.server = server;
  }

  addClient(client: Socket): void {
    this.clients.set(client.id, client);
    this.clientSessions.set(client.id, new Set());
  }

  removeClient(client: Socket): void {
    this.clients.delete(client.id);
    this.clientSessions.delete(client.id);
  }

  joinSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.add(sessionId);
    }
  }

  leaveSession(clientId: string, sessionId: string): void {
    const sessions = this.clientSessions.get(clientId);
    if (sessions) {
      sessions.delete(sessionId);
    }
  }

  handleUserMessage(clientId: string, sessionId: string, content: string): void {
    // This will be connected to the task/agent system later
    this.logger.debug(`User message from ${clientId} in ${sessionId}: ${content}`);

    // For now, echo back a response
    this.emitToSession(sessionId, 'message', {
      id: `msg-${Date.now()}`,
      sessionId,
      sender: 'system',
      senderId: 'system',
      senderName: '系统',
      type: 'text',
      content: `收到消息: ${content}`,
      createdAt: new Date(),
    } as Message);
  }

  cancelTask(taskId: string): void {
    // This will be connected to the task management system later
    this.logger.debug(`Cancel task requested: ${taskId}`);
  }

  // Emit to all clients in a session
  emitToSession(sessionId: string, event: string, data: unknown): void {
    if (this.server) {
      this.server.to(`session:${sessionId}`).emit(event, data);
    }
  }

  // Emit to all connected clients
  emitToAll(event: string, data: unknown): void {
    if (this.server) {
      this.server.emit(event, data);
    }
  }

  // Emit agent status update
  emitAgentStatus(agentId: string, status: string): void {
    if (this.server) {
      this.server.emit('agent_status', { agentId, status });
    }
  }

  // Emit task status update
  emitTaskStatus(taskId: string, status: string): void {
    if (this.server) {
      this.server.emit('task_status', { taskId, status });
    }
  }

  // Emit stream chunk
  emitStreamChunk(chunk: StreamChunk): void {
    if (this.server) {
      this.server.emit('stream', chunk);
    }
  }

  // Emit error
  emitError(code: string, message: string, sessionId?: string): void {
    const errorData = { code, message };
    if (sessionId && this.server) {
      this.server.to(`session:${sessionId}`).emit('error', errorData);
    } else if (this.server) {
      this.server.emit('error', errorData);
    }
  }

  // Broadcast message to session
  broadcastMessage(sessionId: string, message: Message): void {
    this.emitToSession(sessionId, 'message', message);
  }
}