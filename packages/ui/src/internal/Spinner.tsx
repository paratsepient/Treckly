/**
 * Індикатор завантаження. Лише візуальний: стан для допоміжних технологій
 * оголошує власник (aria-busy і прихований текст у Button).
 */
export function Spinner() {
  return (
    <svg className="ix-spinner" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle className="ix-spinner__track" cx="8" cy="8" r="6" fill="none" strokeWidth="2" />
      <path className="ix-spinner__arc" d="M8 2 a6 6 0 0 1 6 6" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
