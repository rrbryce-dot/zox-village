/**
 * Boot ZOX Village.
 */
(function () {
  function boot() {
    const root = document.getElementById("app");
    if (!root) throw new Error("ZOX Village: missing #app");
    Zox.createUI(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
