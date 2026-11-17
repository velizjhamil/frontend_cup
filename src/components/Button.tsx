import type { ButtonHTMLAttributes } from 'react';

/** Botón base reutilizable: hereda todas las props nativas de <button>. */
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  );
}
