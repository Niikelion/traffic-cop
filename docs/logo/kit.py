"""Generates the traffic-cop logo kit masters. Run from docs/logo: python kit.py <path-to-Barlow-SemiBold.ttf>"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

NAVY = "#16233F"
LIGHTS = ["#F04A3E", "#F2B33D", "#34C26A"]  # red at the back, green at the front: the cap faces forward, "go"
OUT = "kit/"

# Symbol geometry (256 grid, before centring). Crown edges at 15° / 105°, back edge at 60°.
CROWN = "M64.5 121 Q58 110 70 107.9 L204 72 Q222 68 220 86 L207.14 134 H72 Z"
BAND = "M72 142 H206 V174 H72 Z"
VISOR = "M120 182 H206 C226 182 240 192 244 206 Q246 214 236 214 H168 C140 214 124 202 120 182 Z"
DASHES = [(72 + 14 + i * 38, 154, 20, 10) for i in range(3)]
DASH_PATH = " ".join(f"M{x} {y} h{w} v{h} h-{w} Z" for x, y, w, h in DASHES)
# Small-size cut: no dashes (they vanish below ~24 px), wider gaps so the three parts stay separate.
CROWN_S = "M64.5 121 Q58 110 70 107.9 L204 72 Q222 68 220 86 L208.75 128 H68.54 Z"
BAND_S = "M72 140 H206 V172 H72 Z"
VISOR_S = "M120 184 H206 C226 184 240 194 244 206 Q246 214 236 214 H168 C140 214 124 204 120 184 Z"
CENTER = (-25, -17)  # optical centring on the 256 canvas
BBOX = (37.2 + 25 - 25, 54.3, 219.3, 197.0)  # tight bounds after centring (from svg_audit)

def svg(w, h, inner, title="traffic-cop"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">'
            f'<title>{title}</title>{inner}</svg>\n')

def symbol_paths(color=None, dash=None, small=False):
    c = color or "#000"
    if small:
        return f'<path fill="{c}" d="{CROWN_S} {BAND_S} {VISOR_S}"/>'
    if dash:  # colour: solid band with painted dashes (cut-and-fill leaves an anti-aliasing halo)
        return f'<path fill="{c}" d="{CROWN} {BAND} {VISOR}"/>' + "".join(
            f'<path fill="{col}" d="M{x} {y} h{w} v{h} h-{w} Z"/>' for (x, y, w, h), col in zip(DASHES, dash))
    return f'<path fill="{c}" d="{CROWN} {VISOR}"/><path fill="{c}" fill-rule="evenodd" d="{BAND} {DASH_PATH}"/>' 

def g(inner, tx, ty, s=1):
    return f'<g transform="translate({tx:g} {ty:g}) scale({s:g})">{inner}</g>'

def wordmark(font_path, text="traffic-cop"):
    f = TTFont(font_path)
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    upm = f["head"].unitsPerEm
    pen = SVGPathPen(gs)
    x = 0
    for ch in text:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))  # flip y: baseline at 0, up is negative
        x += hmtx[name][0]
    bp = BoundsPen(gs); x = 0
    for ch in text:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(bp, (1, 0, 0, 1, x, 0))); x += hmtx[name][0]
    xmin, ymin, xmax, ymax = bp.bounds
    xh = f["OS/2"].sxHeight
    return pen.getCommands(), (xmin, ymin, xmax, ymax), xh, upm

def main(font_path):
    tx, ty = CENTER
    # Symbol masters
    open(OUT + "traffic-cop-symbol.svg", "w").write(svg(256, 256, g(symbol_paths(), tx, ty)))
    open(OUT + "traffic-cop-symbol-color.svg", "w").write(svg(256, 256, g(symbol_paths(NAVY, LIGHTS), tx, ty)))
    open(OUT + "traffic-cop-symbol-reversed.svg", "w").write(svg(256, 256, g(symbol_paths("#fff", LIGHTS), tx, ty)))
    open(OUT + "traffic-cop-symbol-small.svg", "w").write(svg(256, 256, g(symbol_paths(small=True), tx, ty)))

    # Wordmark
    d, (wx0, wy0, wx1, wy1), xh, upm = wordmark(font_path)
    sx0, sy0, sx1, sy1 = BBOX
    sym_h, sym_w = sy1 - sy0, sx1 - sx0
    # Horizontal lockup: x-height = band+visor zone ≈ 0.42 × symbol height, x-height centred on the band.
    k = (0.42 * sym_h) / xh
    band_mid = 158 + ty  # band centre after centring
    base = band_mid + xh * k / 2
    gap = 0.22 * sym_h
    wx = sx1 + gap - wx0 * k
    W = sx1 + gap + (wx1 - wx0) * k + sx0  # mirror the left margin on the right
    word = lambda col: f'<path fill="{col}" transform="translate({wx:.2f} {base:.2f}) scale({k:.5f})" d="{d}"/>'
    for name, sc, wc, dc in (("", NAVY, NAVY, LIGHTS), ("-black", "#000", "#000", None), ("-reversed", "#fff", "#fff", LIGHTS)):
        inner = g(symbol_paths(sc, dc), tx, ty) + word(wc)
        open(OUT + f"traffic-cop-horizontal{name}.svg", "w").write(svg(round(W), 256, inner))

    # Stacked lockup: wordmark centred under the symbol.
    k2 = (0.23 * sym_h) / xh
    ww = (wx1 - wx0) * k2
    Ws = max(256, ww + 2 * sx0)
    sym_dx = (Ws - 256) / 2
    base2 = sy1 + 0.14 * sym_h + (wy1) * k2  # ascender top sits below the visor
    Hs = base2 + sy0 * 0.9
    word2 = lambda col: f'<path fill="{col}" transform="translate({(Ws - ww) / 2 - wx0 * k2:.2f} {base2:.2f}) scale({k2:.5f})" d="{d}"/>'
    for name, sc, wc, dc in (("", NAVY, NAVY, LIGHTS), ("-black", "#000", "#000", None)):
        inner = g(symbol_paths(sc, dc), tx + sym_dx, ty) + word2(wc)
        open(OUT + f"traffic-cop-stacked{name}.svg", "w").write(svg(round(Ws), round(Hs), inner))

    # Wordmark only
    pad = 8
    wmw, wmh = (wx1 - wx0) * k + 2 * pad, (wy1 - wy0) * k + 2 * pad
    open(OUT + "traffic-cop-wordmark.svg", "w").write(svg(round(wmw), round(wmh),
        f'<path fill="{NAVY}" transform="translate({pad - wx0 * k:.2f} {pad + wy1 * k:.2f}) scale({k:.5f})" d="{d}"/>'))

if __name__ == "__main__":
    main(sys.argv[1])

def app_icon():
    tx, ty = CENTER
    tile = f'<rect width="256" height="256" rx="56" fill="{NAVY}"/>'
    s = 0.66
    mark = g(g(symbol_paths("#fff", LIGHTS), tx, ty), 128 * (1 - s), 128 * (1 - s) - 4, s)
    open(OUT + "traffic-cop-app-icon-color.svg", "w").write(svg(256, 256, tile + mark))

if __name__ == "__main__":
    app_icon()
