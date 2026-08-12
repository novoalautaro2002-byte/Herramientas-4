# Balances embebidos en el análisis técnico

`analisis-tecnico.html` lleva adentro la serie de ganancia por acción de los últimos
doce meses de cada papel, en la constante `FUNDAMENTALES`. No se baja en vivo por dos
motivos:

- **`data.sec.gov` no manda cabeceras CORS**, así que un navegador no puede leerla
  directo desde un archivo HTML suelto.
- Los proxies públicos dejaron de ser confiables: **corsproxy.io pasó a plan pago**
  (devuelve 403 "Upgrade your plan").

Como además estos números cambian cuatro veces al año, precalcularlos es lo correcto.

## Regenerar

```
cd datos && node gen-fundamentales.js
```

Escribe `fundamentales.json`. Después hay que reemplazar el bloque `FUNDAMENTALES`
dentro de `analisis-tecnico.html` y actualizar `FUND_FECHA`.

Conviene correrlo cuando termina cada temporada de balances (fines de febrero, mayo,
agosto y noviembre).

## Qué resuelve el armado

Tres trampas del XBRL de la SEC, todas verificadas contra el balance anual auditado:

1. **El cuarto trimestre no existe como 10-Q.** Va dentro del 10-K con la cifra anual,
   así que se deriva: `Q4 = ejercicio − (Q1 + Q2 + Q3)`.
2. **Los splits se aplican por fecha de presentación, no de período.** Dentro de una
   misma empresa conviven cifras pre y post split: un período viejo sólo queda
   reexpresado si reapareció como comparativo después del split. Midiendo contra el
   cierre del período, el TTM de Apple a 2012 daba 44,16 contra los 6,31 reportados
   — exactamente el 7:1 de 2014.
3. **Se normaliza antes de derivar el Q4.** Restar un ejercicio y unos trimestres que
   quedaron en bases distintas producía TTM negativos contra ejercicios positivos.

Cada ejercicio se cruza contra el anual reportado; el que no cierra dentro del 3% se
descarta entero. Pasa en el 3% de los casos, por reexpresiones contables.

## Cobertura

25 de los 33 papeles del universo en dólares. Quedan afuera, con el motivo declarado
en la interfaz:

| papel | motivo |
|---|---|
| GLOB, NU, VIST | publican los trimestrales como adjunto del 6-K, sin etiquetar en XBRL: en el dato estructurado sólo queda el anual |
| TSM | balances en dólares taiwaneses por acción ordinaria; el ADR son 5 ordinarias |
| V | no etiqueta ganancia por acción y tampoco se deduce de ganancia neta sobre acciones |
| XOM | cambió de etiqueta XBRL: quedan 4 trimestres sueltos que no encadenan |
| B, VALE | trimestrales por 6-K que no encadenan en serie continua |

Los ADRs argentinos quedan afuera casi por completo: reportan en pesos.
