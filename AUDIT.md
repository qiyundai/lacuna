# Project audit — 2026-10-16

Initial audit base: `https://github.com/qiyundai/lacuna.git`, live default branch `main`, commit `23154f7f719f1d7081c0220d43782ef411e42971`. The original checkout was clean and already included that commit. That source-audit phase preceded deployment. The resulting commit 05339abc was subsequently deployed with migration 0003.

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

## ChatGPT-only rebuild

The user could not receive email and requested ChatGPT-only authentication. The live authoritative default branch was rechecked at `05339abc898c5558fa31e3a775c1d225206c8f69` before this rebuild; the working branch included it.

- Removed the email form, email-token redemption, delivery integration, Anthropic analyzer, and provider fallback. Retired email endpoints return 410; old tokens are invalidated by migration 0004.
- Added consent-gated, throttled, expiring login challenges. The companion supplies the server nonce to OpenAI's PKCE flow. The Worker independently verifies OpenAI signature, issuer, issued-client audience, nonce, and token age before atomically consuming a challenge and issuing a Lacuna JWT.
- ChatGPT account identity uses issuer/client/subject. Matching emails cannot claim old accounts. Migration 0004 preserves old accounts, entries, and generated content while cancelling old analysis leases and selecting ChatGPT.
- Bound OAuth attempts and one-time session delivery to separate browser HttpOnly cookies. Browser session responses contain only Lacuna's session, never OAuth credentials.
- Access/refresh tokens remain in protected local storage. ID tokens reach the Worker only for verification and are not retained there. Disconnect retains a public client/subject registration so reconnecting can reach the same account.
- Identity-only authorization remains signed in even without plan-use scopes; inference reports missing permission and offers reconnection. Account-available models and a small, explicit connection test are exposed in settings.
- Hosted storage remains authoritative. New sign-ins and inference use the loopback companion; existing hosted sessions can still read/write. A hosted OpenAI callback is not registered.
- Removed the obsolete email-based browser fixture. The earlier audit's fixture validation covered privacy acknowledgment, failed-save retention, retry, timeline, and overlays.

