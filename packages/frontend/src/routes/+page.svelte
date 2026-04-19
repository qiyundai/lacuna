<script lang="ts">
  import { swipeDetector } from '$lib/gesture.js';
  import Void from '$lib/components/Void.svelte';
  import DownSpace from '$lib/components/DownSpace.svelte';

  // 0 = void, -100 = down space (in vh units)
  let spaceOffset = $state(0);
  let transitioning = $state(false);

  function goDown() {
    if (transitioning || spaceOffset !== 0) return;
    transitioning = true;
    spaceOffset = -100;
    setTimeout(() => (transitioning = false), 650);
  }

  function goUp() {
    if (transitioning || spaceOffset !== -100) return;
    transitioning = true;
    spaceOffset = 0;
    setTimeout(() => (transitioning = false), 650);
  }
</script>

<div
  class="space-container"
  style="transform: translateY({spaceOffset}vh)"
  use:swipeDetector={{ onSwipeDown: goDown, onSwipeUp: goUp }}
>
  <div class="space-panel void-panel">
    <Void onSwipeDown={goDown} />
  </div>
  <div class="space-panel down-panel">
    <DownSpace onSwipeUp={goUp} />
  </div>
</div>

<style>
  .space-container {
    position: fixed;
    inset: 0;
    height: 200vh;
    transition: transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    will-change: transform;
  }

  .space-panel {
    position: absolute;
    width: 100%;
    height: 50%; /* 50% of 200vh = 100vh */
  }

  .void-panel {
    top: 0;
  }

  .down-panel {
    top: 50%;
  }
</style>
