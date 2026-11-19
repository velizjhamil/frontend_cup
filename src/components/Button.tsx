import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'outline';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary hover:bg-primary-hover active:bg-primary-hover text-primary-foreground shadow-md',
  outline:
    'bg-card border border-secondary text-primary hover:bg-muted active:bg-secondary/40',
};

/** Base button: inherits every native <button> prop. `primary` is the default variant. */
export function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={`w-full font-semibold py-3 px-4 rounded-xl transition-colors duration-200 outline-none focus-visible:ring-4 focus-visible:ring-secondary disabled:opacity-60 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
