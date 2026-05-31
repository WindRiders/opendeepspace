import * as path from 'path';
import { resolveSandboxPath } from './sandbox.util';

describe('resolveSandboxPath', () => {
  const sandboxRoot = '/tmp/test-sandbox';

  it('should resolve relative path within sandbox', () => {
    const result = resolveSandboxPath(sandboxRoot, 'file.txt');
    expect(result).toBe(path.resolve(sandboxRoot, 'file.txt'));
  });

  it('should resolve nested relative path', () => {
    const result = resolveSandboxPath(sandboxRoot, 'a/b/c/file.txt');
    expect(result).toBe(path.resolve(sandboxRoot, 'a/b/c/file.txt'));
  });

  it('should allow absolute path within sandbox', () => {
    const absPath = path.join(sandboxRoot, 'subdir', 'file.txt');
    const result = resolveSandboxPath(sandboxRoot, absPath);
    expect(result).toBe(absPath);
  });

  it('should reject absolute path outside sandbox', () => {
    expect(() => resolveSandboxPath(sandboxRoot, '/etc/passwd')).toThrow(
      'Access denied',
    );
  });

  it('should reject .. traversal that escapes sandbox', () => {
    expect(() =>
      resolveSandboxPath(sandboxRoot, '../../etc/passwd'),
    ).toThrow('Access denied');
  });

  it('should allow .. traversal that stays inside sandbox', () => {
    const result = resolveSandboxPath(sandboxRoot, 'a/b/../c/file.txt');
    expect(result).toBe(path.resolve(sandboxRoot, 'a/c/file.txt'));
    expect(result.startsWith(sandboxRoot)).toBe(true);
  });
});
