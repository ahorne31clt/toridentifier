// Start hidden in HTML so the TestFlight invitation never flashes in the app.
const flag = document.getElementById('ios-beta-flag');
function updateBetaVisibility() {
  if (!flag) return;
  const inNativeApp = Boolean(window.webkit?.messageHandlers?.native) || typeof window.nativePage === 'string';
  flag.hidden = inNativeApp;
}
updateBetaVisibility();
window.addEventListener('pageshow', updateBetaVisibility);
window.addEventListener('native-reconnect', updateBetaVisibility);
