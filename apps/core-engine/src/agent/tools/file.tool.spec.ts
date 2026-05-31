import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createReadFileTool, createWriteFileTool } from './file.tool';

describe('File Tools', () => {
  let sandboxRoot: string;
  let readTool: any;
  let writeTool: any;

  beforeEach(async () => {
    sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-test-'));
    readTool = createReadFileTool(sandboxRoot);
    writeTool = createWriteFileTool(sandboxRoot);
  });

  afterEach(async () => {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  describe('write_file', () => {
    it('should write a file in sandbox', async () => {
      const result = await writeTool.invoke({
        filePath: 'hello.txt',
        content: 'Hello World',
      });
      expect(result).toContain('Successfully wrote');

      const content = await fs.readFile(
        path.join(sandboxRoot, 'hello.txt'),
        'utf-8',
      );
      expect(content).toBe('Hello World');
    });

    it('should create nested directories', async () => {
      const result = await writeTool.invoke({
        filePath: 'a/b/c/deep.txt',
        content: 'deep content',
      });
      expect(result).toContain('Successfully wrote');

      const content = await fs.readFile(
        path.join(sandboxRoot, 'a/b/c/deep.txt'),
        'utf-8',
      );
      expect(content).toBe('deep content');
    });

    it('should reject path traversal', async () => {
      const result = await writeTool.invoke({
        filePath: '../../etc/evil.txt',
        content: 'evil',
      });
      expect(result).toContain('Error');
      expect(result).toContain('Access denied');
    });
  });

  describe('read_file', () => {
    it('should read an existing file', async () => {
      await fs.writeFile(
        path.join(sandboxRoot, 'test.txt'),
        'test content',
        'utf-8',
      );
      const result = await readTool.invoke({ filePath: 'test.txt' });
      expect(result).toBe('test content');
    });

    it('should return error for non-existent file', async () => {
      const result = await readTool.invoke({ filePath: 'missing.txt' });
      expect(result).toContain('Error');
    });

    it('should reject absolute path outside sandbox', async () => {
      const result = await readTool.invoke({ filePath: '/etc/passwd' });
      expect(result).toContain('Error');
      expect(result).toContain('Access denied');
    });
  });
});
