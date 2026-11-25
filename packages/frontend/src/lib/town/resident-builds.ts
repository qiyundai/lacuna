export const strideByBuild={
  compact:.83,willow:1.17,round:.89,wedge:1.06,bell:.94,rangy:1.14,square:.95,bowed:.86
} as const;
export type BodyBuild=keyof typeof strideByBuild;
export const bodyBuilds=Object.keys(strideByBuild) as BodyBuild[];
