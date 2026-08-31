import { useEffect, useState } from "react";
import { isTauri } from "../lib/platform";
import { statusOf, type TabBinding } from "../lib/terminalTargets";

// Как часто переспрашивать статус привязанного агента.
//
// Цена замерена, а не прикинута: 30 вызовов herdr CLI = 0.055с wall / 0.03с CPU,
// то есть ~1.8мс на вызов — это тонкий клиент к unix-сокету, не запуск сервера.
// При 3с и трёх вызовах на тик выходит ~0.2% одного ядра. Кэшировать лейблы или
// растягивать интервал незачем; если когда-нибудь станет дорого — сначала замерить.
//
// Опрос всё равно идёт ТОЛЬКО когда окно в фокусе и у активного таба есть привязка:
// не потому что дорого, а потому что незачем спрашивать про то, чего не видно.
const POLL_MS = 3000;

// Живой статус цели активного таба. Возвращает null, если статуса нет (tmux),
// цель не найдена/неоднозначна, или мы в браузере.
//
// Опрос, а не дебаунс: правило проекта «реактивные индикаторы не дебаунсить» про
// задержку ПОСЛЕ известного изменения. Здесь изменение происходит снаружи (агент
// сам переходит working→idle), узнать о нём иначе как спросив нельзя — хуков от
// herdr к нам не ведёт (это и есть та самая граница из agent-hooks-ноты в ROADMAP).
export function useTargetStatus(binding: TabBinding | undefined): string | null {
  const [status, setStatus] = useState<string | null>(null);

  // Строковый ключ вместо объекта: binding пересоздаётся на каждом обновлении таба
  // (updatedAt), и по ссылке эффект перезапускался бы на каждый набранный символ.
  const key = binding ? JSON.stringify(binding) : "";

  useEffect(() => {
    if (!binding || !isTauri) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      const next = await statusOf(binding!);
      if (cancelled) return;
      setStatus(next);
      timer = setTimeout(() => void tick(), POLL_MS);
    }

    function start() {
      if (timer === undefined && !cancelled) void tick();
    }

    function stop() {
      clearTimeout(timer);
      timer = undefined;
    }

    // Первый запрос сразу — индикатор не должен «догонять» открытие окна.
    if (document.hasFocus()) start();
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. коммент про key выше
  }, [key]);

  return status;
}
