<script lang="ts">
  function openAlbum() {
    const player = document.getElementById('soundtrack');
    if (player instanceof HTMLDialogElement) player.showModal();
  }
</script>

<button type="button" class="music-button" onclick={openAlbum} aria-label="Music" title="Music" aria-haspopup="dialog">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M8 17V6l11-2v11M8 9l11-2"/>
    <ellipse cx="5.5" cy="17.5" rx="2.5" ry="2"/><ellipse cx="16.5" cy="15.5" rx="2.5" ry="2"/>
  </svg>
</button>

<style>
  .music-button{display:inline-grid;place-items:center;min-width:44px;min-height:44px;padding:0;color:inherit;background:transparent;border:0;border-radius:50%;cursor:pointer}
  .music-button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
</style>
