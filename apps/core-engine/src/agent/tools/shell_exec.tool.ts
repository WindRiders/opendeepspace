import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Allowed commands — only safe, read-oriented or build commands */
const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo', 'date',
  'pwd', 'whoami', 'env', 'which', 'file', 'du', 'df',
  'node', 'python3', 'python', 'npx', 'npm', 'pip',
  'git', 'curl', 'jq', 'sed', 'awk', 'sort', 'uniq', 'tr', 'cut',
  'mkdir', 'touch', 'cp', 'mv', 'chmod',
]);

const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LEN = 10_000;

export const createShellExecTool = (sandboxRoot: string) => {
  return new DynamicStructuredTool({
    name: 'shell_exec',
    description: `Execute a shell command inside the workspace sandbox (${sandboxRoot}). Only allowed safe commands. Timeout: 30s. Output truncated at 10KB.`,
    schema: z.object({
      command: z
        .string()
        .describe('The command to execute (e.g. "ls -la" or "node script.js")'),
    }),
    func: async ({ command }) => {
      try {
        // Parse the command into base command + args (no shell interpretation)
        const tokens = command.trim().split(/\s+/);
        const baseCmd = tokens[0];
        const args = tokens.slice(1);

        if (!ALLOWED_COMMANDS.has(baseCmd)) {
          return `Error: Command "${baseCmd}" is not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`;
        }

        // Reject shell metacharacters to prevent injection
        if (/[;|&`$(){}\\<>!]/.test(command)) {
          return `Error: Shell metacharacters are not allowed. Please use simple commands without pipes, redirects, or chaining.`;
        }

        // Resolve full path of the command
        const { stdout: whichOut } = await execFileAsync('/usr/bin/which', [baseCmd], {
          env: { PATH: process.env.PATH },
        }).catch(() => ({ stdout: '' }));
        const resolvedCmd = whichOut.trim() || `/usr/bin/${baseCmd}`;

        const { stdout, stderr } = await execFileAsync(
          resolvedCmd,
          args,
          {
            cwd: sandboxRoot,
            timeout: MAX_TIMEOUT_MS,
            maxBuffer: 1024 * 1024, // 1MB
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
          output = output.substring(0, MAX_OUTPUT_LEN) + '\n... (output truncated)';
        }

        return output || '(no output)';
      } catch (err: any) {
        if (err.killed) {
          return `Error: Command timed out after ${MAX_TIMEOUT_MS / 1000}s`;
        }
        const stderr = err.stderr ? `\n${err.stderr}` : '';
        return `Error (exit ${err.code || 'unknown'}): ${err.message}${stderr}`.substring(0, MAX_OUTPUT_LEN);
      }
    },
  });
};
