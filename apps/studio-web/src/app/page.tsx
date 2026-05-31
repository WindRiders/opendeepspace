"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Menu, Trash2, MessageSquare, Code, FolderSearch, FileText, Lightbulb, FolderOpen, History, Users, Share2, Store, Brain, Cpu, Bot,
} from "lucide-react";
import { useChat } from "./hooks/useChat";
import { useAuth } from "./hooks/useAuth";
import { Sidebar } from "./components/Sidebar";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { LoginScreen } from "./components/LoginScreen";
import { UserMenu } from "./components/UserMenu";
import { SandboxExplorer } from "./components/SandboxExplorer";
import { ReplayPlayer } from "./components/ReplayPlayer";
import { CollabPanel } from "./components/CollabPanel";
import { ShareDialog } from "./components/ShareDialog";
import { MemoryPanel } from "./components/MemoryPanel";
import { ModelStatus } from "./components/ModelStatus";
import { AutonomousPanel } from "./components/AutonomousPanel";
import { useModelStatus } from "./hooks/useModelStatus";
import { useAutonomous } from "./hooks/useAutonomous";

const QUICK_PROMPTS = [
  { icon: <Code className="w-4 h-4" />, label: "写一段 Python 代码", prompt: "帮我用 Python 写一个快速排序算法，并保存到 quicksort.py" },
  { icon: <FolderSearch className="w-4 h-4" />, label: "浏览沙盒文件", prompt: "列出沙盒中现有的所有文件" },
  { icon: <FileText className="w-4 h-4" />, label: "创建 README", prompt: "帮我写一个专业的 README.md 文件，项目名叫 DeepSpace" },
  { icon: <Lightbulb className="w-4 h-4" />, label: "你能做什么？", prompt: "你有哪些能力？请详细介绍你能帮我做什么" },
];

export default function Home() {
  const { isAuthenticated, loading: authLoading, error: authError, user, token, login, register, updateProfile, logout, clearError } = useAuth();
  const {
    messages, input, setInput, dna, setDna,
    isLoading, loadingStartTime, streamingStatus,
    engineStatus, sessionId, selectedModelId, setSelectedModelId, availableModels,
    doSend, sendMessage, clearChat, newChat,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [modelStatusOpen, setModelStatusOpen] = useState(false);
  const [autonomousOpen, setAutonomousOpen] = useState(false);
  const { providers } = useModelStatus(token);
  const autonomous = useAutonomous(token);
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showQuickPrompts = messages.length <= 1 && !isLoading;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#08080c] text-zinc-500 text-sm">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} onRegister={register} error={authError} loading={authLoading} onClearError={clearError} />;
  }

  return (
    <div className="flex h-screen bg-[#08080c] text-zinc-100 font-sans overflow-hidden">
      <Sidebar
        dna={dna}
        onDnaChange={setDna}
        engineStatus={engineStatus}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentSessionId={sessionId}
        onNewChat={newChat}
        availableModels={availableModels}
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
      />

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800/50 flex items-center px-4 lg:px-6 bg-[#0a0a10]/80 backdrop-blur-sm shrink-0 gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className={`lg:hidden text-zinc-400 hover:text-zinc-200 p-1 ${sidebarOpen ? "hidden" : ""}`}
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-semibold text-zinc-300">Interaction Sandbox</h2>
          <span className="ml-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/10 to-green-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20 hidden sm:inline-block">
            Phase 2: Evolution
          </span>
          <button
            onClick={() => setSandboxOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="浏览沙盒文件"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">沙盒文件</span>
          </button>
          <button
            onClick={() => setReplayOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="执行回放"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">回放</span>
          </button>
          <button
            onClick={() => setCollabOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="多Agent协作"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">协作</span>
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="分享"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">分享</span>
          </button>
          <button
            onClick={() => router.push("/marketplace")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-purple-300 hover:bg-purple-950/30 transition-colors"
            title="Agent Market"
          >
            <Store className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">市场</span>
          </button>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="清空对话并重置记忆"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">重置对话</span>
          </button>
          <button
            onClick={() => setMemoryOpen(!memoryOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${memoryOpen ? 'text-purple-400 bg-purple-950/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            title="记忆搜索"
          >
            <Brain className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">记忆</span>
          </button>
          <button
            onClick={() => setModelStatusOpen(!modelStatusOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${modelStatusOpen ? 'text-blue-400 bg-blue-950/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            title="模型状态"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">模型</span>
          </button>
          <button
            onClick={() => setAutonomousOpen(!autonomousOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${autonomousOpen ? 'text-green-400 bg-green-950/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
            title="自主学习"
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">自主</span>
          </button>
          {user && (
            <UserMenu
              user={user}
              onLogout={logout}
              onUpdateProfile={updateProfile}
              error={authError}
              onClearError={clearError}
            />
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} msg={msg} />
          ))}

          {isLoading && <LoadingIndicator startTime={loadingStartTime} statusText={streamingStatus} />}

          {showQuickPrompts && (
            <div className="max-w-4xl pt-4">
              <p className="text-xs text-zinc-600 mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                试试这些：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => doSend(qp.prompt)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/40 border border-zinc-800/40 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 hover:border-purple-500/20 transition-all text-left group"
                  >
                    <span className="text-purple-400/60 group-hover:text-purple-400 transition-colors">
                      {qp.icon}
                    </span>
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={sendMessage}
          isLoading={isLoading}
        />
      </div>

      <SandboxExplorer open={sandboxOpen} onClose={() => setSandboxOpen(false)} />
      <ReplayPlayer open={replayOpen} onClose={() => setReplayOpen(false)} sessionId={sessionId} />
      <CollabPanel open={collabOpen} onClose={() => setCollabOpen(false)} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} dna={dna} />
      {memoryOpen && (
        <div className="w-80 border-l border-zinc-800/50 bg-[#0a0a10] overflow-hidden">
          <MemoryPanel token={token} />
        </div>
      )}
      {modelStatusOpen && (
        <div className="w-72 border-l border-zinc-800/50 bg-[#0a0a10] overflow-hidden">
          <ModelStatus providers={providers} />
        </div>
      )}
      {autonomousOpen && (
        <div className="w-72 border-l border-zinc-800/50 bg-[#0a0a10] overflow-hidden">
          <AutonomousPanel
            isIdle={autonomous.isIdle}
            pendingTasks={autonomous.pendingTasks}
            activeTask={autonomous.activeTask}
            dailyCost={autonomous.dailyCost}
            dailyBudget={autonomous.dailyBudget}
          />
        </div>
      )}
    </div>
  );
}
