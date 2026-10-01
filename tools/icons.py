#!/usr/bin/env python3
# Rebuilds fonts/icons.woff2: the Material Symbols Outlined glyphs listed in src/ui.js ICONS (Apache 2.0, google/material-design-icons).
# usage: python3 tools/icons.py path/to/MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].ttf   (needs: pip install fonttools brotli)
import re, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ui = open(os.path.join(root, 'src/ui.js')).read()
block = ui[ui.index('const ICONS = {'):ui.index('};', ui.index('const ICONS = {'))]
cps = [int(h, 16) for h in re.findall(r'0x([0-9a-f]+)', block)]
font = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {'FILL': 0, 'GRAD': 0, 'opsz': 24, 'wght': 400})
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = []; opts.notdef_outline = True
sub = subset.Subsetter(opts); sub.populate(unicodes=cps); sub.subset(font)
out = os.path.join(root, 'fonts/icons.woff2')
font.flavor = 'woff2'; font.save(out)
print(len(cps), 'icons ->', out, os.path.getsize(out), 'bytes')
