// Start hidden in HTML so the TestFlight invitation never flashes in the app.
const flag = document.getElementById('ios-beta-flag');
const invitation = document.getElementById('ios-beta-dialog');
const dismissedKey = 'tornado-guesser-ios-beta-dismissed-v1';
const shownKey = 'tornado-guesser-ios-beta-shown-v1';
const cooldown = 7 * 24 * 60 * 60 * 1000;
let shownThisVisit = false;
function inNativeApp() {
  return Boolean(window.webkit?.messageHandlers?.native) || typeof window.nativePage === 'string';
}
function updateBetaVisibility() {
  const native = inNativeApp();
  if (flag) flag.hidden = native;
  if (native && invitation?.open) invitation.close();
}
updateBetaVisibility();
window.addEventListener('pageshow', updateBetaVisibility);
window.addEventListener('native-reconnect', updateBetaVisibility);

function snoozeInvitation() {
  try { localStorage.setItem(dismissedKey, String(Date.now())); } catch {}
}
function dismissInvitation() {
  snoozeInvitation();
  invitation?.close();
}
document.getElementById('ios-beta-close')?.addEventListener('click', dismissInvitation);
document.getElementById('ios-beta-continue')?.addEventListener('click', dismissInvitation);
document.getElementById('ios-beta-join')?.addEventListener('click', dismissInvitation);
invitation?.addEventListener('cancel', snoozeInvitation);

function offerBeta() {
  // iPadOS can request a desktop site while retaining MacIntel + touch support.
  const iOSBrowser = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iOSBrowser || inNativeApp() || shownThisVisit || !invitation || typeof invitation.showModal !== 'function') return;
  // Never interrupt a game or another dialog that the visitor has already opened.
  if (document.visibilityState !== 'visible' || document.getElementById('home-screen')?.hidden || document.querySelector('dialog[open]')) return;
  try {
    const dismissedAt = Number(localStorage.getItem(dismissedKey));
    if (dismissedAt > 0 && Date.now() - dismissedAt < cooldown) return;
  } catch {}
  try { if (sessionStorage.getItem(shownKey)) return; } catch {}
  shownThisVisit = true;
  try { sessionStorage.setItem(shownKey, '1'); } catch {}
  invitation.showModal();
}
window.setTimeout(offerBeta, 2000);
