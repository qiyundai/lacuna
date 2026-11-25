<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';
  /*
   * A labelled round scene control. `tone` picks the scene-control variant
   * (see components.css). `pressed` makes it a toggle: when false the glyph
   * is struck through and the caption reads "off". `labelled` keeps the
   * caption visible on touch screens, where there is no hover to reveal it.
   */
  const unreadId=$props.id();
  let {icon,label,href,onclick,disabled=false,unread=false,current,controls,expanded,pressed,tone='wash',labelled=true}:{
    icon:IconName; label:string; href?:string; onclick?:()=>void; disabled?:boolean;
    unread?:boolean; current?:'page'; controls?:string; expanded?:boolean; pressed?:boolean; tone?:'wash'|'solid'|'raised'; labelled?:boolean
  }=$props();
</script>

{#snippet face()}
  {#if unread}<i class="unread-postcard" aria-hidden="true"></i><span id={unreadId} class="visually-hidden">Unread postcard</span>{/if}
  <Icon name={icon} off={pressed===false}/>
  <span class="scene-caption" aria-hidden="true">{label}{#if pressed!==undefined}<span class="state">{pressed?'on':'off'}</span>{/if}</span>
{/snippet}
{#if href}
  <a class="scene-control" class:labelled class:solid={tone==='solid'} class:raised={tone==='raised'} {href} aria-label={label} aria-current={current}>{@render face()}</a>
{:else}
  <button type="button" class="scene-control" class:labelled class:solid={tone==='solid'} class:raised={tone==='raised'} {onclick} {disabled}
    aria-label={label} aria-describedby={unread?unreadId:undefined} aria-current={current} aria-controls={controls} aria-expanded={expanded} aria-pressed={pressed}>{@render face()}</button>
{/if}

<style>
  [aria-current=page]::after{content:'';position:absolute;bottom:5px;width:5px;height:2px;border-radius:2px;background:currentColor}
  [aria-pressed=false] > :global(.icon){opacity:.7}
</style>
