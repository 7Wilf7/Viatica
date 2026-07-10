async function clearStalePwaShell() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.warn("[pwa-rescue] cache cleanup failed:", err);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("pwaRescue", String(Date.now()));
    window.location.replace(url.toString());
  }
}

void clearStalePwaShell();
