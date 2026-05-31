import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execFileAsync = promisify(execFile);

const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LEN = 10_000;

interface RuntimeConfig {
  command: string;
  extension: string;
}

const RUNTIMES: Record<string, RuntimeConfig> = {
  python: { command: 'python3', extension: '.py' },
  javascript: { command: 'node', extension: '.js' },
  typescript: { command: 'npx', extension: '.ts' },
  bash: { command: 'bash', extension: '.sh' },
};

export const createCodeRunTool = (sandboxRoot: string) => {
  return new DynamicStructuredTool({
    name: 'code_run',
    description: `Run a code snippet in the sandbox (${sandboxRoot}). Supports Python, JavaScript, TypeScript, and Bash. The code is saved to a temp file and executed. Timeout: 30s.`,
    schema: z.object({
      language: z
        .enum(['python', 'javascript', 'typescript', 'bash'])
        .describe('The programming language of the code snippet'),
      code: z.string().describe('The code to execute'),
    }),
    func: async ({ language, code }) => {
      try {
        const runtime = RUNTIMES[language];
        if (!runtime) {
          return `Error: Unsupported language "${language}". Supported: ${Object.keys(RUNTIMES).join(', ')}`;
        }

        // Write code to temp file in sandbox
        const tempDir = path.join(sandboxRoot, '.deepspace-tmp');
        await fs.mkdir(tempDir, { recursive: true });

        const filename = `run_${Date.now()}${runtime.extension}`;
        const filePath = path.join(tempDir, filename);
        await fs.writeFile(filePath, code, 'utf-8');

        try {
          let args: string[];
          if (language === 'typescript') {
            // Use npx tsx for TypeScript
            args = ['tsx', filePath];
          } else {
            args = [filePath];
          }

          const { stdout, stderr } = await execFileAsync(
            runtime.command,
            args,
            {
              cwd: sandboxRoot,
              timeout: MAX_TIMEOUT_MS,
              maxBuffer: 1024 * 1024,
              env: {
                ...process.env,
                HOME: sandboxRoot,
                PATH: process.env.PATH,
              },
            },
          );

          let output = stdout || '';
          if (stderr) {
            output += (output ? '\n' : '') + `[stderr] ${stderr}`;
          }

          if (output.length > MAX_OUTPUT_LEN) {
            output =
              output.substring(0, MAX_OUTPUT_LEN) + '\n... (output truncated)';
          }

          return output || '(no output)';
        } finally {
          // Clean up temp file
          await fs.unlink(filePath).catch(() => {});
        }
      } catch (err: any) {
        if (err.killed) {
          return `Error: Code execution timed out after ${MAX_TIMEOUT_MS / 1000}s`;
        }
        const stderr = err.stderr ? `\n${err.stderr}` : '';
        return `Error (exit ${err.code || 'unknown'}): ${err.message}${stderr}`.substring(
          0,
          MAX_OUTPUT_LEN,
        );
      }
    },
  });
};
