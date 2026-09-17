// El último campo de «Especificaciones» se traga los nombres de las categorías
// que vienen después en la ficha («Planta baja: Si Casa nueva Morelia»). Esto los quita.
const fs = require("fs");
const path = require("path");

const archivo = path.join(__dirname, "inventario_propiedades.json");
const inv = JSON.parse(fs.readFileSync(archivo, "utf8"));
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let limpiados = 0;
for (const p of inv) {
  const categorias = [...p["type-of-housing"], ...p["property-type"], ...p.location, ...p.purpose];
  for (const [campo, valor] of Object.entries(p.specs || {})) {
    let nuevo = valor;
    for (const c of categorias) nuevo = nuevo.replace(new RegExp(`\\s+${escapar(c)}(?=\\s|$)`, "g"), "");
    nuevo = nuevo.trim();
    if (nuevo !== valor) {
      p.specs[campo] = nuevo;
      limpiados++;
    }
  }
}
fs.writeFileSync(archivo, JSON.stringify(inv, null, 1));

const plantaBaja = {};
for (const p of inv) plantaBaja[p.specs["Planta baja"]] = (plantaBaja[p.specs["Planta baja"]] || 0) + 1;
console.log("campos limpiados:", limpiados, "| valores de «Planta baja»:", JSON.stringify(plantaBaja));
