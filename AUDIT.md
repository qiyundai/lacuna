# Project audit — 2026-10-16

Base: `https://github.com/qiyundai/lacuna.git`, live default branch `main`, commit `23154f7f719f1d7081c0220d43782ef411e42971`. The original checkout was clean and already included that commit. No production data, secrets, or deployed resources were modified.

Reviewed the Worker routes, authentication, D1 helpers and migrations, AI prompts/graph/pipeline, Svelte routes/components/stores, gesture handling, static caching/service-worker cleanup, dependencies, and deployment workflow.

## Findings addressed

| Finding | Resolution |
|---|---|
| Draft erased on failed save; errors only logged | Animate/clear after successful persistence; retain text and display the error on failure |
| Retry after an ambiguous network result could duplicate a thought | Reuse a client entry ID; validate ownership/content on retries |
| Undefined `solidifyProgress` broke frontend type checking | Removed obsolete state reference |
| Sign-out left entries, draft, patterns, memoir, and overlays in module state | Reset all private state; session generations discard late responses from old accounts |
| Expired sessions could leave the app looking signed in | Authenticated 401s invalidate the matching local session |
| Magic-token read/clear race allowed concurrent redemption | Hash tokens at rest and atomically consume only an unexpired token |
| Email endpoint had no throttling; unconfigured production delivery silently logged links | IP/account throttles, explicit consent, and development-only opt-in fallback |
| Auth middleware caught downstream errors as authentication failures; deleted users retained JWT access | Separate JWT verification from route execution and check account existence |
| Invalid JSON, page sizes, timestamps, body types, and weight values reached database/AI code | Validate inputs, bound request sizes, validate JWT algorithms/claims and generated output |
| Rate-limit increment/read raced and enforcement failed open | Atomic `RETURNING` counter; database failure no longer bypasses enforcement |
| Overlapping analysis jobs could overwrite newer results | Expiring database leases plus atomic version/provider/owner checks on every derived write |
| Deleting entries retained derived private text and invalidated ordinal cursors | Clear derived data and cancel the lease in the deletion transaction; rebuild from remaining entries |
| Random UUID ordering could place a new same-second entry before the extraction cursor | Stable insertion order for AI processing; retain compound pagination for the timeline |
| Failed extraction and memoir generation advanced checkpoints | Validate a complete pipeline result before committing checkpoints and content together |
| Graph merging mutated its input and counted duplicate concepts twice | Copy nodes; deduplicate concepts per type and entry |
| Manual pattern persistence used a read/insert race | Atomic SQLite upsert |
| Hold cancellation measured individual movements instead of total movement | Track the initial contact; clear timers/listeners on destruction |
| Reading scrolls and diagonal swipes could navigate spaces | Respect scrollable ancestors and the dominant axis; inactive spaces are inert |
| Emoji editing mixed Unicode code points with textarea UTF-16 offsets | Convert positions consistently; preserve surrogate boundaries and composition input |
| Hidden void input stole focus while reading or using overlays | Disable/blur it when inactive; restore focus when returning |
| Story refresh effect observed its own store status and repeatedly fetched | Untrack the load operations; bound and clean up polling |
| Overlays lacked keyboard focus management | Portal, focus trap, Escape handling, keyboard-accessible controls, and focus restoration |
| Service-worker activation did asynchronous cleanup without extending event lifetime | Wrap cleanup in `event.waitUntil()` |
| Viewport disabled browser zoom | Restore zoom support |
| Stale dependency tree contained published advisories | Update compatible dependencies, align Wrangler types, patch SvelteKit's transitive cookie dependency, remove the unused adapter |
| Builds could mask Svelte setup errors and deployment omitted checks | Fail setup on errors; add type checks, regression tests, and companion bundling before deployment |
| Setup docs referred to a nonexistent schema file | Document versioned migrations and companion deployment prerequisites |

## ChatGPT plan integration

The hosted application remains the source of account and entry data. A loopback companion serves the same built UI, handles [OpenAI's open-source OAuth flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), and runs [Responses API inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) directly. Public OSS registration uses a loopback callback, PKCE, state, nonce, issued-client validation and signed OIDC identity validation. The app checks plan-use scopes independently of identity.

Credentials are protected locally and isolated per Lacuna account. Refresh is serialized within the process; a file lock prevents multiple processes using the same credential store. Disconnect waits for rotation before revoking the latest renewable session. Model choices come from the connected account's catalog. Requests include `store:false`, `stream:true`, an input array and instructions; unsupported API parameters are omitted. Failed/incomplete/limited/interrupted streams do not become successful reflections. Provider switches and disconnects cancel local work; the server rejects stale uploads. First-use confirmation, connected identity, usage settings, model selection, explicit provider switching, and recovery messages are available in the UI.

## Verification

- Regression tests execute all migrations and production SQL against SQLite with D1-style atomic batches.
- Tests cover request validation, magic-link replay/expiry, account deletion and JWT invalidation, pagination and account isolation, leases and stale commits, failed AI output, graph mutation, idempotent saves, OAuth/PKCE and identity checks, token rotation, fragmented SSE and usage limits, protected credential persistence, logout races, Unicode edits, hold cancellation, and a local companion-to-backend inference round trip using simulated model responses.
- Browser checks use a disposable fixture: privacy acknowledgment, sign-in, failed save with retained emoji/text, successful retry in the timeline, account menu and ChatGPT settings. No real email or model requests are made by that fixture.
- Validation results: 26 regression tests passed; `pnpm check` passed with zero Svelte errors/warnings and a successful Worker type check; frontend and companion production builds passed; Worker dry-run packaging passed; `pnpm audit` reported zero advisories across the dependency tree. `git diff --check` passed. Live remote HEAD was rechecked and remained at the recorded base commit.

## Limits and release prerequisites

- Live OpenAI OAuth consent, account eligibility/model entitlements, real Responses API behavior, and remote revocation were not exercised against a human account. The implementation follows the current official documentation; run that acceptance test with your own eligible account after deployment.
- Deploy the new migration and Worker before the new frontend/companion. Existing unredeemed magic links use the old plaintext representation and must be requested again. Existing JWT sessions remain valid for accounts that still exist.
- Cloudflare production migrations/deployment and real email delivery were not executed. Local SQLite tests do not substitute for a production D1 acceptance test.
- Hosted analysis remains best-effort background work within Cloudflare's execution lifecycle. A slow or interrupted run leaves checkpoints unchanged and can be retried. Large histories still load all entries for activation/extraction and have not been load-tested; extraction is capped at ten entries per job. A durable queue and large-history pagination are future production-scaling work.
- Physical mobile devices, motion-permission behavior, every browser/assistive-technology combination, long-duration performance, and all offline/storage-failure scenarios were not exhaustively tested. Browser tests and static diagnostics do not establish those guarantees.
- Framework activation is heuristic and generated reflections are interpretive; this audit does not establish psychological or clinical validity.
- Raw OAuth tokens must never be added to tests, diagnostics, committed files, frontend storage, or the hosted backend. Unix permissions protect local files; Windows uses DPAPI. Losing the credential file requires reconnecting, not importing another application's session.

This is a source audit and repair pass with targeted verification, not a claim that every possible defect has been eliminated.
