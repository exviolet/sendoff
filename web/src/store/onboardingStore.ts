import { create } from "zustand";
import { setOnboardingVersion } from "../lib/db";
import { ONBOARDING_VERSION } from "../lib/onboarding";

// Отдельный маленький стор, как toastStore/lastTargetStore: состояние живёт ровно
// столько, сколько окно, а факт прохождения уезжает в IndexedDB отдельной записью.
//
// В подписки useSessionPersistence НЕ входит намеренно: онбординг не часть снапшота
// сессии, и его переключение не должно дёргать перезапись всех сторов.
interface OnboardingStore {
  active: boolean;
  start: () => void;
  finish: () => void;
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  active: false,
  start: () => set({ active: true }),

  // Идемпотентен: зовётся в том числе из sendVia на КАЖДОЙ успешной отправке, а не
  // только на первой. Ранний выход бережёт лишнюю запись в базу.
  finish: () => {
    if (!get().active) return;
    set({ active: false });
    void setOnboardingVersion(ONBOARDING_VERSION).catch((error: unknown) => {
      // Провал записи не должен ломать отправку и не должен запирать пользователя в
      // онбординге: экран уже закрыт, в худшем случае он покажется ещё раз.
      console.error("failed to persist onboarding version", error);
    });
  },
}));
