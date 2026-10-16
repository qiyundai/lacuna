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
