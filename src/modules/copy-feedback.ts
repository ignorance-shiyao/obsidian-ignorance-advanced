import { setIcon, UI_ICONS } from "./ui-icons.js";
/* 复制状态由插件提供，动效与时长由主题提供。 */
const feedback = new WeakMap<HTMLButtonElement, { timer: ReturnType<typeof setTimeout>; markup: string; label: string | null }>();

export function showCopyFeedback(button: HTMLButtonElement, copiedLabel: string) {
  const previous = feedback.get(button);
  if (previous) clearTimeout(previous.timer);
  const markup = previous?.markup ?? button.innerHTML;
  const label = previous ? previous.label : button.getAttribute("aria-label");
  setIcon(button, UI_ICONS.check);
  button.setAttribute("aria-label", copiedLabel);
  button.classList.add("is-copied");
  const timer = setTimeout(() => {
    button.innerHTML = markup;
    if (label === null) button.removeAttribute("aria-label"); else button.setAttribute("aria-label", label);
    button.classList.remove("is-copied");
    feedback.delete(button);
  }, 1500);
  feedback.set(button, { timer, markup, label });
}
