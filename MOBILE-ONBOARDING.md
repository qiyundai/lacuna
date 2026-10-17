# Mobile onboarding direction

The public URL must support a phone away from its owner's computer. The loopback companion remains an optional desktop integration, never a required phone onboarding step.

## Experience

Keep the existing pinned palette: ink #131010, ivory #f0e8dc, lavender #a4a4c2, moss #71816b. Keep the existing reading serif for the one clear heading and the existing serif for controls. Use a single, centered reading column, responsive to 320px, with the phone keyboard and scrolling accounted for. Avoid new cards or decorative widgets.

```
lacuna
Your words, wherever you are.
Saved encrypted in this browser. No installation.
Passphrase
Repeat passphrase
Create my private space
Restore a backup · Privacy
```

Returning users see one unlock field. Choosing a passphrase stays with the user. No preflight consent overlay is needed for local-only writing; AI sharing needs its own explicit permission if/when available. Explain that clearing site data can erase the only copy. Offer an encrypted backup and explicit restore. Do not promise a reset or cloud recovery.

Review: this follows Lacuna's established aesthetic instead of introducing another landing-page visual system. The one meaningful change is making the first screen a useful action on the current phone. Avoid a dead-end ChatGPT button or a link to localhost on the hosted site.

## Technical boundary

Browser-native AES-256-GCM and PBKDF2-HMAC-SHA256 (600,000 iterations, random salt) protect a versioned ciphertext envelope in IndexedDB. The passphrase/key are not persisted. IndexedDB updates compare the previous envelope's token in one read/write transaction; conflicting tabs cannot overwrite silently. Failures leave the previous ciphertext intact. The existing companion vault format and data must remain unchanged.

Hosted ChatGPT plan usage needs OpenAI registration/access, per the official OSS and website guides. The repository has a working local OSS registration, not a hosted registration. Do not claim hosted sign-in or inference is available until a registered client and supported hosted flow are configured and tested. The implementation proceeds with private writing first while clarification is pending, preserving desktop plan support. Browser AI and account sync remain explicitly unavailable.
