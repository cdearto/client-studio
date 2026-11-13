'use client';
/** A submit button that asks first (server-component pages can't attach click handlers themselves). */
export function ConfirmButton({ message, ...props }: { message: string } & React.ComponentProps<'button'>) {
  return <button {...props} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }} />;
}
