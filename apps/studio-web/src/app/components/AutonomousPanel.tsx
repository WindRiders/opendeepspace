'use client';

import { Bot, Loader2, Lightbulb } from 'lucide-react';

interface LearningTask {
  id: string;
  topic: string;
  priority: number;
  status: string;
}

interface Props {
  isIdle: boolean;
  pendingTasks: LearningTask[];
  activeTask: LearningTask | null;
  dailyCost: number;
  dailyBudget: number;
}

export function AutonomousPanel({ isIdle, pendingTasks, activeTask, dailyCost, dailyBudget }: Props) {
  const statusColors: Record<string, string> = {
    pending: 'text-gray-400',
    researching: 'text-blue-500',
    analyzing: 'text-yellow-500',
    integrating: 'text-green-500',
    completed: 'text-green-600',
    failed: 'text-red-500',
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-gray-200">
        <Bot className="w-4 h-4 text-green-500" />
        <span className="font-medium text-sm">Autonomous Learner</span>
      </div>

      <div className="p-2 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            Status: {isIdle ? 'Idle' : 'Active'}
            {!isIdle && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
          </span>
          <span className="text-gray-400">
            Cost: ${dailyCost.toFixed(3)} / ${dailyBudget.toFixed(2)}
          </span>
        </div>

        {activeTask && (
          <div className="p-2 border border-green-100 bg-green-50 rounded text-xs">
            <Lightbulb className="w-3 h-3 text-green-500 inline mr-1" />
            <span className="font-medium">{activeTask.topic}</span>
            <span className={`ml-2 ${statusColors[activeTask.status] || ''}`}>{activeTask.status}</span>
          </div>
        )}

        {pendingTasks.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 uppercase">Pending ({pendingTasks.length})</span>
            {pendingTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span className="flex-1 truncate">{t.topic}</span>
                <span className="text-gray-400">{(t.priority * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}

        {!activeTask && pendingTasks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No active learning tasks</p>
        )}
      </div>
    </div>
  );
}