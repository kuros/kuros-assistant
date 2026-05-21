import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';

const MAX_BUFFER = 50 * 1024 * 1024;

interface RunArgs {
  system: string;
  user: string;
  model: string;
  outputFormat: 'text' | 'json';
}

interface ClaudeCodeEnvelope {
  type: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  [k: string]: unknown;
}

@Injectable()
export class ClaudeCodeRunner {
  private readonly logger = new Logger(ClaudeCodeRunner.name);

  async runText(args: { system: string; user: string; model: string }): Promise<string> {
    const envelope = await this.invoke({
      system: args.system,
      user: args.user,
      model: args.model,
      outputFormat: 'json',
    });
    if (typeof envelope.result !== 'string') {
      throw new Error('Claude Code returned non-string result');
    }
    return envelope.result;
  }

  async runJson(args: { system: string; user: string; model: string }): Promise<unknown> {
    const userPrompt =
      `${args.user}\n\n` +
      `Respond with ONLY a single JSON object on stdout. ` +
      `No preamble, no code fences, no commentary.`;
    const envelope = await this.invoke({
      system: args.system,
      user: userPrompt,
      model: args.model,
      outputFormat: 'json',
    });
    if (typeof envelope.result !== 'string') {
      throw new Error('Claude Code returned non-string result');
    }
    return parseJsonLoose(envelope.result);
  }

  private async invoke(args: RunArgs): Promise<ClaudeCodeEnvelope> {
    const tmpDir = os.tmpdir();
    const sysPath = path.join(tmpDir, `claude-sys-${randomUUID()}.txt`);
    await fs.writeFile(sysPath, args.system, 'utf8');

    const cliArgs = [
      '-p',
      '--model', args.model,
      '--append-system-prompt-file', sysPath,
      '--output-format', args.outputFormat,
      '--no-session-persistence',
    ];

    try {
      return await new Promise<ClaudeCodeEnvelope>((resolve, reject) => {
        const child = spawn('claude', cliArgs, {
          cwd: tmpDir,
          env: { ...process.env, CI: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let killed = false;

      child.stdin.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EPIPE') {
          this.logger.error(`claude stdin error: ${err.message}`);
        }
      });
      child.stdin.end(args.user, 'utf8');

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > MAX_BUFFER) {
          killed = true;
          child.kill('SIGKILL');
          reject(new InternalServerErrorException('Claude Code output exceeded buffer'));
          return;
        }
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err) => {
        if (killed) return;
        this.logger.error(`Failed to spawn claude CLI: ${err.message}`);
        reject(
          new InternalServerErrorException(
            `Failed to invoke claude CLI: ${err.message}. Is Claude Code installed and on PATH?`,
          ),
        );
      });

      child.on('close', (code) => {
        if (killed) return;
        if (code !== 0) {
          this.logger.error(`claude CLI exited with code ${code}: ${stderr.slice(0, 2000)}`);
          reject(
            new InternalServerErrorException(
              `Claude Code CLI failed (exit ${code}): ${stderr.slice(0, 500) || 'no stderr'}`,
            ),
          );
          return;
        }
        try {
          const envelope = JSON.parse(stdout) as ClaudeCodeEnvelope;
          if (envelope.is_error) {
            reject(
              new InternalServerErrorException(
                `Claude Code reported error: ${String(envelope.result ?? envelope.subtype ?? 'unknown')}`,
              ),
            );
            return;
          }
          resolve(envelope);
        } catch (err) {
          this.logger.error(`Failed to parse claude CLI output: ${err instanceof Error ? err.message : err}`);
          reject(new InternalServerErrorException('Claude Code returned invalid JSON envelope'));
        }
      });
      });
    } finally {
      void fs.unlink(sysPath).catch(() => {});
    }
  }
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1));
    }
    throw new Error('Could not parse JSON from Claude Code output');
  }
}
