export const musicWindow = $state({
  mode: 'closed' as 'closed' | 'mini' | 'library',
  opener: null as HTMLButtonElement | null
});
