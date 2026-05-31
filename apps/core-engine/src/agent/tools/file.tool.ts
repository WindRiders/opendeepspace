import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { resolveSandboxPath } from './sandbox.util';

/** Ensure sandbox root exists */
async function ensureSandbox(sandboxRoot: string) {
  await fs.mkdir(sandboxRoot, { recursive: true });
}

export const createWriteFileTool = (sandboxRoot: string) => {
  return new DynamicStructuredTool({
    name: 'write_file',
    description: `Write content to a file. Paths are relative to the workspace sandbox (${sandboxRoot}). Cannot write outside the sandbox.`,
    schema: z.object({
      filePath: z
        .string()
        .describe('Relative path within the sandbox to write to.'),
      content: z
        .string()
        .describe('The content to write to the file.'),
    }),
    func: async ({ filePath, content }) => {
      try {
        await ensureSandbox(sandboxRoot);
        const fullPath = resolveSandboxPath(sandboxRoot, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        return `Successfully wrote to ${path.relative(sandboxRoot, fullPath)}`;
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });
};

export const createReadFileTool = (sandboxRoot: string) => {
  return new DynamicStructuredTool({
    name: 'read_file',
    description: `Read content from a file. Paths are relative to the workspace sandbox (${sandboxRoot}). Cannot read outside the sandbox.`,
    schema: z.object({
      filePath: z
        .string()
        .describe('Relative path within the sandbox to read from.'),
    }),
    func: async ({ filePath }) => {
      try {
        const fullPath = resolveSandboxPath(sandboxRoot, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return content;
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
  });
};
