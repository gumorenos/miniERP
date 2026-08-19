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
- **Captura conversacional — núcleo v1, hardening inicial y webhook directo de Telegram implementados localmente (2026-08-18).** Ya incluye contador transaccional de pedidos, confirmación idempotente de borradores, protección contra carreras de `sourceMessageId`, manejo global de errores, headers, rate limit básico y `POST /api/integrations/telegram/webhook`. Falta validarlo con PostgreSQL aislado y la API de Telegram antes de publicar/activar. OpenClaw queda fuera del runtime funcional y se usará únicamente para testing, QA y despliegue. Conectar WhatsApp oficial cuando la usuaria esté disponible. Telegram y WhatsApp deben ser adaptadores intercambiables, no dos implementaciones de negocio distintas.
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
