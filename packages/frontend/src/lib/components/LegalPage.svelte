<script lang="ts">
  import ReflectionPrivacy from './ReflectionPrivacy.svelte';
  let { kind, back }: { kind: 'privacy' | 'terms'; back?: () => void } = $props();
</script>
<div class="declaration">
  <nav aria-label="Return navigation">
    {#if back}<button class="atlas-link" onclick={back}>← Back to Lacuna</button>
    {:else}<a class="atlas-link" href="/">← Return to Lacuna</a>{/if}
  </nav>
  {#if kind === 'privacy'}
  <article>
    <header>
      <h1>Privacy at Lacuna</h1>
      <p class="opening">Your journal lives in your browser. You can write and read for free without an account. AI is off. You can choose to sync an encrypted copy across devices.</p>
      <p>Updated <time datetime="2026-11-24">November 24, 2026</time></p>
    </header>
    <section>
      <h2>Your journal on this device</h2>
      <p>Lacuna is for writers aged 13 and older. We don’t ask your age or date of birth. Your pages stay on this device unless you turn on encrypted sync or make a copy yourself. You can save an encrypted backup. Anyone with a readable export can open it.</p>
      <p>Your passphrase encrypts everything you write, along with your city and any saved reflections, before it is stored in this browser. Lacuna never receives your passphrase and cannot reset it. Keep it, and an encrypted backup, somewhere safe.</p>
      <p>The city’s buildings and details are drawn from your entries on this device. Lacuna processes ordinary writing, reading and searching locally. Extensions and third-party keyboards may independently access text while you type. The journal locks when you reload the page or after 15 minutes without activity.</p>
      <p>Sound, music and interface preferences are stored on this device outside the encrypted journal. None of it is included in backups or sync. The example city contains fictional pages that you can visit without creating a journal.</p>
    </section>
    <section>
      <h2>What reaches our servers</h2>
      <p>Cloudflare hosts Lacuna. When you open the app, Cloudflare receives ordinary web requests for the app, images, models and music, including your IP address. Lacuna has no advertising, analytics or tracking, and never requests GPS access. Cloudflare estimates the country and, in Canada, the province or territory from the connection IP to determine regional availability. The app receives an eligibility flag and remembers the most recent successful regional decision on this device for offline writing. Lacuna does not build a location history.</p>
      <p>If you turn on sync, only an encrypted copy of your journal reaches Lacuna. The city takes shape on your device.</p>
      <p>The operator can see service health and totals for paid access, sign-in requests, encrypted storage and AI costs. These come from the records needed to run the service. Reading or writing in your journal sends no activity report to the dashboard.</p>
    </section>
    <section>
      <h2>Optional encrypted sync</h2>
      <p>Sync is off until you turn it on. Turning it on creates a random pairing code on your device. Your browser uses that code to encrypt the already passphrase-protected journal a second time before uploading it. Your passphrase, pairing code and decryption keys stay on your devices, unless you save a recovery passkey.</p>
      <p>A <strong>recovery passkey</strong> is optional. It keeps the pairing code in the passkey manager you choose, such as iCloud Keychain, Google Password Manager or 1Password, so you can restore the journal after this browser’s data is cleared. That manager, and whoever can unlock it, holds the code. The passkey only works on this site, only after you confirm with your face, fingerprint or device PIN, and is never sent to Lacuna. It isn’t a sign-in: Lacuna has no account to attach it to. Restoring also needs your passphrase, so the passkey alone cannot open your pages. Deleting the online copy stops its recovery passkeys from working. You can remove a passkey in your passkey manager.</p>
      <p>In Journal settings → Privacy &amp; storage, choose <strong>Enable encrypted sync</strong>. On another device, choose <strong>Link a synced journal</strong> on the passphrase screen, then use your recovery passkey or enter the code. Keep the code private, because anyone who has it can delete the online copy. To read the copy, they would also need your passphrase.</p>
      <p>Lacuna stores the encrypted copy and its version number in Cloudflare’s database, filed under a one-way hash of the pairing code. It stores no name, email address or account details with it. The service can see how large each transfer is and when it happens. To limit abuse, it counts requests using a pseudonym derived from your IP address, which changes daily. The counts expire within a day. Even with access to the database, nobody can read your pages. A device that is unlocked, or a malicious app update, could still expose them.</p>
      <p><strong>Pause sync</strong> stops transfers on this device. The online copy and your other paired devices are not affected. <strong>Delete online copy</strong> removes the encrypted contents and keeps only a version marker, so an offline device can’t upload the journal again with the old code. Each device keeps its own local journal.</p>
      <p>Deleted data can remain in Cloudflare’s database recovery history for up to 30 days. <a href="https://developers.cloudflare.com/d1/reference/time-travel/" rel="noreferrer">Cloudflare’s backup documentation</a></p>
    </section>
    <section>
      <h2>Reflections is coming soon</h2>
      <ReflectionPrivacy/>
    </section>
    <section>
      <h2>Existing billing accounts</h2>
      <p>If you have a billing account, Lacuna stores your billing email, session, Stripe customer reference, paid access, consent and usage records. Resend delivers your sign-in code. Stripe handles billing details, payments and cancellation. You can <a href="/billing">manage or cancel billing and withdraw reflection permission</a> even when your journal is locked. Any saved readings stay in your journal. Deleting the journal does not cancel an existing subscription.</p>
    </section>
    <section>
      <h2>Your privacy choices</h2>
      <p>Qiyun Dai, Lacuna’s operator and privacy contact in British Columbia, is responsible for information handled by the service. Our providers may process information outside your province or country, including in the United States, where local authorities may lawfully request access.</p>
      <p>To request access, correction or deletion of account information, withdraw permission, or raise a privacy complaint, email <a href="mailto:qiyund@quietatlas.io">qiyund@quietatlas.io</a>. We can verify a billing account by email. Keep journal text and security codes out of your request. We cannot look up a local journal by name or email.</p>
    </section>
    <section>
      <h2>Backups and readable exports</h2>
      <p><strong>Download an encrypted backup</strong> saves a file you can restore in any browser with your original passphrase. Before restoring over an existing journal, Lacuna keeps an encrypted copy of it. A restored journal starts with sync off, so pair it again if you want to sync.</p>
      <p><strong>Export journal</strong> creates a readable Markdown or JSON file. Anyone who has the file can read your words, and later changes to your journal won’t change it.</p>
    </section>
    <section>
      <h2>Forgetting and deleting</h2>
      <p>Forgetting a page removes its words from the journal, along with anything drawn from them. Its place in the city remains. Downloads and backups you made earlier can still contain the words.</p>
      <p>Paired devices apply the change the next time they sync. An offline or paused device keeps the earlier words until then. When sync resolves a conflict, forgotten pages stay forgotten.</p>
      <p>Deleting a browser journal clears its encrypted journal, saved pairing code and the copies kept before restores. To remove the online copy as well, delete it in Privacy &amp; storage before you clear your last paired device. Downloaded files and journals on other devices have to be removed separately.</p>
    </section>
    <footer>
      <h2>About these protections</h2>
      <p>We test encryption, recovery and sync using disposable journals. Lacuna has not had an independent security audit. If we change how your data is handled, we will update this page and its date.</p>
      <p>You can inspect the <a href="https://github.com/qiyundai/lacuna" target="_blank" rel="noreferrer">source and release history</a>, published under the GNU Affero General Public License, version 3. For private account access or erasure requests, email <a href="mailto:qiyund@quietatlas.io">qiyund@quietatlas.io</a> from your billing address. We verify account control before acting. Expired sign-in codes and sessions are cleared by a scheduled job. Detailed usage is kept for 90 days. Stripe may retain billing records for financial obligations. Use <a href="https://github.com/qiyundai/lacuna/security/advisories/new" rel="noreferrer">private vulnerability reporting</a> for security reports. Please keep journal text, passphrases and pairing codes out of public reports.</p>
      <p><a href="/terms">Terms of Service</a></p>
      <p><a href="/city/harbor/credits.txt">Waterfront model credits</a></p>
    </footer>
  </article>
  {:else}
<article>
  <header><h1>Terms of Service</h1><p>November 24, 2026</p></header>
  <section><h2>Who you’re writing with</h2><p>Lacuna is operated by Qiyun Dai, doing business as Quiet Atlas Development, a sole proprietorship in British Columbia, Canada. For help, cancellation, refund requests or privacy questions, email <a href="mailto:qiyund@quietatlas.io">qiyund@quietatlas.io</a>.</p>
  <p>Lacuna is for writers aged 13 and older in the United States and Canada outside Québec. You can keep a free journal on this device and choose whether to turn on encrypted sync. Elsewhere you can explore the example city with fictional pages. An existing local journal can be read and exported while travelling.</p></section>
  <section><h2>Your writing</h2><p>You retain your rights to your writing. You give Lacuna permission to process it only to provide the features you choose. Please respect other people’s privacy and rights. Keep your passphrase and backups somewhere safe. Losing your passphrase can mean losing access to your journal.</p>
  <p>Writing, revisiting your city, backups, exports and optional encrypted sync are free. The <a href="/privacy">privacy notice</a> explains what your device, Lacuna and its service providers handle.</p></section>
  <section><h2>Reflections is coming soon</h2><p>Lacuna is free. New subscriptions and AI analysis are unavailable.</p></section>
  <section><h2>Existing subscriptions, cancellation and refunds</h2>
  <p>Use <a href="/billing">Manage billing</a> to cancel or contact us for help. You can manage billing while your journal is locked or while travelling. You can cancel renewal at any time without a cancellation fee. Ordinarily access continues through the paid period. Where a statutory refund applies, contact us to end access and receive the amount due. Saved readings stay in your journal. Deleting the journal or pausing AI sharing does not cancel billing.</p>
  <p>For BC subscriptions subject to the BC renewal rules, you may cancel before or after renewal. For annual renewals we must provide the required notice 30–60 days in advance. If you cancel after an annual renewal, we will refund the unused portion as prescribed within 15 days of your notice.</p>
  <p>Contact us about a refund, billing error or a statutory cancellation right. We honour the consumer protections and remedies that apply where you live.</p></section>
  <section><h2>Responsible use and changes</h2><p>Use Lacuna lawfully. Do not interfere with other people’s journals or misuse payment, sync or AI services. Contact us if you believe content infringes your rights. The software and creative assets have their own <a href="https://github.com/qiyundai/lacuna/blob/main/ASSETS.md">licences and credits</a>.</p>
  <p>We will date revisions and give any notice or request any agreement required for material changes. These terms preserve rights and remedies that applicable law gives you.</p></section>
</article>
  {/if}
</div>
<style>
  .declaration { height: 100%; overflow-y: auto; background: var(--paper); padding: var(--space-7) var(--gutter) var(--space-9); }
  article { max-width: 40rem; margin: 0 auto; color: var(--ink-muted); font: 400 var(--text-md)/var(--lh-prose) var(--font); letter-spacing: var(--ls-prose); }
  a { color: var(--accent); text-decoration-thickness: 1px; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); text-underline-offset: .3em; transition: color var(--dur-micro) var(--ease-soft), text-decoration-color var(--dur-micro) var(--ease-soft); }
  a:hover { color: var(--ink); text-decoration-color: currentColor; }
  header { margin: var(--space-4) 0 var(--space-8); }
  h1 { margin: var(--space-6) 0 var(--space-5); color: var(--ink); font: 400 var(--display-1)/var(--lh-display) var(--font); letter-spacing: var(--ls-display); text-wrap: balance; }
  .opening { font-size: var(--text-lg); color: var(--ink); text-wrap: pretty; }
  section { position: relative; margin: 0 0 var(--space-8); }
  h2 { margin: 0 0 var(--space-4); color: var(--ink); font: 400 var(--display-3)/var(--lh-heading) var(--font); letter-spacing: var(--ls-heading); }
  p { text-wrap: pretty; } p + p { margin-top: var(--space-4); }
  footer { padding-top: var(--space-4); font-size: var(--ui-sm); }
  nav { max-width:40rem; margin:auto; }
</style>
