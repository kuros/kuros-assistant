import { Global, Module } from '@nestjs/common';
import { LocalFsStorage, STORAGE } from './storage.service';

@Global()
@Module({
  providers: [
    LocalFsStorage,
    { provide: STORAGE, useExisting: LocalFsStorage },
  ],
  exports: [STORAGE, LocalFsStorage],
})
export class StorageModule {}
