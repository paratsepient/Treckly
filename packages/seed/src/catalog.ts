/**
 * Синтетичний Попередній перелік 2027 і кандидати для замін. Усе вигадане:
 * жодних реальних зразків, назв підрозділів чи цін. Ціни — у гривнях (цілі).
 */

export interface CatalogEntry {
  readonly name: string;
  readonly kekv: "2210" | "2220" | "3110";
  readonly priceUah: number;
  /** Плановий обсяг на 2027 рік (для позицій переліку). */
  readonly plannedQty: number;
  /** Група схожих предметів: з неї вибирають заміни. */
  readonly group: string;
  readonly measure: "шт." | "компл." | "уп.";
}

/** Позиції Попереднього переліку напрямку (40). */
export const LIST_ITEMS: readonly CatalogEntry[] = [
  // КЕКВ 2210 — предмети, матеріали, обладнання та інвентар
  { name: "Акумулятор літій-полімерний 6S", kekv: "2210", priceUah: 3200, plannedQty: 120, group: "живлення", measure: "шт." },
  { name: "Акумулятор літій-полімерний 4S", kekv: "2210", priceUah: 1800, plannedQty: 150, group: "живлення", measure: "шт." },
  { name: "Зарядний пристрій універсальний", kekv: "2210", priceUah: 2400, plannedQty: 60, group: "живлення", measure: "шт." },
  { name: "Павербанк 20 000 мА·год", kekv: "2210", priceUah: 1500, plannedQty: 90, group: "живлення", measure: "шт." },
  { name: "Антена направлена 5,8 ГГц", kekv: "2210", priceUah: 2100, plannedQty: 80, group: "зв'язок", measure: "шт." },
  { name: "Антена всеспрямована 2,4 ГГц", kekv: "2210", priceUah: 900, plannedQty: 100, group: "зв'язок", measure: "шт." },
  { name: "Кабель живлення польовий 50 м", kekv: "2210", priceUah: 1300, plannedQty: 70, group: "кабелі", measure: "шт." },
  { name: "Кабель сигнальний екранований 100 м", kekv: "2210", priceUah: 2600, plannedQty: 40, group: "кабелі", measure: "шт." },
  { name: "Шолом захисний балістичний", kekv: "2210", priceUah: 9500, plannedQty: 200, group: "захист", measure: "шт." },
  { name: "Окуляри захисні балістичні", kekv: "2210", priceUah: 1200, plannedQty: 250, group: "захист", measure: "шт." },
  { name: "Навушники активні шумопоглинальні", kekv: "2210", priceUah: 4800, plannedQty: 110, group: "захист", measure: "шт." },
  { name: "Рюкзак польовий 40 л", kekv: "2210", priceUah: 3600, plannedQty: 180, group: "спорядження", measure: "шт." },
  { name: "Підсумок універсальний", kekv: "2210", priceUah: 700, plannedQty: 300, group: "спорядження", measure: "шт." },
  { name: "Спальний мішок зимовий", kekv: "2210", priceUah: 4200, plannedQty: 140, group: "спорядження", measure: "шт." },
  { name: "Ліхтар налобний акумуляторний", kekv: "2210", priceUah: 1100, plannedQty: 160, group: "освітлення", measure: "шт." },
  { name: "Ліхтар тактичний", kekv: "2210", priceUah: 1900, plannedQty: 120, group: "освітлення", measure: "шт." },
  { name: "Набір інструментів польовий", kekv: "2210", priceUah: 5200, plannedQty: 50, group: "інструмент", measure: "компл." },
  { name: "Паяльна станція переносна", kekv: "2210", priceUah: 3900, plannedQty: 30, group: "інструмент", measure: "шт." },
  { name: "Мультиметр цифровий", kekv: "2210", priceUah: 1400, plannedQty: 45, group: "інструмент", measure: "шт." },
  { name: "Бінокль польовий 10×42", kekv: "2210", priceUah: 6800, plannedQty: 55, group: "оптика", measure: "шт." },
  { name: "Монокуляр нічного бачення", kekv: "2210", priceUah: 8800, plannedQty: 35, group: "оптика", measure: "шт." },
  // КЕКВ 2220 — медикаменти та перев'язувальні матеріали
  { name: "Аптечка індивідуальна", kekv: "2220", priceUah: 1350, plannedQty: 400, group: "медичні", measure: "компл." },
  { name: "Джгут кровоспинний", kekv: "2220", priceUah: 450, plannedQty: 500, group: "медичні", measure: "шт." },
  { name: "Бинт компресійний стерильний", kekv: "2220", priceUah: 180, plannedQty: 900, group: "медичні", measure: "шт." },
  { name: "Пов'язка оклюзійна", kekv: "2220", priceUah: 320, plannedQty: 600, group: "медичні", measure: "шт." },
  { name: "Гемостатичний засіб", kekv: "2220", priceUah: 950, plannedQty: 350, group: "медичні", measure: "уп." },
  { name: "Набір для знеболення польовий", kekv: "2220", priceUah: 2200, plannedQty: 120, group: "медичні", measure: "компл." },
  { name: "Термоковдра рятувальна", kekv: "2220", priceUah: 150, plannedQty: 800, group: "медичні", measure: "шт." },
  { name: "Шина іммобілізаційна", kekv: "2220", priceUah: 640, plannedQty: 260, group: "медичні", measure: "шт." },
  // КЕКВ 3110 — обладнання і предмети довгострокового користування
  { name: "Квадрокоптер розвідувальний", kekv: "3110", priceUah: 185000, plannedQty: 24, group: "безпілотні", measure: "компл." },
  { name: "Квадрокоптер вантажний", kekv: "3110", priceUah: 240000, plannedQty: 12, group: "безпілотні", measure: "компл." },
  { name: "Станція керування наземна", kekv: "3110", priceUah: 96000, plannedQty: 18, group: "безпілотні", measure: "компл." },
  { name: "Радіостанція носима цифрова", kekv: "3110", priceUah: 42000, plannedQty: 90, group: "радіозв'язок", measure: "шт." },
  { name: "Радіостанція возима", kekv: "3110", priceUah: 78000, plannedQty: 36, group: "радіозв'язок", measure: "шт." },
  { name: "Ретранслятор польовий", kekv: "3110", priceUah: 125000, plannedQty: 10, group: "радіозв'язок", measure: "компл." },
  { name: "Генератор бензиновий 3 кВт", kekv: "3110", priceUah: 58000, plannedQty: 20, group: "енергопостачання", measure: "шт." },
  { name: "Зарядна станція 2 кВт·год", kekv: "3110", priceUah: 64000, plannedQty: 25, group: "енергопостачання", measure: "шт." },
  { name: "Сонячна панель складна 200 Вт", kekv: "3110", priceUah: 21000, plannedQty: 40, group: "енергопостачання", measure: "шт." },
  { name: "Тепловізор ручний", kekv: "3110", priceUah: 138000, plannedQty: 15, group: "оптика", measure: "шт." },
  { name: "Ноутбук захищений польовий", kekv: "3110", priceUah: 112000, plannedQty: 16, group: "обчислювальна техніка", measure: "шт." },
  { name: "Планшет захищений", kekv: "3110", priceUah: 54000, plannedQty: 30, group: "обчислювальна техніка", measure: "шт." },
];

