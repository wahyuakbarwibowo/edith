import type { FormEvent } from "react";

/** Single-field form that submits a trimmed value and resets itself. */
export function InlineForm({ placeholder, button, onSubmit }: { placeholder: string; button: string; onSubmit: (value: string) => unknown }) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("value")).trim();
    if (!value) return;
    onSubmit(value);
    form.reset();
  }
  return (
    <form onSubmit={submit} className="inline-form">
      <input name="value" placeholder={placeholder} aria-label={placeholder} maxLength={200} />
      <button>{button}</button>
    </form>
  );
}
