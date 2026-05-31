import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxService } from './sandbox.service';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('SandboxService', () => {
  let service: SandboxService;
  let sandboxRoot: string;

  beforeAll(async () => {
    sandboxRoot = path.join(os.tmpdir(), `sandbox-svc-test-${Date.now()}`);
    await fs.mkdir(sandboxRoot, { recursive: true });

    // Create test files
    await fs.writeFile(path.join(sandboxRoot, 'hello.txt'), 'Hello World');
    await fs.writeFile(path.join(sandboxRoot, 'app.ts'), 'console.log("hi");');
    await fs.mkdir(path.join(sandboxRoot, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(sandboxRoot, 'subdir', 'nested.py'), 'print("nested")');
  });

  afterAll(async () => {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SANDBOX_ROOT') return sandboxRoot;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
  });

  it('should list files in root', async () => {
    const files = await service.listFiles();
    const names = files.map((f) => f.name);
    expect(names).toContain('hello.txt');
    expect(names).toContain('app.ts');
    expect(names).toContain('subdir');
  });

  it('should list directories before files', async () => {
    const files = await service.listFiles();
    const dirIdx = files.findIndex((f) => f.type === 'directory');
    const fileIdx = files.findIndex((f) => f.type === 'file');
    if (dirIdx >= 0 && fileIdx >= 0) {
      expect(dirIdx).toBeLessThan(fileIdx);
    }
  });

  it('should include children for directories', async () => {
    const files = await service.listFiles();
    const subdir = files.find((f) => f.name === 'subdir');
    expect(subdir).toBeDefined();
    expect(subdir!.children).toBeDefined();
    expect(subdir!.children!.length).toBe(1);
    expect(subdir!.children![0].name).toBe('nested.py');
  });

  it('should read a file', async () => {
    const result = await service.readFile('hello.txt');
    expect(result.content).toBe('Hello World');
    expect(result.language).toBe('plaintext');
  });

  it('should detect language from extension', async () => {
    const result = await service.readFile('app.ts');
    expect(result.language).toBe('typescript');
  });

  it('should detect python language', async () => {
    const result = await service.readFile('subdir/nested.py');
    expect(result.language).toBe('python');
  });

  it('should reject paths outside sandbox', async () => {
    await expect(service.readFile('../../etc/passwd')).rejects.toThrow(
      'Access denied',
    );
  });

  it('should hide hidden files', async () => {
    await fs.writeFile(path.join(sandboxRoot, '.hidden'), 'secret');
    const files = await service.listFiles();
    const names = files.map((f) => f.name);
    expect(names).not.toContain('.hidden');
  });
});
