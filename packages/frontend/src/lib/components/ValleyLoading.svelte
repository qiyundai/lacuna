<script lang="ts">
  import SoundToggle from './SoundToggle.svelte';
  /* Base look lives in static/city/arrival.css so the pre-hydration screen matches. */
  let {label,onExit,audio=false}:{label:string;onExit?:()=>void;audio?:boolean}=$props();
</script>

<div class="valley-loading">
  {#if onExit || audio}
    <!-- Shares the masthead's row so controls don't jump when the city appears -->
    <div class="bar captions-below">
      {#if onExit}<button class="leave" onclick={onExit}>Leave visit</button>{/if}
      {#if audio}<SoundToggle/>{/if}
    </div>
  {/if}
  <span class="imprint" aria-hidden="true">Lacuna</span>
  <span class="opening" role="status">{label}</span>
  <progress aria-label={label}></progress>
</div>

<style>
  .bar{position:absolute;inset:0 0 auto;height:var(--mast-height);padding-inline:var(--gutter);display:flex;align-items:center;justify-content:flex-end;gap:var(--control-gap)}
  .leave{min-height:var(--control);padding:0 var(--space-2);background:transparent;color:inherit;font:400 var(--ui-md) var(--font);border:0;text-decoration:underline;text-underline-offset:.25em;cursor:pointer}
  .leave:focus-visible{outline-color:var(--scene-focus)}
</style>
