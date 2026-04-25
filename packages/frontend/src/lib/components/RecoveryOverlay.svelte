<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { requestEmailOTP, verifyEmailOTP, verifyRecoveryCode } from '$lib/auth.js';

  let {
    onSuccess,
    onClose,
  }: {
    onSuccess: (user: { id: string }, newRecoveryCode?: string) => void;
    onClose: () => void;
  } = $props();

  type Step = 'choose' | 'email-enter' | 'email-code' | 'recovery-code' | 'new-code';
  let step = $state<Step>('choose');

  let email = $state('');
  let otpCode = $state('');
  let recoveryCodeInput = $state('');
  let newCode = $state('');
  let error = $state('');
  let loading = $state(false);
  let newCodeCopied = $state(false);

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function reset() {
    step = 'choose';
    email = '';
    otpCode = '';
    recoveryCodeInput = '';
    error = '';
    loading = false;
  }

  async function sendEmailCode() {
    if (!email.trim() || loading) return;
    loading = true;
    error = '';
    try {
      await requestEmailOTP(email.trim().toLowerCase());
      step = 'email-code';
    } catch {
      error = 'something went wrong';
    } finally {
      loading = false;
    }
  }

  async function submitOTP() {
    if (!otpCode.trim() || loading) return;
    loading = true;
    error = '';
    try {
      const user = await verifyEmailOTP(email.trim().toLowerCase(), otpCode.trim());
      onSuccess(user);
    } catch {
      error = 'invalid or expired code';
      loading = false;
    }
  }

  async function submitRecoveryCode() {
    if (!recoveryCodeInput.trim() || loading) return;
    loading = true;
    error = '';
    try {
      const result = await verifyRecoveryCode(recoveryCodeInput.trim());
      newCode = result.newRecoveryCode;
      step = 'new-code';
      // Pass success to parent but keep overlay open to show new code
      onSuccess({ id: result.id }, result.newRecoveryCode);
    } catch {
      error = 'invalid recovery code';
      loading = false;
    }
  }

  async function copyNewCode() {
    await navigator.clipboard.writeText(newCode);
    newCodeCopied = true;
    setTimeout(() => { newCodeCopied = false; }, 2000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (step !== 'choose') { reset(); return; }
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  use:portal
  class="screen-overlay"
  transition:fade={{ duration: 400, easing: cubicOut }}
  role="dialog"
  aria-modal="true"
  aria-label="Recover access"
>
  <button class="backdrop" onclick={onClose} aria-label="Close" tabindex="-1"></button>

  <div class="content">
    {#if step === 'choose'}
      <p class="heading">recover access</p>
      <div class="options">
        <button class="option" onclick={() => { step = 'email-code-enter'; step = 'email-enter'; error = ''; }}>
          send a code to my email
        </button>
        <button class="option" onclick={() => { step = 'recovery-code'; error = ''; }}>
          use my recovery code
        </button>
      </div>
      <button class="back" onclick={onClose}>back</button>

    {:else if step === 'email-enter'}
      <p class="heading">your recovery email</p>
      <input
        class="field"
        type="email"
        placeholder="email address"
        bind:value={email}
        autocomplete="email"
        autocapitalize="none"
        spellcheck={false}
        onkeydown={(e) => e.key === 'Enter' && sendEmailCode()}
      />
      {#if error}<p class="error">{error}</p>{/if}
      <button class="action" onclick={sendEmailCode} disabled={loading || !email.trim()}>
        {loading ? '·····' : 'send code'}
      </button>
      <button class="back" onclick={reset}>back</button>

    {:else if step === 'email-code'}
      <p class="heading">check your email</p>
      <p class="sub">a 6-digit code was sent to {email}</p>
      <input
        class="field field-code"
        type="text"
        inputmode="numeric"
        placeholder="000000"
        maxlength={6}
        bind:value={otpCode}
        autocomplete="one-time-code"
        onkeydown={(e) => e.key === 'Enter' && submitOTP()}
      />
      {#if error}<p class="error">{error}</p>{/if}
      <button class="action" onclick={submitOTP} disabled={loading || otpCode.trim().length < 6}>
        {loading ? '·····' : 'verify'}
      </button>
      <button class="back" onclick={reset}>back</button>

    {:else if step === 'recovery-code'}
      <p class="heading">recovery code</p>
      <input
        class="field field-code field-recovery"
        type="text"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        bind:value={recoveryCodeInput}
        autocomplete="off"
        spellcheck={false}
        onkeydown={(e) => e.key === 'Enter' && submitRecoveryCode()}
      />
      {#if error}<p class="error">{error}</p>{/if}
      <button class="action" onclick={submitRecoveryCode} disabled={loading || !recoveryCodeInput.trim()}>
        {loading ? '·····' : 'enter'}
      </button>
      <button class="back" onclick={reset}>back</button>

    {:else if step === 'new-code'}
      <p class="heading">save your new recovery code</p>
      <p class="sub">your old code is no longer valid. save this one.</p>
      <button class="code-block" onclick={copyNewCode} aria-label="Copy new recovery code">
        <span class="code-text">{newCode}</span>
        <span class="copy-hint">{newCodeCopied ? 'copied' : 'tap to copy'}</span>
      </button>
      <button class="action" onclick={onClose}>done</button>
    {/if}
  </div>
</div>

<style>
  .screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: none;
    padding: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }

  .content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    max-width: 340px;
    padding: 0 var(--space-6);
    text-align: center;
  }

  .heading {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    letter-spacing: var(--ls-label);
    margin: 0;
  }

  .sub {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-ui);
    line-height: var(--lh-prose);
    margin: 0;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    width: 100%;
  }

  .option {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    cursor: pointer;
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-ui);
    padding: var(--space-2) 0;
    transition: color var(--dur-base) var(--ease-soft);
  }

  .option:hover,
  .option:focus {
    color: var(--void-text);
    outline: none;
  }

  .field {
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-prose);
    outline: none;
    padding: var(--space-2) 0;
    text-align: center;
    width: 100%;
    transition: border-color var(--dur-base) var(--ease-soft);
  }

  .field:focus {
    border-bottom-color: rgba(255, 255, 255, 0.4);
  }

  .field::placeholder {
    color: var(--void-text-faint);
  }

  .field-code {
    font-size: var(--text-lg);
    letter-spacing: 0.2em;
  }

  .field-recovery {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-display);
    text-transform: uppercase;
  }

  .action {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    cursor: pointer;
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-label);
    padding: var(--space-2) var(--space-4);
    transition: color var(--dur-base) var(--ease-soft);
  }

  .action:hover:not(:disabled),
  .action:focus:not(:disabled) {
    color: var(--void-text);
    outline: none;
  }

  .action:disabled {
    color: var(--void-text-faint);
    cursor: default;
  }

  .back {
    background: transparent;
    border: none;
    color: var(--void-text-hint);
    cursor: pointer;
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    padding: var(--space-2) 0;
    transition: color var(--dur-base) var(--ease-soft);
  }

  .back:hover,
  .back:focus {
    color: var(--void-text-dim);
    outline: none;
  }

  .error {
    color: var(--void-danger);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    margin: 0;
  }

  .code-block {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-6);
    transition: border-color var(--dur-base) var(--ease-soft);
    width: 100%;
  }

  .code-block:hover,
  .code-block:focus {
    border-color: rgba(255, 255, 255, 0.28);
    outline: none;
  }

  .code-text {
    color: var(--void-text);
    font-family: var(--font-mono);
    font-size: var(--text-md);
    letter-spacing: var(--ls-display);
  }

  .copy-hint {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
  }
</style>
