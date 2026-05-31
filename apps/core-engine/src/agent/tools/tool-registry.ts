import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * ToolRegistry — 可插拔工具注册中心。
 * 管理所有可用工具的注册、查询、启用/禁用。
 */
export class ToolRegistry {
  private tools: Map<string, DynamicStructuredTool> = new Map();

  register(tool: DynamicStructuredTool): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: DynamicStructuredTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): DynamicStructuredTool | undefined {
    return this.tools.get(name);
  }

  getAll(): DynamicStructuredTool[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  count(): number {
    return this.tools.size;
  }
}
