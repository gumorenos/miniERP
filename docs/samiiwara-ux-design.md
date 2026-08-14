# Samiiwara · sistema visual de la UX

Este sistema se deriva de las referencias visuales de Samiiwara compartidas el 14 de agosto de 2026. Su función es orientar la aplicación de gestión del taller, no reproducir literalmente Instagram.

## Dirección

- Boutique/atelier, cálida, artesanal y contemporánea.
- Mucho espacio y jerarquía clara: los datos operativos deben respirar.
- Negro o azul noche para dar estructura; marfil para el lienzo; blanco para superficies de trabajo.
- El color funciona como señal, no como decoración indiscriminada.
- Bordados, flores, hojas y el colibrí se traducen en pequeños acentos geométricos, no en fondos recargados.

## Tokens

| Rol | Color | Uso |
| --- | --- | --- |
| Noche | `#141521` | Cabecera de inicio, contraste y estructura |
| Tinta | `#17151A` | Texto principal |
| Marfil | `#F7F3EB` | Fondo general |
| Papel | `#FFFDFA` | Tarjetas y formularios |
| Magenta | `#E91E63` | Acción principal, selección y marca |
| Morado | `#673AB7` | Acción secundaria y configuración |
| Azul | `#3F51B5` | Reservado para estados o navegación futura |
| Naranja | `#FF5722` | Atención, gasto o acción que requiere cuidado |
| Turquesa | `#00A9B8` | Inventario, ajustes y disponibilidad |
| Lima | `#8BC34A` | Señal positiva o stock saludable |

## Tipografía y componentes

- Títulos: una sans redondeada y expresiva disponible en el sistema (`Trebuchet MS` como primera opción).
- Interfaz: sans del sistema para lectura rápida y formularios.
- Tarjetas con radios generosos, bordes suaves y sombras discretas.
- Botones primarios magenta; botones secundarios morados; acciones auxiliares en fondos claros.
- Patrón floral reducido a una franja decorativa y anillos de color para conservar legibilidad móvil.

## Reglas de producto

1. Capturar primero, completar después.
2. Máximo de campos obligatorios en una captura rápida: cliente, producto, talla, color, precio, adelanto y entrega.
3. Crear entidades en contexto y seleccionarlas automáticamente.
4. Mostrar razones concretas cuando una acción no es posible; nunca usar un error genérico si la API conoce la causa.
5. Mantener el módulo principal en cinco destinos: Inicio, Pedidos, Taller, Contactos y Dinero.
6. No usar más de dos colores saturados en una misma superficie salvo en acciones rápidas del Inicio.
