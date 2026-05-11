import { Injectable, Logger, Inject } from '@nestjs/common';
import { PublicClientApplication, type Configuration, type AuthenticationResult } from '@azure/msal-node';
import { STORAGE, type StorageService } from '../../storage/storage.service';

const SCOPES = ['Mail.Read', 'offline_access'];

// Personal Microsoft accounts (outlook.com, hotmail.com, live.com) require the
// 'consumers' authority — no tenant ID is involved.
const AUTHORITY = 'https://login.microsoftonline.com/consumers';

export interface DeviceCodePromptInfo {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

@Injectable()
export class OutlookPersonalAuthService {
  private readonly logger = new Logger(OutlookPersonalAuthService.name);
  // Keyed by token-cache path (one PCA per connector instance)
  private readonly pcaCache = new Map<string, PublicClientApplication>();
  private readonly pendingDeviceCodes = new Map<string, DeviceCodePromptInfo>();

  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}

  private buildPca(clientId: string, tokenCachePath: string): PublicClientApplication {
    const existing = this.pcaCache.get(tokenCachePath);
    if (existing) return existing;

    const config: Configuration = {
      auth: { clientId, authority: AUTHORITY },
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (cacheCtx) => {
            try {
              if (await this.storage.exists(tokenCachePath)) {
                const data = await this.storage.read(tokenCachePath);
                cacheCtx.tokenCache.deserialize(data);
              }
            } catch (err) {
              this.logger.warn(`token cache read failed: ${err instanceof Error ? err.message : err}`);
            }
          },
          afterCacheAccess: async (cacheCtx) => {
            if (cacheCtx.cacheHasChanged) {
              await this.storage.write(tokenCachePath, cacheCtx.tokenCache.serialize());
            }
          },
        },
      },
    };

    const pca = new PublicClientApplication(config);
    this.pcaCache.set(tokenCachePath, pca);
    return pca;
  }

  async getAccessToken(args: {
    connectorId: string;
    clientId: string;
    tokenCachePath: string;
  }): Promise<AuthenticationResult> {
    const pca = this.buildPca(args.clientId, args.tokenCachePath);
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      try {
        const r = await pca.acquireTokenSilent({ account: accounts[0]!, scopes: SCOPES });
        if (r) return r;
      } catch (err) {
        this.logger.warn(`silent acquire failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    return new Promise((resolve, reject) => {
      pca
        .acquireTokenByDeviceCode({
          scopes: SCOPES,
          deviceCodeCallback: (response) => {
            const info: DeviceCodePromptInfo = {
              userCode: response.userCode,
              verificationUri: response.verificationUri,
              expiresAt: new Date(Date.now() + response.expiresIn * 1000).toISOString(),
            };
            this.pendingDeviceCodes.set(args.connectorId, info);
            this.logger.log(
              `Outlook personal device code: visit ${response.verificationUri} and enter ${response.userCode}`,
            );
          },
        })
        .then((r) => {
          this.pendingDeviceCodes.delete(args.connectorId);
          if (!r) reject(new Error('No auth result returned'));
          else resolve(r);
        })
        .catch(reject);
    });
  }

  takePendingDeviceCode(connectorId: string): DeviceCodePromptInfo | undefined {
    return this.pendingDeviceCodes.get(connectorId);
  }
}
