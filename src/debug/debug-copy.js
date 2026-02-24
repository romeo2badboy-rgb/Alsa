/**
 * Copies the given data object to the clipboard as pretty-printed JSON.
 * Falls back to a temporary <textarea> trick for older browsers.
 * @param {object} data
 */
export function copyDebugData(data) {
  const text = JSON.stringify(data, null, 2);

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => console.info('[DebugCopy] Copied to clipboard.'))
      .catch((err) => console.warn('[DebugCopy] Clipboard error:', err));
    return;
  }

  // Legacy fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    console.info('[DebugCopy] Copied to clipboard (fallback).');
  } catch (e) {
    console.warn('[DebugCopy] execCommand copy failed:', e);
  }
  document.body.removeChild(ta);
}
