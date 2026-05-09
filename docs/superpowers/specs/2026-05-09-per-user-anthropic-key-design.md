# Per-User Anthropic Configuration Design

**Date:** 2026-05-09
**Status:** Approved

## Problem

`ANTHROPIC_API_KEY`, `CLAUDE_MODEL_FAST`, and `CLAUDE_MODEL_DEEP` are currently global environment variables shared across all users. Each user must be able to supply their own Anthropic API key and model preferences. The env vars are removed entirely — there is no global fallback.

## Data Model

New `user_settings` table. One row per user, upserted on first write.

```
Table: kuros_manager.user_settings
  user_id           uuid    PRIMARY KEY, FK → users(id) ON DELETE CASCADE
  anthropic_api_key text    nullable — null means key not yet configured
  claude_model_fast text    nullable — effective default: claude-sonnet-4-6
  claude_model_deep text    nullable — effective default: claude-opus-4-7
```

Stored plaintext, consistent with how connector tokens are stored today.

New migration: `1700000000001-UserSettings.ts`
New entity: `UserSettingsEntity`

## API Surface

`MeSettingsController` at `/api/me/settings`, protected by the existing auth guard.

### GET /api/me/settings

Returns `UserSettingsDto`:

```ts
{
  hasAnthropicKey: boolean       // true if a key is stored, never returns the raw key
  claudeModelFast: string        // effective value (user's or default)
  claudeModelDeep: string        // effective value (user's or default)
}
```

### PATCH /api/me/settings

Body: `UpdateUserSettingsDto`:

```ts
{
  anthropicApiKey?: string       // @IsString() @MinLength(1)
  claudeModelFast?: string       // @IsString() @MinLength(1)
  claudeModelDeep?: string       // @IsString() @MinLength(1)
}
```

Returns updated `UserSettingsDto`.

Both DTOs live in `packages/shared`.

### UserSettingsService (internal)

- `get(userId): UserSettingsDto` — reads row, applies defaults for models, returns DTO
- `update(userId, dto): UserSettingsDto` — upserts row, returns updated DTO
- `getRawApiKey(userId): string | null` — internal only, returns raw key or null

## ClaudeClientFactory

New service inside the `claude` module. Injects `UserSettingsService`.

```ts
getContext(userId: string): { client: Anthropic; modelFast: string; modelDeep: string }
```

- Calls `userSettingsService.getRawApiKey(userId)` — throws `BadRequestException('Anthropic API key not configured')` if null
- Creates `new Anthropic({ apiKey })` per call (no caching — single-user app, negligible overhead)
- Returns `{ client, modelFast, modelDeep }` where models use user's values or hardcoded defaults:
  - `DEFAULT_MODEL_FAST = 'claude-sonnet-4-6'`
  - `DEFAULT_MODEL_DEEP = 'claude-opus-4-7'`

## ClaudeService Changes

- Remove `ConfigService` injection and `this.client` instance field
- Inject `ClaudeClientFactory`
- `summarize(userId: string, ...)` and `extractStructured(userId: string, ...)` gain `userId` as first parameter
- Each method calls `this.factory.getContext(userId)` at the top and uses the returned `client` and models

All existing call sites (`PostSummaryPipeline`, insights service) already have `userId` in scope and pass it through.

## Gating

`ConnectorSchedulerService` currently skips users who are not onboarded. Add a second guard:

```ts
const apiKey = await this.userSettingsService.getRawApiKey(userId);
if (!apiKey) {
  this.logger.warn('Skipping pipeline — Anthropic API key not configured for user');
  return;
}
```

No crash — silent skip until the user configures their key.

## Env Cleanup

Remove from `env.schema.ts` and `.env.example`:
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL_FAST`
- `CLAUDE_MODEL_DEEP`

## UI

### New page: `/settings/ai`

A new **AI Settings** page added to the Settings nav group alongside the existing Profile page. Follows the same layout pattern as `ProfilePage`: centered container (max-width 520px), MUI components, react-hook-form + Zod, success Snackbar.

**Fields:**

- **Anthropic API Key** — `TextField` with `type="password"` and a show/hide toggle `IconButton`. When `hasAnthropicKey` is true, shows a masked placeholder (`sk-ant-••••••••`) so the user knows a key is stored. Clearing the field and saving has no effect — to replace a key the user types a new one. `@IsString() @MinLength(1)` validation only fires if the field is non-empty (key is optional on update).
- **Fast model** — `TextField` (free text) labelled "Fast model", pre-filled with the effective value from `GET /api/me/settings`.
- **Deep model** — `TextField` (free text) labelled "Deep model", same pattern.

On submit, calls `PATCH /api/me/settings` with only the changed fields (skip `anthropicApiKey` if the field is empty). Shows success Snackbar on save; inline Alert on error.

### Nav

Add one entry to the "Settings" group in `nav-config.ts`:

```
{ label: 'AI', path: '/settings/ai', icon: SmartToyOutlined }
```

### New hooks: `api/hooks/settings.ts`

```ts
useUserSettings()       // GET /api/me/settings, queryKey ['me', 'settings'], 30s staleTime
useUpdateUserSettings() // PATCH /api/me/settings, invalidates ['me', 'settings'] on success
```

## File Inventory

| File | Change |
|---|---|
| `packages/shared/src/api.contracts.ts` | Add `UserSettingsDto`, `UpdateUserSettingsDto` |
| `packages/shared/src/index.ts` | Re-export new types |
| `apps/backend/src/entities/user-settings.entity.ts` | New entity |
| `apps/backend/src/database/migrations/1700000000001-UserSettings.ts` | New migration |
| `apps/backend/src/me/me-settings.controller.ts` | New controller |
| `apps/backend/src/me/dto/update-user-settings.dto.ts` | New DTO (backend validation) |
| `apps/backend/src/me/user-settings.service.ts` | New service |
| `apps/backend/src/me/me.module.ts` | Wire new controller + service |
| `apps/backend/src/claude/claude-client.factory.ts` | New factory |
| `apps/backend/src/claude/claude.service.ts` | Inject factory, add userId param |
| `apps/backend/src/me/me.module.ts` | Export `UserSettingsService` |
| `apps/backend/src/claude/claude.module.ts` | Provide factory, import `MeModule` to access `UserSettingsService` |
| `apps/backend/src/connectors/connector-scheduler.service.ts` | Add API key gate |
| `apps/backend/src/connectors/post-summary.pipeline.ts` | Pass userId to ClaudeService calls |
| `apps/backend/src/config/env.schema.ts` | Remove three fields |
| `.env.example` | Remove three fields |
| `apps/frontend/src/api/hooks/settings.ts` | New hooks: `useUserSettings`, `useUpdateUserSettings` |
| `apps/frontend/src/pages/AiSettingsPage.tsx` | New settings page |
| `apps/frontend/src/routes.tsx` | Add `/settings/ai` route |
| `apps/frontend/src/layout/nav-config.ts` | Add AI nav item under Settings group |
