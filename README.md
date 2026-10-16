# Lacuna

A quiet reflection space. Type into the void, hold to save a thought, and move down into your timeline, soul map, and living memoir. Svelte 5/SvelteKit serves the interface; Cloudflare Workers and D1 store private account data. A local Node companion handles ChatGPT sign-in and inference.

Find a word across your whole story, keep important thoughts close, explore recurring concepts as a constellation, and return to earlier memoir editions. The menu can export your private story as a readable Markdown collection or a complete JSON archive. These features require migration `0005_story_archive.sql` and the matching Worker/companion update.

## ChatGPT plan companion

Use Node.js 22.16+ and pnpm 9+:

```bash
pnpm install --frozen-lockfile
pnpm companion
```

1. Open `http://127.0.0.1:1455` using this exact host.
2. Acknowledge data and privacy, then **Continue with ChatGPT**. No Lacuna email link is needed.
3. Complete OpenAI sign-in and authorize eligible ChatGPT plan use. You return to the writing space.
4. Open the down space, then **Menu → AI & ChatGPT plan** to choose an available model.
5. **Test ChatGPT connection** makes a small inference request without journal content. It uses plan allowance or credits and does not save an entry.
6. Save a thought to generate reflections, or **refresh reflections** to retry. Extraction processes up to ten entries per run; refresh again while a backlog remains.

The companion follows [OpenAI's open-source registration flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). OpenAI determines eligibility, models, and limits. **Manage usage** opens [ChatGPT settings](https://chatgpt.com/settings/usage). Sign-in can succeed without plan-use permission; reconnect to grant it. There is no fallback provider or API key requirement.

The hosted app directs new sign-ins to the companion. Entries and reflections remain on the hosted backend. Existing hosted sessions can still read/write; new ChatGPT sessions use the local interface. A hosted OAuth callback requires separate OpenAI registration and is not configured here.

## Identity and credentials

The companion uses PKCE, state, nonce, and signed identity validation. Lacuna independently verifies the ID token against OpenAI's public keys, issuer, issued client ID, expiry, and a single-use server challenge before issuing its own seven-day session. The callback and one-time session delivery are bound to a browser-specific HttpOnly cookie. Accounts use issuer/client/subject, never email matching. Old email accounts and entries remain stored; email sign-in and old links are retired.

Access and refresh tokens stay in `~/.lacuna/chatgpt.credentials`, protected with Windows DPAPI or Unix mode-0600 permissions in a mode-0700 directory. The ID token reaches the Worker only for verification and is not stored there or returned to the browser. No OAuth tokens belong in source control, logs, or browser storage. Process locking and serialized refresh prevent token-rotation races. Disconnect clears local OAuth tokens and attempts remote revocation; it retains the public client registration so signing in again returns to the same account.

Keep the protected credential directory and its stable host/client registration. A fresh dynamic registration on another computer can produce a separate account identity; account transfer/linking is not implemented. Never copy another application's credentials.

The companion binds to loopback, validates Host and Origin, serves the built interface, downloads authenticated context, calls OpenAI directly, and uploads validated results. Keep it running for inference. After a crash, verify that no companion is running before removing its `companion.lock` file.

| Variable | Default | Purpose |
|---|---|---|
| `LACUNA_API_URL` | Production Worker | Backend; HTTPS required except loopback development |
| `LACUNA_PORT` | `1455` | UI and `/auth/callback` port |
| `LACUNA_DATA_DIR` | `~/.lacuna` | Private credential directory |

## Development and deployment

```bash
pnpm install
# Configure the D1 database ID in packages/worker/wrangler.toml.
pnpm -F worker db:migrate:local
# Set JWT_SECRET in the Worker's ignored .dev.vars for development.
pnpm dev:worker
# Set LACUNA_API_URL=http://127.0.0.1:8787 for the local companion.
pnpm companion
```

Production requires the Worker's `JWT_SECRET` and configured `FRONTEND_ORIGIN`, plus Cloudflare deployment credentials in CI. No email service or Anthropic secret is required. Pushes to `main` run checks, apply D1 migrations, deploy the Worker, then deploy Cloudflare Pages. Do not run remote migrations manually. ChatGPT-only sign-in requires `0004_chatgpt_identity.sql` before the updated Worker and companion.

```bash
pnpm check
pnpm test
pnpm build:frontend
pnpm build:companion
pnpm audit
pnpm preview:story     # Disposable sample story at http://127.0.0.1:1456
```

Tests use disposable SQLite data and simulated OpenAI responses. Real OAuth consent and model inference require acceptance testing with an eligible account. See [AUDIT.md](./AUDIT.md), [CLAUDE.md](./CLAUDE.md), and [SPEC.md](./SPEC.md) for verification scope, contributor guidance, and product conventions.

The sample-story preview builds into `.test-output/preview-app`, uses an in-memory database and synthetic entries, and never loads production data or OAuth credentials. It uses ports 1456 and 8788 so your real companion on 1455 can remain open. Stop the preview before starting another instance.

## License

[MIT](./LICENSE)
