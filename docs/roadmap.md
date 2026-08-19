# Samiiwara miniERP — Roadmap pendiente

Este documento conserva explícitamente decisiones postergadas. Un ítem pendiente no debe interpretarse como descartado.

## Seguridad / operación

- **Cloudflare Access — PENDIENTE.** Mantener el login propio de la aplicación y añadir Access delante del hostname como defensa en profundidad antes de ampliar el piloto o convertirlo en un servicio externo más estable.
- Gestor de secretos — pendiente. El `.env.production` con permisos estrictos sigue siendo la solución de piloto; evaluar un gestor dedicado cuando aumente el alcance operativo.
- Migrar bearer token en `localStorage` a cookie segura `HttpOnly` + protección CSRF.
- MFA, recuperación de contraseña y administración visible de sesiones/dispositivos.
- Revisión de headers/CSP y reglas WAF/rate-limit de Cloudflare además del rate-limit de aplicación.
- Backups automatizados, prueba periódica de restore y política de retención.

## Operación del taller

- Automatización de WhatsApp mediante proveedor/API. La etapa actual solo genera enlaces y mensajes para revisión humana antes de enviar.
- **Captura conversacional — núcleo v1, hardening inicial y webhook directo de Telegram implementados y desplegados (2026-08-19).** El commit `1a76b00f28ddd5676753133689e24405d0f953f0` pasó QA aislado (migraciones, E2E, concurrencia/idempotencia, headers, rate limit y Docker) y está saludable en producción. Telegram aún requiere configurar secretos, registrar el webhook y hacer una prueba sintética con el bot real. OpenClaw queda fuera del runtime funcional y se usa únicamente para testing, QA y despliegue. Conectar WhatsApp oficial cuando la usuaria esté disponible. Telegram y WhatsApp deben ser adaptadores intercambiables, no dos implementaciones de negocio distintas.
- **Operaciones conversacionales — candidato en desarrollo (2026-08-19).** La rama `codex/capture-operational-confirmation` implementa borradores editables y confirmación transaccional para `NEW_PURCHASE`, `NEW_EXPENSE` y `STOCK_ADJUSTMENT`, incluyendo proveedor, costo unitario, categoría, método de pago, fecha, stock no negativo y auditoría de entidad confirmada. Añade la migración `0015_capture_operation_confirmation.sql` y cobertura E2E para las tres operaciones. Todavía no está desplegada: falta ejecutar QA aislado sobre PostgreSQL, verificar carreras/idempotencia y aprobar el commit exacto.
- Intenciones iniciales de captura: nuevo pedido, nuevo cliente, nueva compra, nuevo gasto y ajuste de stock. La IA propone datos; nunca crea silenciosamente.
- Audio e imágenes quedan después de estabilizar la captura textual y la confirmación.
- Fotos/adjuntos por producto y pedido: referencia de la clienta, bordado enviado/recibido y prenda terminada. Evaluar almacenamiento R2 u objeto equivalente antes de implementarlo.
- Medidas corporales y fittings por cliente **solo si el flujo real lo requiere**; no convertirlo en requisito para pedidos por talla S/M/L/XL/XXL.
- Consumo de otros materiales adicionales (hilo, accesorios u otros) si aparecen como costo/stock relevante en el uso real.
- Posible vinculación automática entre prendas terminadas y pedidos de venta desde stock después de observar cómo Samiiwara registra esas ventas en la práctica.

## Dinero / gestión

- El módulo Dinero es gerencial/referencial, no contabilidad tributaria.
- Definir con uso real si el pago al bordador debe generar automáticamente un gasto de caja o si se registrará manualmente con su fecha real de pago.
- Reportes históricos por rango, exportación CSV/Excel y conciliación simple Yape/Plin/banco.
- Costeo y margen por modelo/talla con histórico suficiente para comparar estimado vs real.

## Producto / UX

- Buscador/filtros cuando el volumen de clientes/pedidos/productos ya lo justifique.
- Mejoras de accesibilidad restantes (IDs/names/autocomplete en todos los campos y auditoría completa de teclado/lectores de pantalla).
- Restaurar registros archivados desde una papelera administrativa si el soft-delete empieza a usarse de forma frecuente.
- PWA/offline solo si el uso móvil y conectividad del taller lo justifican.
