import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'node:path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres' as const,
        host: cfg.get<string>('DB_HOST'),
        port: cfg.get<number>('DB_PORT'),
        username: cfg.get<string>('DB_USER'),
        password: cfg.get<string>('DB_PASSWORD'),
        database: cfg.get<string>('DB_NAME'),
        entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
        migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
        synchronize: false,
        logging: ['error', 'warn'],
        autoLoadEntities: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
