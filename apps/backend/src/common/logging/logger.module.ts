import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isDev = cfg.get<string>('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            level: cfg.get<string>('LOG_LEVEL') ?? 'info',
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', '*.botToken', '*.appToken'],
              censor: '[redacted]',
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
