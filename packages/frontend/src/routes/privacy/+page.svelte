<svelte:head>
  <title>Privacy, by choice · Lacuna</title>
  <meta name="description" content="How Lacuna protects your words: encrypted local storage, optional encrypted cloud sync, and a clear choice about AI sharing." />
</svelte:head>
<main class="declaration">
  <article>
    <a class="wordmark" href="/">lacuna</a>
    <header>
      <p class="eyebrow">our privacy declaration · release 0.3</p>
      <h1>A private space<br />should earn your trust.</h1>
      <p class="opening">Your words are yours. We work to protect them by keeping less, encrypting what we keep, and giving you a clear choice about what leaves your computer.</p>
      <p class="quiet">Updated 16 October 2026. These are the protections in this release, and the limits you should know.</p>
    </header>
    <section>
      <span class="number" aria-hidden="true">01</span>
      <h2>At home, under your key.</h2>
      <p>The local companion saves new thoughts, reflections, your concept map, and memoir editions in an encrypted file on your computer. The vault uses AES-256-GCM authenticated encryption. A long, unique passphrase derives the key with scrypt and a random salt. We do not receive or keep the passphrase or encryption key on our servers.</p>
      <p>The vault locks after 15 minutes without keyboard or pointer activity. Locking clears private application state and stops reflections; unsaved words disappear. While unlocked, readable content and the key are necessarily in local process memory.</p>
      <p class="aside">There is no vault password reset. Save your passphrase in a trusted password manager. A lost passphrase, lost device, or damaged file can mean losing your journal. “Download an encrypted backup” in privacy & storage makes a portable ciphertext file. Restore it from the lock screen with the same ChatGPT identity and passphrase.</p>
    </section>
    <section>
      <span class="number" aria-hidden="true">02</span>
      <h2>The cloud is a choice.</h2>
      <p>Encrypted cloud sync starts off. If you enable it, the companion uploads an encrypted vault to Lacuna’s Cloudflare D1 database after local changes. The server receives ciphertext, an account identifier, format information, file size, version, and update time. It does not receive the vault’s decryption key.</p>
      <p>Conflicting versions pause uploads instead of silently replacing another copy. Restoring requires the same ChatGPT identity and the vault passphrase. It disables AI sharing and sync on the receiving device and preserves an existing local copy as an encrypted backup. This release supports cloud copies of about 4.5 MB of journal data; larger journals remain local and an upload error is shown.</p>
      <p>Turning sync off stops future uploads. “Delete encrypted cloud copy” removes the active remote copy. It cannot erase backups immediately. Encrypted local conflict backups stay on that computer until you delete the account here or remove them yourself. This is a simple encrypted copy service, without live merging or a promise of seamless access across ChatGPT registrations.</p>
    </section>
    <section>
      <span class="number" aria-hidden="true">03</span>
      <h2>Signing in is not permission to read your journal.</h2>
      <p>ChatGPT verifies your identity. The companion and Lacuna’s server verify an OpenAI identity token to establish your account. The server keeps a pseudonymous identity mapping, consent time, and revocable sessions, rather than your display email. OpenAI access and refresh tokens remain in the companion’s credential store: protected by Windows DPAPI on Windows, and restricted file permissions on other systems. The public OpenAI client registration is retained so reconnecting does not create a new identity unnecessarily.</p>
      <p>The browser uses a separate HttpOnly, SameSite cookie. It never receives OpenAI credentials or the Lacuna bearer token. Server sessions expire after 12 hours, and sign-out revokes the current server session when the service is reachable. Signing out also locks the vault and removes credentials here; remote OpenAI revocation may need to be completed in ChatGPT settings if the provider is unavailable.</p>
    </section>
    <section>
      <span class="number" aria-hidden="true">04</span>
      <h2>AI sharing asks for a separate yes.</h2>
      <p>Journal sharing and automatic reflections both start off. You can write, search, keep, export, and delete thoughts without enabling reflections. If you allow AI sharing, requests go directly from the companion to OpenAI using your eligible ChatGPT plan.</p>
      <p>Context can include individual thoughts being analyzed, up to 20 recent thoughts for a reflection, accumulated concepts and range summaries, and a previous memoir when needed. Earlier summaries may represent older thoughts. OpenAI must receive readable context to generate a response. Generated material returns to the encrypted local vault.</p>
      <p>We send inference requests with <code>store: false</code>. That does not establish zero retention, erase context already sent, or override OpenAI’s terms and your account’s data controls. Review <a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer">OpenAI’s privacy policy</a> and your ChatGPT settings. Disabling sharing stops future journal inference and cancels work still running here.</p>
    </section>
    <section>
      <span class="number" aria-hidden="true">05</span>
      <h2>Older words deserve an honest transition.</h2>
      <p>Before this privacy release, Lacuna stored readable journals and generated material in its hosted database. Those existing records do not become encrypted simply because the software was updated.</p>
      <p>In privacy & storage, “move and verify my older cloud journal” downloads the authenticated account’s old data, writes an encrypted local vault, reads it back to verify it, and only then removes the active plaintext records. A version conflict leaves cloud records in place. Until you complete migration or delete that account, its old cloud records remain readable by the backend. Retired email accounts and different ChatGPT registrations are not automatically merged by email.</p>
      <p>New plaintext journal uploads and server-side AI result uploads are refused by the hosted API. Provider backup history can still contain older plaintext after migration. <a href="https://developers.cloudflare.com/d1/reference/time-travel/" target="_blank" rel="noreferrer">Cloudflare D1 Time Travel</a> keeps seven days of history on the free plan and 30 days on paid plans. We do not claim immediate, irreversible erasure from every backup.</p>
    </section>
    <section>
      <span class="number" aria-hidden="true">06</span>
      <h2>Less collection. Clearer exits.</h2>
      <p>This app has no advertising trackers or analytics SDK. It does not request location or contact a weather service. Ambient color follows your device’s clock. Cloudflare serves the hosted site and API and necessarily processes network metadata such as IP addresses. OpenAI processes sign-in and any AI requests you choose to make. Application login limits use rotating keyed IP pseudonyms; expired login challenges, rate-limit records, and server sessions are cleaned on subsequent requests.</p>
      <p>Local and API responses use no-store caching. Browser isolation headers restrict scripts, framing, and device permissions. The companion accepts only its own loopback host and origin for writes. These measures reduce exposure; they cannot protect a compromised computer or malicious browser extension.</p>
      <p>Exports are readable Markdown or JSON, outside the encrypted vault. Protect downloaded files yourself. Deleting the account from this companion removes active server account data and this computer’s vault and encrypted conflict backups. It does not delete exports, another device’s files, provider history, or requests already sent to OpenAI.</p>
    </section>
    <footer>
      <span class="seed" aria-hidden="true">✧</span>
      <h2>Care is a practice.</h2>
      <p>We will keep improving these protections, test the boundaries, and describe changes plainly. Encryption does not make every part of an app private: devices, software updates, account access, and service providers still matter. This release has automated regression coverage and local browser checks; it has not had an independent security audit.</p>
      <p>Inspect the <a href="https://github.com/qiyundai/lacuna" target="_blank" rel="noreferrer">source and release history</a>. Please keep journal text and credentials out of public bug reports.</p>
      <a class="return" href="/">return to your space <span aria-hidden="true">↗</span></a>
    </footer>
  </article>
