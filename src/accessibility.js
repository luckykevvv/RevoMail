let returnFocus;
let returnSelector;
let activeDialog;
let closeDialog;

function focusable(dialog) {
  return [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length);
}

export function syncDialog(dialog, onClose) {
  closeDialog = onClose;
  document.querySelector(".app-shell")?.toggleAttribute("inert", Boolean(dialog));
  if (dialog && !activeDialog) {
    returnFocus = document.activeElement;
    const identity = [...(returnFocus?.attributes || [])].find(attribute => attribute.name === "id" || attribute.name.startsWith("data-"));
    returnSelector = identity ? `[${identity.name}="${CSS.escape(identity.value)}"]` : null;
    activeDialog = dialog;
    (dialog.querySelector("textarea:not(:disabled)") || focusable(dialog)[0] || dialog).focus();
  } else if (dialog) {
    const previous = activeDialog;
    activeDialog = dialog;
    if (previous !== dialog && !dialog.contains(document.activeElement)) (focusable(dialog)[0] || dialog).focus();
  } else if (activeDialog) {
    activeDialog = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    else if (returnSelector && document.querySelector(returnSelector)) document.querySelector(returnSelector).focus();
    else document.querySelector('[data-workspace] h1, [data-nav="inbox"]')?.focus();
    returnFocus = null;
    returnSelector = null;
  }
}

document.addEventListener("keydown", event => {
  if (!activeDialog) return;
  if (event.key === "Escape") { event.preventDefault(); closeDialog?.(); }
  if (event.key !== "Tab") return;
  const controls = focusable(activeDialog);
  if (!controls.length) { event.preventDefault(); activeDialog.focus(); return; }
  const index = controls.indexOf(document.activeElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
  else if (!event.shiftKey && (index === -1 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
});

export function captureFocus(root) {
  const element = document.activeElement;
  if (!element || !root?.contains(element)) return null;
  const attribute = [...element.attributes].find(a => a.name === "id" || a.name.startsWith("data-"));
  if (!attribute) return null;
  return { selector: `[${attribute.name}="${CSS.escape(attribute.value)}"]`, start: element.selectionStart, end: element.selectionEnd };
}

export function restoreFocus(root, saved) {
  if (!saved) return;
  const element = root.querySelector(saved.selector);
  if (!element || element.disabled) return;
  element.focus({ preventScroll: true });
  // Put the caret back where it was (including the search box) so typing is not interrupted by a re-render.
  if (typeof saved.start === "number") {
    try { element.setSelectionRange?.(saved.start, saved.end); } catch { /* input type without selection support */ }
  }
}
