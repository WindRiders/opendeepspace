import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createListFilesTool } from './list_files.tool';

describe('ListFiles Tool', () => {
  let sandboxRoot: string;
  let listTool: any;

  beforeEach(async () => {
    sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-list-test-'));
    listTool = createListFilesTool(sandboxRoot);
  });

  afterEach(async () => {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  it('should list empty directory', async () => {
    const result = await listTool.invoke({});
    expect(result).toBe('(empty directory)');
  });

  it('should list files and directories', async () => {
    await fs.writeFile(path.join(sandboxRoot, 'file.txt'), 'content');
    await fs.mkdir(path.join(sandboxRoot, 'subdir'));

    const result = await listTool.invoke({});
    expect(result).toContain('file.txt');
    expect(result).toContain('subdir');
  });

  it('should list subdirectory', async () => {
    const subdir = path.join(sandboxRoot, 'mydir');
    await fs.mkdir(subdir);
    await fs.writeFile(path.join(subdir, 'inner.txt'), 'data');

    const result = await listTool.invoke({ dirPath: 'mydir' });
    expect(result).toContain('inner.txt');
  });

  it('should reject path traversal', async () => {
    const result = await listTool.invoke({ dirPath: '../../' });
    expect(result).toContain('Error');
  });

  it('should return error for non-existent directory', async () => {
    const result = await listTool.invoke({ dirPath: 'nonexistent' });
    expect(result).toContain('Error');
  });
});
