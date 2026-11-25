export const lightBudgets={
  standard:{points:4,beams:12},
  doubled:{points:8,beams:24},
  tripled:{points:12,beams:36}
} as const;

export type LightBudget=(typeof lightBudgets)[keyof typeof lightBudgets];

export function studioLightBudget(name:string|null){
  return name==='doubled'||name==='tripled'?lightBudgets[name]:lightBudgets.standard;
}
