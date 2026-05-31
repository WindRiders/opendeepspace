import * as path from 'path';

/** Resolve and validate a path is within the sandbox */
export function resolveSandboxPath(
  sandboxRoot: string,
  filePath: string,
): string {
  // Always resolve relative to sandbox root, never allow absolute paths
  const resolved = path.resolve(sandboxRoot, filePath);

  if (resolved !== sandboxRoot && !resolved.startsWith(sandboxRoot + path.sep)) {
    throw new Error(
      `Access denied: path "${filePath}" is outside the sandbox (${sandboxRoot}).`,
    );
  }
  return resolved;
}
