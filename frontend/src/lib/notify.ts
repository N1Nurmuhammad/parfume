import { notifications } from "@mantine/notifications";
import { ApiError } from "../api/client";
import { DICT } from "../i18n/dictionaries";
import { getLang, translate } from "../i18n";

/** Show a backend error, translating known 409 `code`s (err_duplicate, …). */
export function notifyError(e: unknown) {
  let msg = e instanceof Error ? e.message : String(e);
  if (e instanceof ApiError && e.code) {
    const key = "err_" + e.code;
    if (DICT[getLang()]?.[key]) msg = translate(getLang(), key);
  }
  notifications.show({ color: "red", title: "⚠", message: msg });
}

export function notifySuccess(message: string) {
  notifications.show({ color: "teal", message });
}
