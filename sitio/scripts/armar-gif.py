"""Arma un GIF con los fotogramas de `scripts/filmar.mjs`, a velocidad real.

   py scripts/armar-gif.py <carpeta> <salida.gif> [--caja x0,y0,x1,y1] [--escala 0.7]
                           [--desde N] [--hasta N]

Necesita Pillow (`py -m pip install pillow`). Es la unica pieza del proyecto en
Python: Node no trae con que escribir un GIF, y en esta maquina no hay ffmpeg.

Lo que no se adivina:
- Cada cuadro dura lo que duro DE VERDAD (`tiempos.json`): las capturas tardan
  ~180 ms con la pagina a media animacion y ~110 en reposo. Con una duracion
  fija la entrada salia al doble de velocidad.
- UNA sola paleta para todo el GIF, sacada del ultimo cuadro (que ya trae todos
  los colores): con paleta por cuadro, los planos de color parpadean.
- Sin tramado (`dither=NONE`): en dibujos de linea el tramado ensucia los
  bordes y triplica el peso.
- Sale ligero a proposito: 110 cuadros de 956x633 pesan ~200 KB, porque entre
  un cuadro y otro casi nada cambia.

Sin acentos en este archivo, por la consola de Windows.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("carpeta")
parser.add_argument("salida")
parser.add_argument("--caja", default="", help="recorte x0,y0,x1,y1 (en pixeles del fotograma)")
parser.add_argument("--escala", type=float, default=1.0)
parser.add_argument("--desde", type=int, default=0)
parser.add_argument("--hasta", type=int, default=10**9)
args = parser.parse_args()

rutas = sorted(Path(args.carpeta).glob("f*.png"))
rutas = [r for r in rutas if args.desde <= int(r.stem[1:]) <= args.hasta]
if not rutas:
    raise SystemExit(f"No hay fotogramas en {args.carpeta}")

caja = tuple(int(v) for v in args.caja.split(",")) if args.caja else None
cuadros = []
for ruta in rutas:
    img = Image.open(ruta).convert("RGB")
    if caja:
        img = img.crop(caja)
    if args.escala != 1.0:
        img = img.resize((round(img.width * args.escala), round(img.height * args.escala)), Image.LANCZOS)
    cuadros.append(img)

paleta = cuadros[-1].quantize(colors=48, method=Image.MEDIANCUT, dither=Image.NONE)
indexados = [c.quantize(palette=paleta, dither=Image.NONE) for c in cuadros]

duraciones = 110
horas = Path(args.carpeta) / "tiempos.json"
if horas.exists():
    t = json.loads(horas.read_text())
    t = [t[int(r.stem[1:])] for r in rutas]
    duraciones = [max(20, t[i + 1] - t[i]) for i in range(len(t) - 1)] + [110]

indexados[0].save(
    args.salida,
    save_all=True,
    append_images=indexados[1:],
    duration=duraciones,
    loop=0,
    optimize=True,
    disposal=1,
)
print("guardado", args.salida, indexados[0].size, len(indexados), "cuadros,", round(Path(args.salida).stat().st_size / 1024), "KB")
