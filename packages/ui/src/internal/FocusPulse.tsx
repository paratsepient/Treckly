/**
 * Шар пульсації фокуса для елемента з класом `.ix-focus-pulse`; рендериться прямим нащадком.
 * Поза фокусом прихований (display: none) і не анімується.
 */
export function FocusPulse() {
  return <span className="ix-focus-pulse__glow" aria-hidden="true" />;
}
