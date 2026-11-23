<script lang="ts">
  import IconAction from '$lib/components/IconAction.svelte';
  import Masthead from '$lib/components/Masthead.svelte';
</script>
<svelte:head>
  <title>Privacy at Lacuna</title>
  <meta name="description" content="Where Lacuna stores your journal, what encrypted sync shares, and how to remove your copies." />
</svelte:head>
<Masthead><IconAction href="/" icon="back" label="Return to Lacuna"/></Masthead>
<main class="declaration">
  <article>
    <header>
      <h1>Privacy at Lacuna</h1>
      <p class="opening">Your journal lives in your browser. You can write and read without an account. You choose whether to sync an encrypted copy or share excerpts for AI reflections.</p>
      <p>Updated <time datetime="2026-11-23">November 23, 2026</time></p>
    </header>
    <section>
      <h2>Your journal on this device</h2>
      <p>Your passphrase encrypts everything you write, along with your city and any saved reflections, before it is stored in this browser. Lacuna never receives your passphrase and cannot reset it. Keep it, and an encrypted backup, somewhere safe.</p>
      <p>The city’s buildings and details are drawn from your entries on this device. Ordinary writing, reading and searching never leave it. The journal locks when you reload the page or after 15 minutes without activity.</p>
      <p>Sound, music and interface preferences are stored on this device outside the encrypted journal. None of it is included in backups or sync. The example city is a sample journal, and changes you make there are discarded when you leave.</p>
    </section>
    <section>
      <h2>What reaches our servers</h2>
      <p>Cloudflare hosts Lacuna. When you open the app, Cloudflare receives ordinary web requests for the app, images, models and music, including your IP address. Lacuna has no advertising, analytics or tracking, and it never requests your location.</p>
      <p>Encrypted sync sends a protected copy to Lacuna. AI reflections use a separate service that handles readable excerpts with your permission.</p>
    </section>
    <section>
      <h2>Optional encrypted sync</h2>
      <p>Sync is off until you turn it on. Turning it on creates a random pairing code on your device. Your browser uses that code to encrypt the already passphrase-protected journal a second time before uploading it. Your passphrase, pairing code and decryption keys stay on your devices.</p>
      <p>In Journal settings → Privacy &amp; storage, choose <strong>Enable encrypted sync</strong>. On another device, choose <strong>Link a synced journal</strong> on the passphrase screen. Keep the code private, because anyone who has it can delete the online copy. To read the copy, they would also need your passphrase.</p>
      <p>Lacuna stores the encrypted copy and its version number in Cloudflare’s database, filed under a one-way hash of the pairing code. It stores no name, email address or account details with it. The service can see how large each transfer is and when it happens. To limit abuse, it counts requests using a pseudonym derived from your IP address, which changes daily. The counts expire within a day. Even with access to the database, nobody can read your pages. A device that is unlocked, or a malicious app update, could still expose them.</p>
      <p><strong>Pause sync</strong> stops transfers on this device. The online copy and your other paired devices are not affected. <strong>Delete online copy</strong> removes the encrypted contents and keeps only a version marker, so an offline device can’t upload the journal again with the old code. Each device keeps its own local journal.</p>
      <p>Deleted data can remain in Cloudflare’s database recovery history for up to 30 days. <a href="https://developers.cloudflare.com/d1/reference/time-travel/" rel="noreferrer">Cloudflare’s backup documentation</a></p>
    </section>
    <section>
      <h2>Optional AI reflections</h2>
      <p>Where subscriptions are available, Lacuna stores your billing email, session, Stripe customer reference, paid access, consent and usage records. Resend handles your email address and sign-in code. Stripe handles checkout, billing address, applicable taxes, payments and cancellation.</p>
      <p>After subscribing, you can allow reflections on an unlocked journal. Lacuna then forwards selected past and future pages, their dates, page identifiers and related reading notes to OpenAI. Lacuna returns the result to your browser for encrypted storage. Its database records usage and cost without storing those excerpts or readings. Requests use OpenAI’s storage opt-out. <a href="https://developers.openai.com/api/docs/guides/your-data" rel="noreferrer">OpenAI’s API data controls and retention</a></p>
      <p>Pause reflections in Journal settings to stop new requests. You can manage or cancel your subscription there. Saved readings remain in your journal. Deleting your browser journal does not cancel billing.</p>
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
      <p>You can inspect the <a href="https://github.com/qiyundai/lacuna" target="_blank" rel="noreferrer">source and release history</a>, published under the GNU Affero General Public License, version 3. Questions and reports are welcome there. Please keep journal text, passphrases and pairing codes out of public reports.</p>
      <a class="return" href="/">Return to your space <span aria-hidden="true">←</span></a>
      <p><a href="/city/harbor/credits.txt">Waterfront model credits</a></p>
    </footer>
  </article>
</main>
<style>
  .declaration { height: calc(100% - var(--mast-height)); overflow-y: auto; background: var(--paper); padding: var(--space-7) var(--gutter) var(--space-9); }
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
  .return { display: inline-flex; align-items: center; min-height: var(--control); margin-top: var(--space-7); font-size: var(--ui-md); }
</style>
