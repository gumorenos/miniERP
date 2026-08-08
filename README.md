# miniERP

Aplicación web ligera para gestionar la operación de un pequeño taller de confección de prendas con inspiración andina.

## Problema

La operación actual se gestiona principalmente por WhatsApp e Instagram. Esto dificulta saber con precisión:

- qué pedidos están pendientes, próximos a vencer o atrasados;
- qué prendas están con el bordador y desde cuándo;
- qué materiales y prendas terminadas hay en stock;
- cuánto se ha vendido, cobrado, gastado y ganado en un periodo.

## Objetivo del MVP

Construir una aplicación móvil-first que permita registrar y consultar la operación diaria sin intentar reemplazar un sistema contable formal.

### Áreas del MVP

1. Inicio / dashboard
2. Pedidos
3. Productos / modelos
4. Inventario
5. Compras y gastos
6. Dinero / cobros

## Flujo principal bajo pedido

Consulta del cliente → acuerdo de precio/plazo → adelanto → verificar/comprar material → corte → envío a bordado → recepción de bordado → confección/armado → cobro de saldo → entrega → cierre.

## Flujo de venta desde stock

Prenda disponible → reserva (si aplica) → cobro → entrega → salida de stock.

## Principios

- Mobile-first.
- Una sola usuaria en el MVP, pero datos preparados para pertenecer a un `Business`.
- El stock no se edita directamente: cambia mediante movimientos.
- Los pagos no se representan solo con un booleano: cada cobro es un movimiento independiente.
- Guardar costo estimado y costo real cuando corresponda.
- La tela se descuenta del inventario al momento del corte.
- Contabilidad solo gerencial/referencial; no incluye SUNAT ni declaraciones.
- WhatsApp e IA quedan fuera del primer MVP, pero el dominio debe quedar preparado para integrarlos después.

## Estado

Discovery mínimo cerrado. La especificación funcional inicial está en [`docs/mvp-spec.md`](docs/mvp-spec.md) y el modelo de dominio en [`docs/domain-model.md`](docs/domain-model.md).

## Primer vertical a implementar

Crear cliente → crear pedido → registrar adelanto → avanzar producción → enviar/recibir bordador → registrar saldo → entregar → cerrar pedido → visualizar margen.
