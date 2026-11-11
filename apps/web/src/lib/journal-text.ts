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
  "list.formed": "Сформовано денний перелік",
  "list.disbanded": "Перелік розформовано",
  "list.approved": "Перелік погоджено",
};

/** Подія журналу людською мовою; невідомий тип показується як є, щоб нічого не зникало. */
export const journalText = (type: string): string => EVENT_TEXT[type] ?? type;
