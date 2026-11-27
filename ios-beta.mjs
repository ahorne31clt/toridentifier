// Start hidden in HTML so the TestFlight invitation never flashes in the app.
const flag = document.getElementById('ios-beta-flag');
const invitation = document.getElementById('ios-beta-dialog');
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
window.addEventListener('pageshow', event => {
  updateBetaVisibility();
  if (event.persisted) { shownThisVisit = false; window.setTimeout(offerBeta, 2000); }
});
window.addEventListener('native-reconnect', updateBetaVisibility);

function dismissInvitation() {
  invitation?.close();
}
document.getElementById('ios-beta-close')?.addEventListener('click', dismissInvitation);
document.getElementById('ios-beta-continue')?.addEventListener('click', dismissInvitation);
document.getElementById('ios-beta-join')?.addEventListener('click', dismissInvitation);

function offerBeta() {
  // iPadOS can request a desktop site while retaining MacIntel + touch support.
  const iOSBrowser = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iOSBrowser || inNativeApp() || shownThisVisit || !invitation || typeof invitation.showModal !== 'function') return;
  // Never interrupt a game or another dialog that the visitor has already opened.
  if (document.visibilityState !== 'visible' || document.getElementById('home-screen')?.hidden || document.querySelector('dialog[open]')) return;
  shownThisVisit = true;
  invitation.showModal();
}
window.setTimeout(offerBeta, 2000);
