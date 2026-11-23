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
      <p class="opening">Your browser journal starts on this device. You choose whether to keep an encrypted copy online and which devices can open it.</p>
      <p>Updated <time datetime="2026-11-22">November 22, 2026</time></p>
    </header>
    <section>
      <h2>Your journal on this device</h2>
      <p>You can write without an account. Your browser encrypts your pages, city addresses and any saved reflections using your journal passphrase. It also uses your entries on this device to give buildings details. Lacuna cannot reset your passphrase.</p>
      <p>Cloudflare serves the app, images and music and receives ordinary web requests, including your IP address, when you load them. Imported music and playback preferences are stored separately on this device. Journal sync excludes them.</p>
    </section>
    <section>
      <h2>Optional encrypted sync</h2>
      <p>Sync starts off. Enabling it creates a random pairing code on your device. Your browser uses that code to encrypt the passphrase-protected vault a second time before uploading it. Your passphrase, pairing code and decryption keys stay on your devices. You can sync without an email address.</p>
      <p>In Journal settings → Privacy &amp; storage, choose <strong>Enable encrypted sync</strong>. On another device, choose <strong>Link a synced journal</strong> from the passphrase screen. Keep the code private. Anyone with it can delete the online copy. Opening that copy also requires your original passphrase.</p>
      <p>Lacuna stores the encrypted copy and its version in Cloudflare’s database under a pseudonymous identifier. The service sees transfer size and timing. It uses an identifier derived from your IP address that changes daily to limit requests. Even someone with access to the database cannot read your pages from it. An unlocked device or a malicious app update could still expose them.</p>
      <p><strong>Pause sync</strong> stops transfers on this device. The online copy and other paired devices remain active. <strong>Delete online copy</strong> removes the encrypted contents and leaves a version marker so an offline device cannot upload them again under the old code. Each device keeps its local journal.</p>
      <p>Deleted data can remain in Cloudflare’s database recovery history for 7 days on its Free plan or 30 days on its Paid plan. <a href="https://developers.cloudflare.com/d1/reference/time-travel/" rel="noreferrer">Cloudflare’s backup documentation</a></p>
    </section>
    <section>
      <h2>AI reflections · Coming soon</h2>
      <p>The Soul Map and Living Memoir are coming soon. This release sends no journal pages for AI analysis. Enabling sync gives permission to store encrypted data only.</p>
    </section>
    <section>
      <h2>Backups and readable exports</h2>
      <p><strong>Download an encrypted backup</strong> saves a file you can restore in another browser with your original passphrase. A file restore keeps a recovery copy of any journal it replaces. Pair the restored journal separately if you want to sync again.</p>
      <p><strong>Export journal</strong> creates a readable Markdown or JSON file. Anyone who can open it can read your words. Later changes to your journal cannot change a file you already downloaded.</p>
    </section>
    <section>
      <h2>Forgetting a page</h2>
      <p>Forgetting removes the original words, observations, and passages that drew on them from the active journal and its earlier tellings. Its address stays in the city. Independent passages remain readable. Earlier downloads, backups, and requests already sent to a provider can still contain the words.</p>
      <p>A paired device receives the change when it next syncs successfully. An offline or paused device can still hold the earlier words. Resolving a sync conflict preserves forgotten addresses.</p>
      <p>Deleting a browser journal clears its local vault, saved pairing code and local recovery copies. To remove the online copy too, delete it in Privacy &amp; storage before clearing the last paired device. Remove downloaded files and other devices’ copies separately.</p>
    </section>
    <section>
      <h2>If you use the desktop companion</h2>
      <p>The separate companion signs you in with ChatGPT. Lacuna verifies your identity token. The companion encrypts your journal on your computer and offers an optional encrypted cloud copy tied to that identity. Restoring a companion backup requires the same identity and the original passphrase. Browser pairing codes work only with browser journals.</p>
      <p>Some earlier releases stored readable journal records on the server. If you have one of those journals, Privacy &amp; storage in the companion offers migration. It verifies the encrypted local copy before removing the active legacy records. Provider backup history can retain the earlier readable records until it expires.</p>
    </section>
    <footer>
      <h2>About these protections</h2>
      <p>We test encryption, recovery and sync using disposable journals. Lacuna has not had an independent security audit.</p>
      <p>Inspect the <a href="https://github.com/qiyundai/lacuna" target="_blank" rel="noreferrer">source and release history</a>. Please keep journal text and credentials out of public bug reports.</p>
      <a class="return" href="/">Return to your space <span aria-hidden="true">←</span></a>
      <p><a href="/city/harbor/credits.txt">Waterfront model credits</a></p>
    </footer>
  </article>
</main>
<style>
  .declaration { height:calc(100% - var(--mast-height)); overflow-y: auto; background: var(--paper); padding: 3rem 1.5rem 6rem; }
  article { max-width: 64ch; margin: 0 auto; color: var(--ink-muted); font-family: var(--font); line-height: 1.95; letter-spacing: .015em; }
  a { color: var(--ink); text-decoration-thickness: 1px; text-underline-offset: .3em; transition: color .3s ease; } a:hover { color: var(--moss); }
  header { margin: 1rem 0 4rem; }
  h1 { color: var(--ink); font-weight: 400; font-size: clamp(2.4rem, 5vw, 3.8rem); line-height: 1.3; margin: 1.8rem 0 2rem; letter-spacing: -.025em; }
  .opening { font-size: 1.25rem; line-height: 1.85; margin-bottom: 2rem; } section { position: relative; margin: 0 0 5rem; }
  h2 { color: var(--ink); font-size: 1.65rem; font-weight: 400; line-height: 1.5; margin: 0 0 1.5rem; } p + p { margin-top: 1.4rem; }
  footer { padding-top: 1rem; } .return { display: inline-block; text-decoration: none; margin-top: 3rem; font-size: .95rem; }
  @media (max-width: 600px) { header { margin: .5rem 0 3rem; } article { font-size: .97rem; } section { margin-bottom: 4rem; } }
</style>
