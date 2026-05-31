"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Users, X, Code, CheckCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { fetchRoles, createCollabSession } from "../lib/collab-api";
import { useCollabSocket } from "../lib/use-collab-socket";
import type { AgentRoleConfig, AgentRole, CollabSession, CollabMessage } from "@deepspace/shared-types";
import { AgentSetupView } from "./collab/AgentSetupView";
import { AgentSessionView } from "./collab/AgentSessionView";

interface AgentStreamState {
  agentRole: string;
  agentName: string;
  content: string;
  done: boolean;
}

export function CollabPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [roles, setRoles] = useState<AgentRoleConfig[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<AgentRole[]>([]);
  const [task, setTask] = useState("");
  const [session, setSession] = useState<CollabSession | null>(null);
  const [wsMessages, setWsMessages] = useState<CollabMessage[]>([]);
  const [wsStatus, setWsStatus] = useState<string>("");
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [agentStreams, setAgentStreams] = useState<Map<string, AgentStreamState>>(new Map());
  const [execError, setExecError] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRoles = useCallback(async () => {
    const r = await fetchRoles();
    setRoles(r);
  }, []);

  useEffect(() => {
    if (open) loadRoles();
  }, [open, loadRoles]);

  const handleWsMessage = useCallback((msg: CollabMessage) => {
    setWsMessages((prev) => [...prev, msg]);
  }, []);

  const handleSessionUpdate = useCallback(
    (update: { sessionId: string; status: string }) => {
      setWsStatus(update.status);
      setSession((prev) => (prev ? { ...prev, status: update.status as CollabSession["status"] } : prev));
    },
    [],
  );

  const handleAgentTyping = useCallback(
    (data: { sessionId: string; agent: string }) => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      setTypingAgent(data.agent);
      typingTimerRef.current = setTimeout(() => setTypingAgent(null), 2000);
    },
    [],
  );

  const handleAgentStopTyping = useCallback(
    (data: { sessionId: string; agent: string }) => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingAgent === data.agent) setTypingAgent(null);
    },
    [typingAgent],
  );

  const handleSessionState = useCallback((s: CollabSession) => {
    setSession(s);
    setWsMessages(s.messages);
  }, []);

  const handleAgentStart = useCallback(
    (evt: { agentRole: string; agentName: string }) => {
      setExecuting(true);
      setExecError(null);
      setAgentStreams((prev) => {
        const next = new Map(prev);
        next.set(evt.agentRole, { agentRole: evt.agentRole, agentName: evt.agentName, content: "", done: false });
        return next;
      });
    },
    [],
  );

  const handleAgentChunk = useCallback(
    (evt: { agentRole: string; content: string }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(evt.agentRole);
        if (existing) next.set(evt.agentRole, { ...existing, content: existing.content + evt.content });
        return next;
      });
    },
    [],
  );

  const handleAgentDone = useCallback(
    (evt: { agentRole: string }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(evt.agentRole);
        if (existing) next.set(evt.agentRole, { ...existing, done: true });
        return next;
      });
    },
    [],
  );

  const handleCollabDone = useCallback(() => setExecuting(false), []);

  const handleCollabError = useCallback((evt: { message: string }) => {
    setExecuting(false);
    setExecError(evt.message);
    setWsMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: "orchestrator", to: "all", content: `Error: ${evt.message}`, timestamp: Date.now(), type: "response" as const },
    ]);
  }, []);

  const { connected, onlineCount, executeSession } = useCollabSocket({
    sessionId: session?.id ?? null,
    onMessage: handleWsMessage,
    onSessionState: handleSessionState,
    onSessionUpdate: handleSessionUpdate,
    onAgentTyping: handleAgentTyping,
    onAgentStopTyping: handleAgentStopTyping,
    onAgentStart: handleAgentStart,
    onAgentChunk: handleAgentChunk,
    onAgentDone: handleAgentDone,
    onCollabDone: handleCollabDone,
    onCollabError: handleCollabError,
  });

  const toggleRole = (role: AgentRole) => {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const startCollab = async () => {
    if (!task.trim() || selectedRoles.length === 0) return;
    setLoading(true);
    try {
      const s = await createCollabSession(task, selectedRoles);
      if (s) {
        setSession(s);
        setWsMessages(s.messages);
      }
    } catch {
      setExecError("Failed to create session. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetPanel = () => {
    setSession(null);
    setTask("");
    setSelectedRoles([]);
    setWsMessages([]);
    setWsStatus("");
    setExecError(null);
    setAgentStreams(new Map());
  };

  const allMessages = session
    ? [...session.messages, ...wsMessages.filter((wm) => !session.messages.some((sm) => sm.id === wm.id))]
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[90vw] max-w-4xl h-[80vh] bg-[#0d0d14] border border-zinc-800/70 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
          <Users className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-300">Multi-Agent Collaboration</h3>
          {session && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {wsStatus || session.status}
            </span>
          )}
          {session && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-600">
              {connected ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
              {onlineCount > 0 && <span className="text-zinc-500">{onlineCount} online</span>}
            </span>
          )}
          <button onClick={onClose} className="ml-auto p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!session ? (
          <AgentSetupView
            roles={roles}
            selectedRoles={selectedRoles}
            task={task}
            loading={loading}
            onToggleRole={toggleRole}
            onTaskChange={setTask}
            onStart={startCollab}
          />
        ) : (
          <AgentSessionView
            session={session}
            allMessages={allMessages}
            agentStreams={agentStreams}
            typingAgent={typingAgent}
            executing={executing}
            execError={execError}
            connected={connected}
            onlineCount={onlineCount}
            onExecute={executeSession}
            onReset={resetPanel}
          />
        )}
      </div>
    </div>
  );
}