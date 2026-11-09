import type { ButtonHTMLAttributes, Ref } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { Spinner } from './Spinner';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className = '', ...rest }: LinkProps & StyleProps) {
  return <Link className={`${buttonClasses(variant, size)} ${className}`} {...rest} />;
}
