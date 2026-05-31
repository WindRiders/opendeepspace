import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: number;
  children?: FileEntry[];
}

@Injectable()
export class SandboxService {
  private readonly sandboxRoot: string;
  private readonly logger = new Logger(SandboxService.name);

  constructor(private readonly configService: ConfigService) {
    this.sandboxRoot =
      this.configService.get<string>('SANDBOX_ROOT') ||
      `${process.env.HOME}/deepspace-sandbox`;
  }

  async listFiles(dirPath: string = '', depth: number = 5): Promise<FileEntry[]> {
    if (depth <= 0) return [];

    const targetDir = dirPath
      ? this.resolvePath(dirPath)
      : this.sandboxRoot;

    await fs.mkdir(this.sandboxRoot, { recursive: true });

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const results: FileEntry[] = [];

      for (const entry of entries) {
        // Skip hidden files and temp directories
        if (entry.name.startsWith('.')) continue;

        const entryPath = path.join(dirPath || '', entry.name);
        const fullPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
          const children = await this.listFiles(entryPath, depth - 1);
          results.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
            children,
          });
        } else {
          const stat = await fs.stat(fullPath);
          results.push({
            name: entry.name,
            path: entryPath,
            type: 'file',
            size: stat.size,
            modifiedAt: Math.floor(stat.mtimeMs / 1000),
          });
        }
      }

      // Directories first, then files, both alphabetical
      results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return results;
    } catch (err: any) {
      this.logger.warn(`Failed to list sandbox files: ${err.message}`);
      return [];
    }
  }

  async readFile(filePath: string): Promise<{ content: string; size: number; language: string }> {
    const fullPath = this.resolvePath(filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const stat = await fs.stat(fullPath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      content: content.length > 100_000
        ? content.substring(0, 100_000) + '\n\n... (file truncated at 100KB)'
        : content,
      size: stat.size,
      language: this.detectLanguage(ext),
    };
  }

  private resolvePath(filePath: string): string {
    const resolved = path.resolve(this.sandboxRoot, filePath);
    if (resolved !== this.sandboxRoot && !resolved.startsWith(this.sandboxRoot + path.sep)) {
      throw new BadRequestException('Access denied: path is outside the sandbox.');
    }
    return resolved;
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.rb': 'ruby',
      '.rs': 'rust', '.go': 'go',
      '.java': 'java', '.kt': 'kotlin',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c',
      '.css': 'css', '.scss': 'scss',
      '.html': 'html', '.xml': 'xml',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown', '.txt': 'plaintext',
      '.sh': 'bash', '.bash': 'bash',
      '.sql': 'sql', '.toml': 'toml',
    };
    return langMap[ext] || 'plaintext';
  }
}