/**
 * Кандидати для замін: предмети поза переліком. У кожній групі є і той самий КЕКВ,
 * і інший — щоб було видно, що заміна в межах КЕКВ ліміт не витрачає, а на інший витрачає.
 */
export const REPLACEMENT_CANDIDATES: readonly CatalogEntry[] = [
  { name: "Акумулятор літій-залізо-фосфатний 12 В", kekv: "2210", priceUah: 3900, plannedQty: 0, group: "живлення", measure: "шт." },
  { name: "Зарядна станція 1 кВт·год", kekv: "3110", priceUah: 36000, plannedQty: 0, group: "живлення", measure: "шт." },
  { name: "Антена направлена 2,4 ГГц", kekv: "2210", priceUah: 1700, plannedQty: 0, group: "зв'язок", measure: "шт." },
  { name: "Антенна система мобільна", kekv: "3110", priceUah: 48000, plannedQty: 0, group: "зв'язок", measure: "компл." },
  { name: "Шолом захисний полегшений", kekv: "2210", priceUah: 7600, plannedQty: 0, group: "захист", measure: "шт." },
  { name: "Бронежилет модульний", kekv: "3110", priceUah: 46000, plannedQty: 0, group: "захист", measure: "компл." },
  { name: "Ліхтар вуличний акумуляторний", kekv: "2210", priceUah: 2600, plannedQty: 0, group: "освітлення", measure: "шт." },
  { name: "Освітлювальна щогла мобільна", kekv: "3110", priceUah: 52000, plannedQty: 0, group: "освітлення", measure: "компл." },
  { name: "Бінокль польовий 8×32", kekv: "2210", priceUah: 4900, plannedQty: 0, group: "оптика", measure: "шт." },
  { name: "Тепловізор насадка", kekv: "3110", priceUah: 98000, plannedQty: 0, group: "оптика", measure: "шт." },
  { name: "Аптечка груповий набір", kekv: "2220", priceUah: 5400, plannedQty: 0, group: "медичні", measure: "компл." },
  { name: "Тактична медична сумка", kekv: "2210", priceUah: 3300, plannedQty: 0, group: "медичні", measure: "шт." },
  { name: "Квадрокоптер навчальний", kekv: "2210", priceUah: 38000, plannedQty: 0, group: "безпілотні", measure: "компл." },
  { name: "Квадрокоптер розвідувальний покращений", kekv: "3110", priceUah: 205000, plannedQty: 0, group: "безпілотні", measure: "компл." },
  { name: "Радіостанція носима аналогова", kekv: "3110", priceUah: 31000, plannedQty: 0, group: "радіозв'язок", measure: "шт." },
  { name: "Гарнітура для радіостанції", kekv: "2210", priceUah: 3700, plannedQty: 0, group: "радіозв'язок", measure: "шт." },
  { name: "Генератор бензиновий 2 кВт", kekv: "3110", priceUah: 41000, plannedQty: 0, group: "енергопостачання", measure: "шт." },
  { name: "Блок живлення польовий 1 кВт", kekv: "2210", priceUah: 9800, plannedQty: 0, group: "енергопостачання", measure: "шт." },
];

export const KEKV_INFO = [
  { code: "2210", name: "Предмети, матеріали, обладнання та інвентар" },
  { code: "2220", name: "Медикаменти та перев'язувальні матеріали" },
  { code: "3110", name: "Придбання обладнання і предметів довгострокового користування" },
] as const;
