import React, { useEffect, useState } from "react";

function messageFrom(reason: unknown) {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  if (typeof reason === "string" && reason.trim()) return reason;
  return "No se pudo completar la acción. Revisa el estado del pedido e inténtalo nuevamente.";
}

export function GlobalActionError() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setMessage(messageFrom(event.reason));
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  if (!message) return null;
  return <div className="global-error" role="alert">
    <span>{message}</span>
    <button type="button" className="ghost" onClick={() => setMessage("")}>Cerrar</button>
  </div>;
}
