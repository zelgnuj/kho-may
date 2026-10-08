export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('kho-toast', { detail: message }));
}
