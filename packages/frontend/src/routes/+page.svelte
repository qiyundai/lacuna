<script lang="ts">
  import { swipeDetector } from '$lib/gesture.js';
  import Void from '$lib/components/Void.svelte';
  import DownSpace from '$lib/components/DownSpace.svelte';

  let inDownSpace = $state(false);
  let transitioning = $state(false);

  function goDown() {
    if (transitioning || inDownSpace) return;
    transitioning = true;
    inDownSpace = true;
    setTimeout(() => (transitioning = false), 650);
  }

  function goUp() {
    if (transitioning || !inDownSpace) return;
    transitioning = true;
    inDownSpace = false;
    setTimeout(() => (transitioning = false), 650);
  }
</script>

<div
  class="space-container"
  class:down={inDownSpace}
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
    height: 200dvh;
    transition: transform 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    will-change: transform;
  }

  .space-container.down {
    transform: translateY(-50%);
  }

  .space-panel {
    position: absolute;
    width: 100%;
    height: 50%; /* 50% of 200dvh = 100dvh */
  }

  .void-panel {
    top: 0;
  }

  .down-panel {
    top: 50%;
  }
</style>
