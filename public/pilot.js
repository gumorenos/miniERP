(() => {
  const setReactInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const prepareLoginFields = () => {
    const inputs = [...document.querySelectorAll(".login input")].filter((input) => input instanceof HTMLInputElement);
    const email = inputs.find((input) => input.type !== "password");
    const password = inputs.find((input) => input.type === "password");
    if (email) {
      email.id ||= "login-email";
      email.name ||= "email";
      email.autocomplete = "username";
      email.inputMode = "email";
    }
    if (password) {
      password.id ||= "login-password";
      password.name ||= "password";
      password.autocomplete = "current-password";
    }
  };

  const scrubDemoDefaults = () => {
    document.querySelectorAll(".login input").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      if (input.value === "admin@example.test" || input.value === "change-me-dev") setReactInputValue(input, "");
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

  const enforcePendingPasswordChange = async () => {
    if (location.pathname === "/change-password.html") return;
    const response = await fetch("/api/auth/session", { credentials: "same-origin" }).catch(() => null);
    if (!response || response.status === 401) {
      return;
    }
    if (!response.ok) return;
    const session = await response.json();
    if (session.mustChangePassword) location.replace("/change-password.html");
  };

  const syncPilotUi = () => {
    prepareLoginFields();
    scrubDemoDefaults();
    showPasswordChanged();
  };

  const observer = new MutationObserver(syncPilotUi);

  observer.observe(document.documentElement, { childList: true, subtree: true });
  syncPilotUi();
  void enforcePendingPasswordChange();
})();
