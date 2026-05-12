export type ToastTone = "success" | "error" | "info";

export interface ToastDetail {
  msg: string;
  tone: ToastTone;
  durationMs?: number;
}

export const TOAST_EVENT = "app:toast";

function emit(detail: ToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail }));
}

export const toast = {
  success(msg: string, durationMs?: number) {
    emit({ msg, tone: "success", durationMs });
  },
  error(msg: string, durationMs?: number) {
    emit({ msg, tone: "error", durationMs });
  },
  info(msg: string, durationMs?: number) {
    emit({ msg, tone: "info", durationMs });
  },
};