</main>
<style>
  .declaration { position: fixed; inset: 0; overflow-y: auto; background: var(--bg); padding: 3rem 1.5rem 6rem; }
  article { max-width: 64ch; margin: 0 auto; color: var(--void-text-dim); font-family: var(--font-reading); line-height: 1.95; letter-spacing: .015em; }
  a { color: var(--void-text); text-decoration-thickness: 1px; text-underline-offset: .3em; transition: color .3s ease; } a:hover { color: var(--moss); }
  .wordmark { font-family: var(--font-serif); letter-spacing: .18em; text-decoration: none; }
  header { margin: 6rem 0 6rem; } .eyebrow, .quiet, .number { font-family: var(--font-serif); font-size: .78rem; color: var(--void-text-hint); }
  .eyebrow { letter-spacing: .08em; } h1 { color: var(--void-text); font-weight: 400; font-size: clamp(2.4rem, 5vw, 3.8rem); line-height: 1.3; margin: 1.8rem 0 2rem; letter-spacing: -.025em; }
  .opening { font-size: 1.25rem; line-height: 1.85; margin-bottom: 2rem; } section { position: relative; margin: 0 0 5rem; } .number { display: block; letter-spacing: .15em; margin-bottom: .7rem; }
  h2 { color: var(--void-text); font-size: 1.65rem; font-weight: 400; line-height: 1.5; margin: 0 0 1.5rem; } p + p { margin-top: 1.4rem; }
  .aside { color: var(--moss); } code { font-size: .85em; } footer { padding-top: 1rem; } footer .seed { display: block; margin-bottom: 2rem; } .return { display: inline-block; text-decoration: none; margin-top: 3rem; font-size: .95rem; }
  @media (max-width: 600px) { header { margin: 4rem 0; } article { font-size: .97rem; } section { margin-bottom: 4rem; } }
</style>
