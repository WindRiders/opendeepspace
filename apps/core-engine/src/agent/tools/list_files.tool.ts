import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import { resolveSandboxPath } from './sandbox.util';

export const createListFilesTool = (sandboxRoot: string) => {
  return new DynamicStructuredTool({
    name: 'list_files',
    description: `List files and directories in the workspace sandbox. Paths are relative to the sandbox root (${sandboxRoot}).`,
    schema: z.object({
      dirPath: z
        .string()
        .optional()
        .describe(
          'Relative directory path within the sandbox. Defaults to root.',
        ),
    }),
    func: async ({ dirPath }) => {
      try {
        const targetDir = dirPath
          ? resolveSandboxPath(sandboxRoot, dirPath)
          : sandboxRoot;

        await fs.mkdir(sandboxRoot, { recursive: true });
        const entries = await fs.readdir(targetDir, { withFileTypes: true });

        if (entries.length === 0) {
          return '(empty directory)';
        }

        const lines = entries.map((e) => {
          const prefix = e.isDirectory() ? '\u{1F4C1}' : '\u{1F4C4}';
          return `${prefix} ${e.name}`;
        });

        return lines.join('\n');
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });
};
