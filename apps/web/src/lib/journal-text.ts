const EVENT_TEXT: Record<string, string> = {
  "request.created": "Заявку створено",
  "request.edited": "Рядки змінено",
  "request.submitted": "Подано на рівень 1",
  "request.resubmitted": "Подано нову версію",
  "request.listed": "Увійшла до денного переліку",
  "request.delisted": "Повернулась у чергу рівня",
  "request.advanced": "Погоджено рівнем, передано далі",
  "request.approved": "Затверджено Головою",
  "request.returned": "Повернуто автору",
  "request.withdrawn": "Відкликано",
  "request.extract_issued": "Витяг сформовано",
  "request.procured": "Закупівлю підтверджено, нове на складі бази",
  "request.issued": "Нове видано актом",
  "request.not_procured": "Закрито як не виконано",
  "list.formed": "Сформовано денний перелік",
  "list.disbanded": "Перелік розформовано",
  "list.not_signed": "Голова не підписав перелік, заявки повернуто авторам",
  "list.approved": "Перелік погоджено",
};

/** Подія журналу людською мовою; невідомий тип показується як є, щоб нічого не зникало. */
export const journalText = (type: string): string => EVENT_TEXT[type] ?? type;
