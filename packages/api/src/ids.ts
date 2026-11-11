import type { IdGenerator } from "@dsp/domain";

/**
 * Унікальні між сесіями ідентифікатори для застосунку. Послідовний генератор домену
 * (`createSequentialIds`) лишається для тестів і seed: після перезавантаження сторінки
 * він почав би з 0001 і зіткнувся б із уже збереженими записами.
 */
export function createRandomIds(): IdGenerator {
  return {
    next: (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`,
  };
}
