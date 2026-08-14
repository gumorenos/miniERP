import React, { useState } from "react";
import { workshopApi, type ArchiveEntityType } from "./workshop-api";

export function ArchiveButton({ entityType, id, label = "Borrar", onArchived }: { entityType: ArchiveEntityType; id: string; label?: string; onArchived: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span>
    <button className="ghost danger" type="button" disabled={busy} onClick={async () => {
      if (!window.confirm("¿Seguro que quieres borrar este registro? Se conservará una copia interna para trazabilidad.")) return;
      setBusy(true); setError("");
      try { await workshopApi.archive(entityType, id); await onArchived(); }
      catch (err) { setError(err instanceof Error ? err.message : "No se pudo borrar el registro."); }
      finally { setBusy(false); }
    }}>{busy ? "Borrando..." : label}</button>
    {error && <small className="error" role="alert">{error}</small>}
  </span>;
}
