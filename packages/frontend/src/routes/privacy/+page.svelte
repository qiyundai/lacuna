<script lang="ts">
  import IconAction from '$lib/components/IconAction.svelte';
  import Masthead from '$lib/components/Masthead.svelte';
</script>
<svelte:head>
  <title>Privacy, by choice Â· Lacuna</title>
  <meta name="description" content="How Lacuna protects your words: encrypted browser storage and local journaling." />
</svelte:head>
<Masthead><IconAction href="/" icon="back" label="Return to Lacuna"/></Masthead>
<main class="declaration">
  <article>
    <header>
      <h1>Privacy at Lacuna</h1>
      <p class="opening">Your words are yours. We work to protect them by keeping less, encrypting what we keep, and giving you a clear choice about what leaves your computer.</p>
    </header>
    <section>
      <h2>Your journal on this device</h2>
      <p>Your pages, city addresses, evidence, and memoir are encrypted in this browser with a key derived from your passphrase. Lacuna cannot recover a forgotten passphrase. Download an encrypted backup before clearing browser storage or changing devices.</p>
    </section>
    <section>
      <h2>AI reflections · Coming soon</h2>
      <p>You can write, revisit, export, and forget pages now. The Soul Map and Living Memoir are planned features. This release keeps journal pages in your browser and does not send them for AI analysis or offer a paid subscription.</p>
    </section>
    <section>
      <h2>Forgetting a page</h2>
      <p>Forgetting removes the original words, observations, and passages that drew on them from the active journal and its earlier tellings. Its address stays in the city. Independent passages remain readable. Earlier downloads, backups, and requests already sent to a provider can still contain the words.</p>
      <p>Deleting the journal clears the active browser vault and its local recovery copies.</p>
    </section>
    <footer>
      <span class="seed" aria-hidden="true">âœ§</span>
      <h2>Care is a practice.</h2>
      <p>We will keep improving these protections, test the boundaries, and describe changes plainly. Encryption does not make every part of an app private: devices, software updates, account access, and service providers still matter. This release has automated regression coverage and local browser checks; it has not had an independent security audit.</p>
      <p>Inspect the <a href="https://github.com/qiyundai/lacuna" target="_blank" rel="noreferrer">source and release history</a>. Please keep journal text and credentials out of public bug reports.</p>
      <a class="return" href="/">return to your space <span aria-hidden="true">â†—</span></a>
    <p><a href="/city/harbor/credits.txt">Waterfront model credits</a></p>
    </footer>
  </article>
</main>
<style>
  .declaration { height:calc(100% - var(--mast-height)); overflow-y: auto; background: var(--bg); padding: 3rem 1.5rem 6rem; }
  article { max-width: 64ch; margin: 0 auto; color: var(--void-text-dim); font-family: var(--font-reading); line-height: 1.95; letter-spacing: .015em; }
  a { color: var(--void-text); text-decoration-thickness: 1px; text-underline-offset: .3em; transition: color .3s ease; } a:hover { color: var(--moss); }
  header { margin: 1rem 0 4rem; }
  h1 { color: var(--void-text); font-weight: 400; font-size: clamp(2.4rem, 5vw, 3.8rem); line-height: 1.3; margin: 1.8rem 0 2rem; letter-spacing: -.025em; }
  .opening { font-size: 1.25rem; line-height: 1.85; margin-bottom: 2rem; } section { position: relative; margin: 0 0 5rem; }
  h2 { color: var(--void-text); font-size: 1.65rem; font-weight: 400; line-height: 1.5; margin: 0 0 1.5rem; } p + p { margin-top: 1.4rem; }
  footer { padding-top: 1rem; } footer .seed { display: block; margin-bottom: 2rem; } .return { display: inline-block; text-decoration: none; margin-top: 3rem; font-size: .95rem; }
  @media (max-width: 600px) { header { margin: .5rem 0 3rem; } article { font-size: .97rem; } section { margin-bottom: 4rem; } }
</style>
