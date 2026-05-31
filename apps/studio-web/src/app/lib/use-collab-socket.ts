"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { CollabSession, CollabMessage } from "@deepspace/shared-types";
import { API_URL } from './constants';

interface CollabAgentStartEvent {
  type: "collab_agent_start";
  sessionId: string;
  agentRole: string;
  agentName: string;
}

interface CollabAgentChunkEvent {
  type: "collab_agent_chunk";
  sessionId: string;
  agentRole: string;
  content: string;
}

interface CollabAgentDoneEvent {
  type: "collab_agent_done";
  sessionId: string;
  agentRole: string;
  fullContent: string;
}

interface CollabDoneEvent {
  type: "collab_done";
  sessionId: string;
  summary: string;
}

interface CollabErrorEvent {
  type: "collab_error";
  sessionId: string;
  message: string;
}

type CollabStreamEvent =
  | CollabAgentStartEvent
  | CollabAgentChunkEvent
  | CollabAgentDoneEvent
  | CollabDoneEvent
  | CollabErrorEvent;

interface UseCollabSocketOptions {
  sessionId: string | null;
  onMessage?: (msg: CollabMessage) => void;
  onSessionState?: (session: CollabSession) => void;
  onSessionUpdate?: (update: { sessionId: string; status: string }) => void;
  onOnlineUsers?: (data: { sessionId: string; count: number }) => void;
  onAgentTyping?: (data: { sessionId: string; agent: string }) => void;
  onAgentStopTyping?: (data: { sessionId: string; agent: string }) => void;
  onAgentStart?: (evt: CollabAgentStartEvent) => void;
  onAgentChunk?: (evt: CollabAgentChunkEvent) => void;
  onAgentDone?: (evt: CollabAgentDoneEvent) => void;
  onCollabDone?: (evt: CollabDoneEvent) => void;
  onCollabError?: (evt: CollabErrorEvent) => void;
}

export function useCollabSocket({
  sessionId,
  onMessage,
  onSessionState,
  onSessionUpdate,
  onOnlineUsers,
  onAgentTyping,
  onAgentStopTyping,
  onAgentStart,
  onAgentChunk,
  onAgentDone,
  onCollabDone,
  onCollabError,
}: UseCollabSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("ds_token") : null;

    const socket = io(`${API_URL.replace(/^http/, 'ws')}/collab`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-session", { sessionId });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("agent-message", (msg: CollabMessage) => {
      onMessage?.(msg);
    });

    socket.on("session-updated", (data: { sessionId: string; status: string }) => {
      onSessionUpdate?.(data);
    });

    socket.on("online-users", (data: { sessionId: string; count: number }) => {
      setOnlineCount(data.count);
      onOnlineUsers?.(data);
    });

    socket.on("agent-typing", (data: { sessionId: string; agent: string }) => {
      onAgentTyping?.(data);
    });

    socket.on("agent-stop-typing", (data: { sessionId: string; agent: string }) => {
      onAgentStopTyping?.(data);
    });

    socket.on("session-state", (session: CollabSession) => {
      onSessionState?.(session);
    });

    // Collab streaming events
    socket.on("collab-agent-start", (evt: CollabAgentStartEvent) => {
      onAgentStart?.(evt);
    });

    socket.on("collab-agent-chunk", (evt: CollabAgentChunkEvent) => {
      onAgentChunk?.(evt);
    });

    socket.on("collab-agent-done", (evt: CollabAgentDoneEvent) => {
      onAgentDone?.(evt);
    });

    socket.on("collab-done", (evt: CollabDoneEvent) => {
      onCollabDone?.(evt);
    });

    socket.on("collab-error", (evt: CollabErrorEvent) => {
      onCollabError?.(evt);
    });

    return () => {
      socket.emit("leave-session", { sessionId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    sessionId, onMessage, onSessionState, onSessionUpdate,
    onOnlineUsers, onAgentTyping, onAgentStopTyping,
    onAgentStart, onAgentChunk, onAgentDone, onCollabDone, onCollabError,
  ]);

  const sendMessage = useCallback(
    (from: string, to: string, content: string, type: CollabMessage["type"]) => {
      if (!socketRef.current || !sessionId) return;
      socketRef.current.emit("send-message", {
        sessionId,
        from,
        to,
        content,
        type,
      });
    },
    [sessionId],
  );

  const sendTyping = useCallback(
    (agent: string) => {
      if (!socketRef.current || !sessionId) return;
      socketRef.current.emit("typing", { sessionId, agent });
    },
    [sessionId],
  );

  const executeSession = useCallback(
    (modelId?: string) => {
      if (!socketRef.current || !sessionId) return;
      socketRef.current.emit("execute-session", { sessionId, modelId });
    },
    [sessionId],
  );

  return { connected, onlineCount, sendMessage, sendTyping, executeSession };
}
