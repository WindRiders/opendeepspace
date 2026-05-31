import { ToolRegistry } from './tool-registry';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

function createMockTool(name: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: `Mock tool ${name}`,
    schema: z.object({}),
    func: async () => 'ok',
  });
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve a tool', () => {
    const tool = createMockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
    expect(registry.has('test_tool')).toBe(true);
  });

  it('should register multiple tools', () => {
    registry.registerAll([createMockTool('a'), createMockTool('b'), createMockTool('c')]);
    expect(registry.count()).toBe(3);
    expect(registry.getNames()).toEqual(['a', 'b', 'c']);
  });

  it('should return all tools', () => {
    registry.registerAll([createMockTool('x'), createMockTool('y')]);
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name)).toEqual(['x', 'y']);
  });

  it('should remove a tool', () => {
    registry.register(createMockTool('remove_me'));
    expect(registry.has('remove_me')).toBe(true);
    registry.remove('remove_me');
    expect(registry.has('remove_me')).toBe(false);
    expect(registry.count()).toBe(0);
  });

  it('should return undefined for unknown tool', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });
});
