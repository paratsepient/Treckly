import assert from "node:assert/strict";
import { DomainError, type DomainErrorCode } from "../src/index.ts";

/** Перевіряє, що дія кидає DomainError із потрібним кодом. */
export function throwsCode(fn: () => unknown, code: DomainErrorCode): DomainError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DomainError, `очікували DomainError, отримали ${String(error)}`);
    assert.equal(error.code, code, `код помилки: ${error.code} (${error.message})`);
    return error;
  }
  assert.fail(`очікували помилку ${code}, але її не було`);
}
