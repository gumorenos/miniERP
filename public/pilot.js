(() => {
  const tokenKey = "minierp.token";

  const setReactInputValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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
    const token = localStorage.getItem(tokenKey);
    if (!token || location.pathname === "/change-password.html") return;
    const response = await fetch("/api/auth/session", { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    if (!response || response.status === 401) {
      localStorage.removeItem(tokenKey);
      return;
    }
    if (!response.ok) return;
    const session = await response.json();
    if (session.mustChangePassword) location.replace("/change-password.html");
  };

  const observer = new MutationObserver(() => {
    scrubDemoDefaults();
    showPasswordChanged();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scrubDemoDefaults();
  showPasswordChanged();
  void enforcePendingPasswordChange();
})();
