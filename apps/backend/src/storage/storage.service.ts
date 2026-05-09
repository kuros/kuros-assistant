import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const STORAGE = Symbol('STORAGE');

export interface StorageService {
  write(relPath: string, content: string): Promise<void>;
  append(relPath: string, content: string): Promise<void>;
  read(relPath: string): Promise<string>;
  exists(relPath: string): Promise<boolean>;
  list(relDir: string): Promise<string[]>;
  delete(relPath: string): Promise<void>;
  absolutePath(relPath: string): string;
}

@Injectable()
export class LocalFsStorage implements StorageService {
  private readonly root: string;

  constructor(@Inject(ConfigService) cfg: ConfigService) {
    const dir = cfg.get<string>('KUROS_DATA_DIR') ?? './data';
    this.root = path.resolve(process.cwd(), dir);
  }

  absolutePath(relPath: string): string {
    if (relPath.includes('..')) {
      throw new BadRequestException(`Invalid path: ${relPath}`);
    }
    return path.join(this.root, relPath);
  }

  async write(relPath: string, content: string): Promise<void> {
    const abs = this.absolutePath(relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }

  async append(relPath: string, content: string): Promise<void> {
    const abs = this.absolutePath(relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.appendFile(abs, content, 'utf8');
  }

  async read(relPath: string): Promise<string> {
    return fs.readFile(this.absolutePath(relPath), 'utf8');
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(relPath));
      return true;
    } catch {
      return false;
    }
  }

  async list(relDir: string): Promise<string[]> {
    try {
      return await fs.readdir(this.absolutePath(relDir));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async delete(relPath: string): Promise<void> {
    try {
      await fs.unlink(this.absolutePath(relPath));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
