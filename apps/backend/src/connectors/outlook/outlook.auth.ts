import { Injectable, Logger, Inject } from '@nestjs/common';
import { PublicClientApplication, type Configuration, type AuthenticationResult } from '@azure/msal-node';
import { STORAGE, type StorageService } from '../../storage/storage.service';

const SCOPES = ['Mail.Read', 'User.Read', 'offline_access'];

export interface DeviceCodePromptInfo {
  userCode: string;
  verificationUri: string;
  expiresAt: string;
}

@Injectable()
export class OutlookAuthService {
  private readonly logger = new Logger(OutlookAuthService.name);
  private readonly pcaCache = new Map<string, PublicClientApplication>();
  // connectorId -> pending device code (for the test endpoint to read)
  private readonly pendingDeviceCodes = new Map<string, DeviceCodePromptInfo>();

  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}

  private buildPca(args: {
    tenantId: string;
    clientId: string;
    tokenCachePath: string;
  }): PublicClientApplication {
    const cacheKey = `${args.tenantId}:${args.clientId}`;
    const existing = this.pcaCache.get(cacheKey);
    if (existing) return existing;

    const config: Configuration = {
      auth: {
        clientId: args.clientId,
        authority: `https://login.microsoftonline.com/${args.tenantId}`,
      },
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (cacheCtx) => {
            try {
              if (await this.storage.exists(args.tokenCachePath)) {
                const data = await this.storage.read(args.tokenCachePath);
                cacheCtx.tokenCache.deserialize(data);
              }
            } catch (err) {
              this.logger.warn(`token cache read failed: ${err instanceof Error ? err.message : err}`);
            }
          },
          afterCacheAccess: async (cacheCtx) => {
            if (cacheCtx.cacheHasChanged) {
              await this.storage.write(args.tokenCachePath, cacheCtx.tokenCache.serialize());
            }
          },
        },
      },
    };
    const pca = new PublicClientApplication(config);
    this.pcaCache.set(cacheKey, pca);
    return pca;
  }

  async getAccessToken(args: {
    connectorId: string;
    tenantId: string;
    clientId: string;
    tokenCachePath: string;
  }): Promise<AuthenticationResult> {
    const pca = this.buildPca(args);
    const accounts = await pca.getTokenCache().getAllAccounts();
    if (accounts.length > 0) {
      const account = accounts[0];
      try {
        const r = await pca.acquireTokenSilent({ account: account!, scopes: SCOPES });
        if (r) return r;
      } catch (err) {
        this.logger.warn(`silent acquire failed, falling back to device code: ${err instanceof Error ? err.message : err}`);
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
              `Outlook device code: visit ${response.verificationUri} and enter ${response.userCode}`,
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
