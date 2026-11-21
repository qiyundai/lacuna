<script lang="ts">
  const paths = {
    play: 'M7 4 20 12 7 20Z', pause: 'M8 5v14M16 5v14',
    next: 'm5 5 10 7-10 7zM19 5v14', previous: 'm19 5-10 7 10 7zM5 5v14',
    shuffle: 'M3 6h2c5 0 8 12 13 12h3m-3-3 3 3-3 3M3 18h2c2.5 0 4-2 5-4m4-5c1.5-2 2.5-3 4-3h3m-3-3 3 3-3 3',
    repeat: 'M3 10V8a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M21 14v2a3 3 0 0 1-3 3H5m3 3-3-3 3-3',
    volume: 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    muted: 'M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6',
    expand: 'm5 14 7-7 7 7', minimize: 'm5 9 7 7 7-7', close: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14', queue: 'M3 5h14M3 10h14M3 15h6m7-2v8m-4-4h8',
    remove: 'M5 12h14', note: 'M8 18V6l11-2v12M8 9l11-2M8 18c0 3-6 3-6 0s6-3 6 0zm11-2c0 3-6 3-6 0s6-3 6 0z'
  };
  let { name }: { name: keyof typeof paths } = $props();
</script>

<svg viewBox="0 0 24 24" width="19" height="19" fill={name === 'play' ? 'currentColor' : 'none'}
  stroke="currentColor" stroke-width={name === 'pause' ? 3.5 : 1.65} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]}/>
</svg>
