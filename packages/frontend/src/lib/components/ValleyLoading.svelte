<script lang="ts">
  let {label,onExit}:{label:string;onExit?:()=>void}=$props();
</script>

<div class="valley-loading">
  <span class="imprint" aria-hidden="true">Lacuna</span>
  <span class="opening" role="status">{label}</span>
  <progress aria-label={label}></progress>
  {#if onExit}<button onclick={onExit}>Leave visit</button>{/if}
</div>

<style>
  button{position:absolute;right:var(--gutter);top:1rem;min-height:44px;padding:0 .7rem;background:transparent;color:inherit;font:inherit;border:0;text-decoration:underline;text-underline-offset:.25em;cursor:pointer}
</style>
