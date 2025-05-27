import Root from './badge.svelte';
import type { VariantProps } from 'tailwind-variants';
import { badgeVariants } from './badge.svelte';

export type BadgeProps = VariantProps<typeof badgeVariants>;

export {
  Root,
  //
  Root as Badge,
  badgeVariants,
};
