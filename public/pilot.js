(() => {
  const scrubDemoDefaults = () => {
    document.querySelectorAll(".login input").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      if (input.value === "admin@example.test" || input.value === "change-me-dev") input.value = "";
    });
  };

  const showPasswordChanged = () => {
    if (new URLSearchParams(location.search).get("passwordChanged") !== "1") return;
    const panel = document.querySelector(".login-panel");
    if (!panel || panel.querySelector(".login-success")) return;
    const message = document.createElement("p");
    message.className = "login-success";
    message.textContent = "Contraseña actualizada. Ingresa nuevamente.";
    panel.prepend(message);
    history.replaceState({}, "", "/");
  };

  const observer = new MutationObserver(() => {
    scrubDemoDefaults();
    showPasswordChanged();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scrubDemoDefaults();
  showPasswordChanged();
})();
