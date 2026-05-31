import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import type { CollabMessage } from '@deepspace/shared-types';

interface JoinSessionPayload {
  sessionId: string;
}

interface SendMessagePayload {
  sessionId: string;
  from: string;
  to: string;
  content: string;
  type: CollabMessage['type'];
}

interface TypingPayload {
  sessionId: string;
  agent: string;
}

@WebSocketGateway({
  namespace: '/collab',
  cors: { origin: '*', credentials: true },
})
@UseGuards(WsJwtGuard)
export class CollabGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CollabGateway.name);
  private activeUsers = new Map<string, Set<string>>();

  constructor(private readonly orchestrator: OrchestratorService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    for (const [sessionId, users] of this.activeUsers.entries()) {
      users.delete(client.id);
      if (users.size === 0) {
        this.activeUsers.delete(sessionId);
      }
      this.server.to(sessionId).emit('online-users', {
        sessionId,
        count: users.size,
      });
    }
  }

  @SubscribeMessage('join-session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSessionPayload,
  ) {
    const { sessionId } = payload;
    const userId = (client as any).user?.sub || 'anonymous';

    // Verify session exists
    const session = this.orchestrator.getSession(sessionId, userId);
    if (!session) {
      client.emit('error', {
        message: `Session ${sessionId} not found`,
      });
      return;
    }

    await client.join(sessionId);

    if (!this.activeUsers.has(sessionId)) {
      this.activeUsers.set(sessionId, new Set());
    }
    this.activeUsers.get(sessionId)!.add(client.id);

    this.logger.log(`User ${userId} joined collab session ${sessionId}`);

    // Send current session state to the joining client
    client.emit('session-state', session);

    // Broadcast online users
    this.server.to(sessionId).emit('online-users', {
      sessionId,
      count: this.activeUsers.get(sessionId)!.size,
    });
  }

  @SubscribeMessage('leave-session')
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinSessionPayload,
  ) {
    const { sessionId } = payload;
    await client.leave(sessionId);

    const users = this.activeUsers.get(sessionId);
    if (users) {
      users.delete(client.id);
      if (users.size === 0) this.activeUsers.delete(sessionId);
    }

    this.server.to(sessionId).emit('online-users', {
      sessionId,
      count: this.activeUsers.get(sessionId)?.size || 0,
    });
  }

  @SubscribeMessage('send-message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SendMessagePayload,
  ) {
    const userId = (client as any).user?.sub || 'anonymous';
    const { sessionId, from, to, content, type } = payload;

    const msg = this.orchestrator.addMessage(
      sessionId,
      userId,
      from as CollabMessage['from'],
      to as CollabMessage['to'],
      content,
      type,
    );

    if (!msg) {
      client.emit('error', { message: 'Failed to add message' });
      return;
    }

    this.server.to(sessionId).emit('agent-message', msg);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const { sessionId, agent } = payload;
    client.to(sessionId).emit('agent-typing', {
      sessionId,
      agent,
      clientId: client.id,
    });
  }

  @SubscribeMessage('stop-typing')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const { sessionId, agent } = payload;
    client.to(sessionId).emit('agent-stop-typing', {
      sessionId,
      agent,
    });
  }

  @SubscribeMessage('execute-session')
  async handleExecuteSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string; modelId?: string },
  ) {
    const userId = (client as any).user?.sub || 'anonymous';
    const { sessionId, modelId } = payload;

    const session = this.orchestrator.getSession(sessionId, userId);
    if (!session) {
      client.emit('collab-error', {
        sessionId,
        message: `Session ${sessionId} not found`,
      });
      return;
    }

    this.logger.log(
      `Executing collab session ${sessionId} with agents: ${session.agents.join(', ')}`,
    );

    try {
      // Notify clients that execution is starting
      this.server.to(sessionId).emit('session-updated', {
        sessionId,
        status: 'executing',
      });

      for await (const event of this.orchestrator.runSessionStream(
        sessionId, userId, modelId,
      )) {
        if (event.type === 'collab_agent_start') {
          this.server.to(sessionId).emit('collab-agent-start', event);
        } else if (event.type === 'collab_agent_chunk') {
          this.server.to(sessionId).emit('collab-agent-chunk', event);
        } else if (event.type === 'collab_agent_done') {
          this.server.to(sessionId).emit('collab-agent-done', event);
        } else if (event.type === 'collab_done') {
          this.server.to(sessionId).emit('collab-done', event);
          this.server.to(sessionId).emit('session-updated', {
            sessionId,
            status: 'complete',
          });
          const updatedSession = this.orchestrator.getSession(sessionId, userId);
          if (updatedSession) {
            this.server.to(sessionId).emit('session-state', updatedSession);
          }
        } else if (event.type === 'collab_error') {
          this.server.to(sessionId).emit('collab-error', event);
        }
      }
    } catch (err: any) {
      this.logger.error(`Session execution failed: ${err.message}`);
      this.server.to(sessionId).emit('collab-error', {
        sessionId,
        message: `Execution failed: ${err.message}`,
      });
    }
  }

  // Called by OrchestratorService (or other services) to broadcast agent responses
  broadcastAgentResponse(
    sessionId: string,
    message: CollabMessage,
  ) {
    this.server.to(sessionId).emit('agent-message', message);
  }

  broadcastSessionUpdate(sessionId: string, status: string) {
    this.server.to(sessionId).emit('session-updated', { sessionId, status });
  }
}
