import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Buttons restyled to the brand. One main action per screen uses `primary` (marigold with ink
 * text). `lost` and `home` are reserved for "I'm lost" and "I'm home" only. The `parent` size is
 * the parents' app tap target: at least 56 px tall with 22 px text.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold select-none",
    "transition-[background-color,box-shadow,transform,color] duration-150 ease-paper",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-bus text-on-bus shadow-[inset_0_-1px_0_rgba(31,42,68,0.14)] hover:bg-[#e6a000] active:translate-y-px",
        secondary: "border border-line-strong bg-surface text-text hover:bg-surface-sunken active:translate-y-px",
        quiet: "text-text hover:bg-surface-sunken",
        link: "h-auto px-0 text-sky-text underline-offset-4 hover:underline",
        lost: "bg-signal text-white hover:bg-[#b10e29] active:translate-y-px",
        home: "bg-home-green text-white hover:bg-[#1a6c45] active:translate-y-px",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-sm",
        md: "h-10 rounded-md px-4 text-base",
        lg: "h-12 rounded-lg px-5 text-lg",
        parent: "min-h-14 rounded-xl px-6 py-3 text-parent leading-tight",
        icon: "size-10 rounded-md",
        "icon-parent": "size-14 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
