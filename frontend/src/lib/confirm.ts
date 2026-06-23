import { translate, getLang } from "../i18n";

/** Simple blocking confirm using a translated message key. */
export function confirmKey(key: string): boolean {
  return window.confirm(translate(getLang(), key));
}
