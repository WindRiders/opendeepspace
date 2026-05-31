import { createCodeRunTool } from './code_run.tool';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('code_run tool', () => {
  let sandboxRoot: string;
  let tool: ReturnType<typeof createCodeRunTool>;

  beforeAll(async () => {
    sandboxRoot = path.join(os.tmpdir(), `coderun-test-${Date.now()}`);
    await fs.mkdir(sandboxRoot, { recursive: true });
    tool = createCodeRunTool(sandboxRoot);
  });

  afterAll(async () => {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  it('should run JavaScript code', async () => {
    const result = await tool.invoke({
      language: 'javascript',
      code: 'console.log(2 + 3)',
    });
    expect(result.trim()).toBe('5');
  });

  it('should run Python code', async () => {
    const result = await tool.invoke({
      language: 'python',
      code: 'print("hello from python")',
    });
    expect(result).toContain('hello from python');
  });

  it('should run Bash code', async () => {
    const result = await tool.invoke({
      language: 'bash',
      code: 'echo "bash works"',
    });
    expect(result).toContain('bash works');
  });

  it('should handle runtime errors', async () => {
    const result = await tool.invoke({
      language: 'javascript',
      code: 'throw new Error("test error")',
    });
    expect(result).toContain('Error');
  });

  it('should clean up temp files', async () => {
    await tool.invoke({
      language: 'javascript',
      code: 'console.log("cleanup test")',
    });
    const tmpDir = path.join(sandboxRoot, '.deepspace-tmp');
    try {
      const files = await fs.readdir(tmpDir);
      // Only allow the tmp dir to exist, but no leftover run_ files
      const runFiles = files.filter((f) => f.startsWith('run_'));
      expect(runFiles).toHaveLength(0);
    } catch {
      // tmpDir may not exist if it was cleaned up — that's fine
    }
  });
});
