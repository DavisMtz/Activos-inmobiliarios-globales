/**
 * Las frases con las que se mide a un modelo antes de confiarle el buscador
 * (`npm run medir:ia`). Están escritas como escribe la gente: sin acentos, con
 * errores de dedo, con «depa», «mdp» y «15 mil».
 *
 * `esperado` trae SOLO lo que la frase dice; lo que no aparece tiene que venir
 * en null (o `[]`), y un filtro de más cuenta como fallo: un buscador que
 * «completa» tres recámaras que nadie pidió esconde casas sin avisar. Donde dos
 * lecturas son razonables, el valor es una lista de las aceptadas.
 *
 * `lugar` se compara sin acentos y por contenido («centro» vale por «el centro»).
 * Las `palabras` se comparan por su raíz («jardín» vale por «jardines»).
 */
export const FRASES = [
  { frase: "casa de 3 recamaras en altozano", esperado: { tipo: "casa", recamaras: 3, lugar: "altozano" } },
  { frase: "depa en renta cerca del centro", esperado: { tipo: "departamento", operacion: "renta", lugar: "centro" } },
  { frase: "terreno barato en tarimbaro", esperado: { tipo: "terreno", lugar: "tarimbaro", orden: "precio_asc" } },
  { frase: "casas de menos de 2 millones", esperado: { tipo: "casa", precioMax: 2_000_000 } },
  {
    frase: "busco casa con alberca y jardin hasta 5 mdp",
    esperado: { tipo: "casa", precioMax: 5_000_000, palabras: ["alberca", "jardin"] },
  },
  {
    frase: "departamneto amueblado para rentar",
    esperado: { tipo: "departamento", operacion: "renta", palabras: ["amueblado"] },
  },
  {
    frase: "quiero comprar una casa de una planta para mis papás",
    esperado: { tipo: "casa", operacion: "venta", palabras: ["una planta"] },
  },
  {
    frase: "casa entre 3 y 4.5 millones con 4 recámaras y 3 baños",
    esperado: { tipo: "casa", precioMin: 3_000_000, precioMax: 4_500_000, recamaras: 4, banos: 3 },
  },
  { frase: "renta de oficina", esperado: { tipo: "oficina", operacion: "renta" } },
  { frase: "bodega en venta", esperado: { tipo: "bodega", operacion: "venta" } },
  {
    frase: "casa en tres marias con cochera para 2 autos",
    esperado: { tipo: "casa", lugar: "tres marias", palabras: ["cochera"] },
  },
  { frase: "algo económico para invertir", esperado: { operacion: ["venta", null], orden: "precio_asc" } },
  { frase: "la casa más grande que tengan", esperado: { tipo: "casa", orden: "m2_desc" } },
  { frase: "casa en patzcuaro", esperado: { tipo: "casa", lugar: "patzcuaro" } },
  {
    frase: "depas nuevos en venta por altosano de 2 recamaras",
    esperado: { tipo: "departamento", operacion: "venta", lugar: "altosano", recamaras: 2 },
  },
  { frase: "renta casa 15 mil al mes", esperado: { tipo: "casa", operacion: "renta", precioMax: 15_000 } },
  {
    frase: "casa 4 rec 3 baños lomas de santa maria",
    esperado: { tipo: "casa", recamaras: 4, banos: 3, lugar: "lomas de santa maria" },
  },
  { frase: "local comercial sobre avenida camelinas", esperado: { tipo: "local", lugar: "camelinas" } },
  {
    frase: "casa de lujo con roof garden",
    esperado: { tipo: "casa", orden: ["precio_desc", null], palabras: ["roof garden"] },
  },
  {
    frase: "casa en privada con vigilancia menos de 3.5 millones",
    esperado: { tipo: "casa", precioMax: 3_500_000, palabras: ["privada", "vigilancia"] },
  },
  { frase: "edificio para inversion", esperado: { tipo: "edificio", operacion: ["venta", null] } },
  {
    frase: "casa amplia para familia grande minimo 4 recamaras",
    esperado: { tipo: "casa", recamaras: 4, orden: ["m2_desc", null] },
  },
  {
    frase: "quiero rentar un departamento de 2 recámaras que no pase de 12000",
    esperado: { tipo: "departamento", operacion: "renta", recamaras: 2, precioMax: 12_000 },
  },
  { frase: "kasa en benta 3 rrecamaras", esperado: { tipo: "casa", operacion: "venta", recamaras: 3 } },
  {
    frase: "propiedades en morelia de 1 a 2 millones",
    esperado: { lugar: "morelia", precioMin: 1_000_000, precioMax: 2_000_000 },
  },
  {
    frase: "casa con 3 recamaras y 2 baños y medio en el prado",
    esperado: { tipo: "casa", recamaras: 3, banos: 2, lugar: "prado" },
  },
  { frase: "mas de 10 millones", esperado: { precioMin: 10_000_000 } },
  { frase: "terrenos en venta jesus del monte", esperado: { tipo: "terreno", operacion: "venta", lugar: "jesus del monte" } },
  {
    frase: "necesito un lugar donde vivir con mi familia, tres cuartos, que tenga jardín para el perro",
    esperado: { recamaras: 3, tipo: ["casa", null], operacion: [null, "venta", "renta"], palabras: ["jardin"] },
  },
  // Una cifra suelta es un tope: nadie busca «de 800 mil para arriba» sin decirlo.
  { frase: "depto 800 mil pesos", esperado: { tipo: "departamento", precioMax: 800_000, precioMin: [null, 800_000] } },
  // ── Segunda tanda: lo que confunde a un modelo ──
  // Metros y pisos NO son precios.
  { frase: "terreno de 200 metros en tarimbaro", esperado: { tipo: "terreno", lugar: "tarimbaro" } },
  { frase: "bodega de 500 m2", esperado: { tipo: "bodega" } },
  {
    frase: "casa 2 pisos 3 recamaras 2 baños",
    esperado: { tipo: "casa", recamaras: 3, banos: 2, palabras: [["2 pisos"], ["dos pisos"], []] },
  },
  { frase: "departamento en el tercer piso con elevador", esperado: { tipo: "departamento", palabras: [["elevador"], ["elevador", "tercer piso"]] } },
  // Cantidades escritas como habla la gente.
  { frase: "casa de 2 millones y medio", esperado: { tipo: "casa", precioMax: 2_500_000, precioMin: [null, 2_500_000] } },
  { frase: "casa por 3 millones 200 mil", esperado: { tipo: "casa", precioMax: 3_200_000, precioMin: [null, 3_200_000] } },
  {
    frase: "rento casa amueblada por camelinas 18mil",
    esperado: { tipo: "casa", operacion: "renta", lugar: "camelinas", precioMax: 18_000, precioMin: [null, 18_000], palabras: ["amueblada"] },
  },
  {
    frase: "oficinas en renta en el centro de 10 mil a 20 mil",
    esperado: { tipo: "oficina", operacion: "renta", lugar: "centro", precioMin: 10_000, precioMax: 20_000 },
  },
  {
    frase: "casas en altozano de 3 a 5 millones con 3 recamaras",
    esperado: { tipo: "casa", lugar: "altozano", precioMin: 3_000_000, precioMax: 5_000_000, recamaras: 3 },
  },
  {
    frase: "casa economica infonavit 600 mil",
    esperado: { tipo: "casa", orden: "precio_asc", precioMax: 600_000, precioMin: [null, 600_000], palabras: ["infonavit"] },
  },
  {
    frase: "busco terreno para construir en jesus del monte de 1 millon",
    esperado: { tipo: "terreno", lugar: "jesus del monte", precioMax: 1_000_000, precioMin: [null, 1_000_000], palabras: [[], ["construir"]] },
  },
  // Rasgos, negaciones y preguntas.
  { frase: "casa con alberca", esperado: { tipo: "casa", palabras: ["alberca"] } },
  { frase: "casa sin escaleras", esperado: { tipo: "casa" } },
  {
    frase: "casa con 3 recamaras, estudio y cuarto de servicio",
    esperado: { tipo: "casa", recamaras: 3, palabras: ["estudio", "cuarto de servicio"] },
  },
  { frase: "penthouse con terraza", esperado: { tipo: "departamento", palabras: ["terraza"] } },
  { frase: "casa con vista al lago en patzcuaro", esperado: { tipo: "casa", lugar: "patzcuaro", palabras: [["vista al lago"], ["vista", "lago"], ["lago"]] } },
  { frase: "tienen casas en tres marias?", esperado: { tipo: "casa", lugar: "tres marias" } },
  { frase: "casa cerca del tec de morelia", esperado: { tipo: "casa", lugar: [ "tec de morelia", "tec", "morelia"] } },
  { frase: "en que colonias tienen casas", esperado: { tipo: "casa" } },
  // Lo que NO es una búsqueda de casas: aquí lo correcto es no filtrar por nada.
  { frase: "hola buenas tardes", esperado: {} },
  { frase: "cuál es su horario de atención", esperado: {} },
];