The flow follows [OpenAI's OSS sign-in documentation](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) and [model/inference contract](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

## Verification

The regression suite executes actual migrations and route SQL against disposable SQLite with D1-style atomic batches. Coverage includes validation, retired email links, challenge consent/expiry, signed identity/audience/nonce/issuer checks, concurrent replay rejection, browser isolation, email-collision isolation, returning identity stability, deletion cascades, account/JWT isolation, idempotent entries, pagination, analysis leases/version guards, failure checkpoints, graph validation, PKCE, refresh rotation, SSE failures/limits, credential protection, logout races, Unicode, gestures, and complete companion-to-Worker sign-in/inference round trips with simulated OpenAI.

Checks for this rebuild: 26 regression tests passed; Svelte diagnostics and Worker type checks passed. Production build and deployment results are recorded in the release conversation.

## Remaining limits

- Real OAuth consent, account eligibility, model entitlements, inference, and revocation require human-account acceptance testing. Simulated tests do not establish those results.
- Public OSS registration is bound to a stable host/client registration. A fresh registration on another computer can yield a separate identity. Cross-device account transfer/linking and migration from inaccessible email accounts are not implemented; no automatic email linking is safe.
- Remote migrations run through CI before Worker/Pages deployment. Keep the companion build aligned with the deployed Worker.
- Companion lifetime and loading all retained entries remain scaling constraints. Extraction is bounded to ten entries per job; large histories have not been load-tested. Failed work leaves checkpoints unchanged and can be retried.
- Physical mobile devices, every browser/assistive-technology combination, long-duration performance, and every offline/storage-failure scenario were not exhaustively tested.
- Generated psychological reflections are interpretive; this audit does not establish clinical validity.

This is a source audit and repair pass with targeted verification, not a claim that every possible defect has been eliminated.

## Story expansion — 2026-10-16

Verified live `main` at `963d1501ed2a56b424c4a51af2b674efa4e4f830` before implementation and again before release builds. Added a month-grouped archive with full-history search, kept thoughts, a full-screen thought reader with explicit deletion confirmation, a concept constellation with type filters and the existing six lenses, memoir edition history and reading size, and Markdown/JSON export. Migration 0005 adds the private kept marker and an index for kept thoughts.

New APIs are authenticated and account scoped. Search uses bound literal matching and the existing compound cursor. Kept markers leave analysis versions unchanged. Same-second memoir editions paginate by timestamp and insertion order. Export excludes authentication and credentials and is throttled. Graph validation now rejects malformed persisted shapes; inconsistent extraction checkpoints rebuild from original entries. Sign-out clears the new story state and rejects late responses from the previous account.

Verification: 29 regression tests passed, including filtered pagination, foreign cursors, kept-marker ownership/validation, export content/privacy/rate limits, memoir ordering, corrupt graph recovery, and story-state isolation. Svelte diagnostics report zero errors/warnings; Worker types pass. Browser QA used 32 synthetic thoughts and three memoir editions in a separate local database. Verified full-history search, kept-marker persistence, thought reading, constellation selection, earlier memoir reading, a 390px phone viewport, and an actual Markdown download containing sample thoughts and memoirs. The browser download-event observer stalled, but the downloaded file was independently confirmed on disk. No production entries were used for those checks.

Release build and deployment results are reported in the release conversation. The earlier ChatGPT-only release already passed human-account sign-in and live inference; this expansion does not change OAuth scopes or introduce another AI provider. Existing large-history and cross-device identity limitations still apply.

## Privacy release 0.3 — 2026-10-16

Verified the authoritative live default branch `main` at `0e2ed36729d2368fe3227eafc9a6d743120bfffc` before implementation and again before release. This release replaces new hosted plaintext journal writes with a companion-owned encrypted local vault. It uses AES-256-GCM and scrypt with a user-held passphrase; keys are not uploaded or persisted. Writes serialize and atomically replace a synced encrypted file. Locking cancels inference and clears UI state; a lock during asynchronous unlock cannot reopen the vault. Failed saves preserve the previous file. Idempotent retries retain their original thought/timestamp.

Cloud sync is an explicit opt-in, with account-scoped opaque envelopes, conditional versions, atomic ciphertext chunks below D1 row limits, and delete tombstones. Upload errors leave local saves intact. Encrypted file backups provide recovery without cloud sync. Explicit restore preserves an encrypted local conflict backup and resets AI/sync permissions. Legacy migration encrypts and reads back a durable local copy before a version-guarded transaction removes active plaintext entries and derived data; other accounts remain intact. Old inaccessible accounts and provider backup history are disclosed rather than silently purged.

The browser no longer receives/persists bearer tokens. A port-specific HttpOnly/SameSite cookie maps to a hashed ID in protected local credentials; the server token has a 12-hour revocable session ID. Existing pre-release JWTs are refused. ChatGPT display email is removed from the backend identity mapping. Login IP buckets use daily keyed pseudonyms, and expired auth/rate records are cleaned on subsequent requests. Local browser generation checks prevent old failed requests from signing out or locking a newer account.

Journal inference and automatic inference default off and require separate explicit consent. Context travels directly to OpenAI, not Lacuna's backend. Opt-out/lock/deletion stops running work; stale results cannot restore deleted material. Location/weather requests are removed, including their cache. Pages/companion add CSP bootstrap hashes/nonces, framing and device-permission restrictions, and no-referrer. The public `/privacy` declaration, consent summary, export warning, and deletion confirmation explain actual storage, readable AI context, key loss, legacy data, and provider retention limits.

Verification: 41 regression tests pass, including real HTTP companion/API sign-in and inference with simulated OpenAI, encrypted local/remote storage, wrong keys/tampering, lock/unlock races, local-write failures, multi-megabyte chunking/transaction rollback, legacy migration guards, identity separation, revocation, and no-network ambient color. Svelte reports zero errors/warnings; Worker types pass. Frontend/companion builds succeed, and dependency audits report no known advisories. Disposable browser QA verifies unlock, a sharing-off save (33 thoughts), privacy controls, locking, public declaration access, and an actual encrypted download/file restore with the same 33 thoughts and sharing still off. The downloaded envelope contains no readable sample thought. The file picker was slow, but recovery completed without browser errors. The release conversation records deployment results.

This is a source and regression-tested privacy release, not an independent security audit. See [PRIVACY-ARCHITECTURE.md](./PRIVACY-ARCHITECTURE.md) for remaining trust boundaries. Real vault setup still requires its owner to choose and privately enter a passphrase. Legacy plaintext is not claimed to be gone until that owner's verified migration completes.

## Phone onboarding release 0.4 — 2026-10-16

Verified the live authoritative `main` at `b3f5a5ae9794cb873e0f1c23edb51316fc811c5e`. The public website now supports encrypted browser-local writing without account creation, email delivery, a local callback, or a desktop installation. Returning users unlock one passphrase field. The companion's existing vault/account path remains separate and intact.

New browser modules use native Web Crypto AES-256-GCM/PBKDF2 with a user-held passphrase, non-extractable memory-only key, and ciphertext-only IndexedDB records. Atomic envelope comparison prevents silent concurrent-tab overwrite. Failed saves preserve the previous copy; lock/reload clears private state, and manual lock/delete/restore notify other tabs. Explicit restores retain encrypted recovery copies with a download path. Browser downloads clearly distinguish ciphertext backups from readable exports. Browser site-data loss/private browsing/eviction and the absence of reset/cloud recovery are disclosed at onboarding and in the declaration.

The hosted app no longer sends users to localhost or displays unavailable memoir/map views as though they will populate with more thoughts. It explicitly reports that browser ChatGPT/account sync are not configured. OpenAI's official remotely hosted app registration path is a remaining external prerequisite; no end-user credential, callback restriction, or token-storage policy is bypassed to hide that requirement.

Verification includes 46 regression tests, clean Svelte/Worker diagnostics, frontend/companion builds, and disposable Chrome QA at 390×844. Real IndexedDB transactions reject competing writes and preserve a downloadable encrypted copy before restore. UI checks confirm save/reload/archive, accurate browser-only storage controls, and one manual lock clearing both open tabs. New tests cover ciphertext-only persistence/reopen without fetch, wrong keys/tampering, pending unlock cancellation, quota failure, concurrent writes, backup restore/deletion, search/kept markers, and save retries. Final deployment evidence is recorded in the release conversation. No production journal was read or used as a test fixture.
