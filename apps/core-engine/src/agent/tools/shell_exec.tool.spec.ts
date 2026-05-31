import { createShellExecTool } from './shell_exec.tool';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('shell_exec tool', () => {
  let sandboxRoot: string;
  let tool: ReturnType<typeof createShellExecTool>;

  beforeAll(async () => {
    sandboxRoot = path.join(os.tmpdir(), `shell-test-${Date.now()}`);
    await fs.mkdir(sandboxRoot, { recursive: true });
    tool = createShellExecTool(sandboxRoot);
  });

  afterAll(async () => {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  it('should execute an allowed command', async () => {
    const result = await tool.invoke({ command: 'echo hello world' });
    expect(result).toContain('hello world');
  });

  it('should reject disallowed commands', async () => {
    const result = await tool.invoke({ command: 'rm -rf /' });
    expect(result).toContain('not allowed');
  });

  it('should list files in sandbox', async () => {
    await fs.writeFile(path.join(sandboxRoot, 'test.txt'), 'content');
    const result = await tool.invoke({ command: 'ls' });
    expect(result).toContain('test.txt');
  });

  it('should run in sandbox directory', async () => {
    const result = await tool.invoke({ command: 'pwd' });
    // macOS resolves /var -> /private/var via symlink
    expect(fsSync.realpathSync(result.trim())).toBe(fsSync.realpathSync(sandboxRoot));
  });
});
