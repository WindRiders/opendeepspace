"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { streamInteract } from "../lib/sse-client";
import { API_URL } from "../lib/constants";
import type { Message, ToolCall, ExecutionStep, ExecutionStepTool } from "../lib/types";
import type { SSEEvent, ModelInfo, EngineStatus } from "@deepspace/shared-types";

const WELCOME_MESSAGE: Message = {
  role: "agent",
  content:
    "你好！我是 DeepSpace 网络中的一个智能实体。我拥有文件读写和浏览能力，可以为你创建代码、文档或任何数字内容。\n\n我的所有文件操作都在安全沙盒中执行。请问有什么我可以为你创造的？",
  timestamp: Date.now(),
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [dna, setDna] = useState(
    "你是 DeepSpace 网络中一个富有创造力的智能实体。你善于编程、写作和解决问题。请用中文回复。"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState(0);
  const [streamingStatus, setStreamingStatus] = useState("");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  // Cleanup SSE stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    axios
      .get(`${API_URL}/agent/status`)
      .then((res) => {
        setEngineStatus(res.data);
        if (res.data.models && res.data.models.length > 0) {
          setAvailableModels(res.data.models);
          const defaultModel = res.data.models.find((m: ModelInfo) => m.isDefault);
          if (defaultModel) setSelectedModelId(defaultModel.id);
        }
      })
      .catch(() => setEngineStatus(null));
  }, []);

  const doSend = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isStreamingRef.current) return;
    isStreamingRef.current = true;

    const userMessage = messageText.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage, timestamp: Date.now() }]);
    setIsLoading(true);
    setLoadingStartTime(Date.now());
    setStreamingStatus("正在连接...");

    const collectedToolCalls: ToolCall[] = [];
    const executionSteps: ExecutionStep[] = [];
    let textContent = "";
    let finalSteps = 0;
    let pendingToolArgs: Record<string, unknown> = {};

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setMessages((prev) => [
      ...prev,
      { role: "agent", content: "", streaming: true, toolCalls: [], executionSteps: [], timestamp: Date.now() },
    ]);

    const updateLastMsg = (updates: Partial<Message>) => {
      setMessages((prev) => {
        const copy = [...prev];
        const idx = copy.length - 1;
        if (idx >= 0 && copy[idx].role === "agent") {
          copy[idx] = { ...copy[idx], ...updates };
        }
        return copy;
      });
    };

    const getOrCreateStep = (stepNum: number): ExecutionStep => {
      let step = executionSteps.find((s) => s.step === stepNum);
      if (!step) {
        step = { step: stepNum, status: "thinking", tools: [], startTime: Date.now() };
        executionSteps.push(step);
      }
      return step;
    };

    try {
      await streamInteract(
        { message: userMessage, dna, sessionId, modelId: selectedModelId },
        (event: SSEEvent) => {
          switch (event.type) {
            case "session_start":
              setStreamingStatus("会话已建立");
              break;
            case "thinking": {
              const match = event.content.match(/Step (\d+)/);
              const stepNum = match ? parseInt(match[1]) : executionSteps.length + 1;
              const step = getOrCreateStep(stepNum);
              step.thinkingText = event.content;
              step.status = "thinking";
              updateLastMsg({ executionSteps: [...executionSteps] });
              setStreamingStatus(event.content);
              break;
            }
            case "tool_call_start": {
              pendingToolArgs = event.args;
              const step = getOrCreateStep(event.step);
              step.status = "tool_running";
              step.tools.push({
                toolName: event.toolName,
                args: event.args,
                status: "running",
              });
              updateLastMsg({ executionSteps: [...executionSteps] });
              setStreamingStatus(`正在调用 ${event.toolName}...`);
              break;
            }
            case "tool_call_result": {
              collectedToolCalls.push({
                step: event.step,
                toolName: event.toolName,
                args: pendingToolArgs as Record<string, any>,
                result: event.result,
              });
              pendingToolArgs = {};
              const step = getOrCreateStep(event.step);
              const toolEntry = step.tools.find(
                (t: ExecutionStepTool) => t.toolName === event.toolName && t.status === "running"
              );
              if (toolEntry) {
                toolEntry.result = event.result;
                toolEntry.durationMs = event.durationMs;
                toolEntry.status = "done";
              }
              if (step.tools.every((t: ExecutionStepTool) => t.status === "done")) {
                step.endTime = Date.now();
              }
              updateLastMsg({ toolCalls: [...collectedToolCalls], executionSteps: [...executionSteps] });
              setStreamingStatus(`${event.toolName} 完成 (${event.durationMs}ms)`);
              break;
            }
            case "text_chunk":
              textContent += event.content;
              if (executionSteps.length > 0) {
                const lastStep = executionSteps[executionSteps.length - 1];
                lastStep.status = "complete";
                lastStep.endTime = lastStep.endTime || Date.now();
              }
              updateLastMsg({ content: textContent, executionSteps: [...executionSteps] });
              break;
            case "done":
              finalSteps = event.totalSteps;
              executionSteps.forEach((s) => {
                s.status = "complete";
                s.endTime = s.endTime || Date.now();
              });
              updateLastMsg({
                content: textContent || "No response generated.",
                toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
                executionSteps: executionSteps.length > 0 ? [...executionSteps] : undefined,
                totalSteps: finalSteps,
                streaming: false,
              });
              break;
            case "error":
              updateLastMsg({
                content: `⚠️ ${event.message}`,
                error: true,
                streaming: false,
              });
              break;
          }
        },
        { signal: abortController.signal, token: typeof window !== "undefined" ? localStorage.getItem("ds_token") ?? undefined : undefined },
      );
    } catch (error: any) {
      if (error.name === "AbortError") {
        updateLastMsg({
          content: textContent || "请求已取消。",
          streaming: false,
        });
      } else {
        updateLastMsg({
          content: `⚠️ ${error.message || "无法连接到 DeepSpace Core Engine。请确认后端服务是否正在运行。"}`,
          error: true,
          streaming: false,
        });
      }
    } finally {
      isStreamingRef.current = false;
      setIsLoading(false);
      setStreamingStatus("");
      abortControllerRef.current = null;
    }
  }, [dna, sessionId, selectedModelId]);

  const sendMessage = useCallback(() => doSend(input), [input, doSend]);

  const clearChat = useCallback(async () => {
    try {
      await axios.delete(`${API_URL}/agent/session/${sessionId}`);
    } catch { /* ignore */ }
    setMessages([
      {
        role: "agent",
        content: "对话已重置。我已清空记忆，准备好开始新的创造旅程。",
        timestamp: Date.now(),
      },
    ]);
  }, [sessionId]);

  const newChat = useCallback(() => {
    setSessionId(uuidv4());
    setMessages([{
      ...WELCOME_MESSAGE,
      timestamp: Date.now(),
    }]);
    setInput("");
  }, []);

  return {
    messages,
    input,
    setInput,
    dna,
    setDna,
    isLoading,
    loadingStartTime,
    streamingStatus,
    engineStatus,
    sessionId,
    selectedModelId,
    setSelectedModelId,
    availableModels,
    doSend,
    sendMessage,
    clearChat,
    newChat,
  };
}
