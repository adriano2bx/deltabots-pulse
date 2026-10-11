from pathlib import Path
import json,xml.etree.ElementTree as ET
from PIL import Image
root=Path(__file__).resolve().parents[1]
assert len(list((root/'android/screens/svg').glob('A*.svg')))==76
assert len(list((root/'web/screens/svg').glob('W*.svg')))==58
assert len(list((root/'wearable/mi-band-3/monochrome-80x128/png-1bit').glob('*.png')))==24
for p in (root/'android/screens/svg').glob('*.svg'): ET.parse(p)
for p in (root/'web/screens/svg').glob('*.svg'): ET.parse(p)
for p in (root/'wearable/mi-band-3/monochrome-80x128/svg').glob('*.svg'): ET.parse(p)
for p in (root/'wearable/mi-band-3/monochrome-80x128/png-1bit').glob('*.png'):
 im=Image.open(p); assert im.mode=='1' and im.size==(80,128),(p,im.mode,im.size)
assert not (root/'brand/approved/deltabots_symbol_8C1_master_white.svg').exists(), 'Check manually against canonical approval if master has been supplied'
print('PASS: 76 Android, 58 web, 24 wearable PNG 1-bit 80x128, all SVG parse')
