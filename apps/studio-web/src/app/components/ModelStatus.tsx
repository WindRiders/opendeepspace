'use client';

import { Cpu, Wifi, WifiOff } from 'lucide-react';

interface Provider {
  name: string;
  healthy: boolean;
  failureRate: number;
  totalCalls: number;
  consecutiveFailures: number;
}

interface Props {
  providers: Provider[];
}

export function ModelStatus({ providers }: Props) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-gray-200">
        <Cpu className="w-4 h-4 text-blue-500" />
        <span className="font-medium text-sm">Model Router</span>
      </div>
      <div className="p-2 space-y-2">
        {providers.map((p) => (
          <div key={p.name} className="flex items-center gap-2 p-2 border border-gray-100 rounded text-xs">
            {p.healthy
              ? <Wifi className="w-3 h-3 text-green-500" />
              : <WifiOff className="w-3 h-3 text-red-400" />}
            <span className="font-medium flex-1">{p.name}</span>
            <span className={p.healthy ? 'text-green-600' : 'text-red-500'}>
              {p.healthy ? 'Healthy' : 'Down'}
            </span>
            {p.failureRate > 0 && (
              <span className="text-gray-400">{(p.failureRate * 100).toFixed(1)}% fail</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}