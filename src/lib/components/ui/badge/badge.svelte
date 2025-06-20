<script lang="ts" context="module">
  import { tv, type VariantProps } from 'tailwind-variants';

  export const badgeVariants = tv({
    base: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  });

  export type BadgeProps = VariantProps<typeof badgeVariants>;
</script>

<script lang="ts">
  type Variant = VariantProps<typeof badgeVariants>['variant'];

  export let variant: Variant = 'default';

  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={badgeVariants({ variant, class: className })} {...$$restProps}>
  <slot />
</div>
