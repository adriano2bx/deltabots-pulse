#!/usr/bin/env python3
"""Aplicador do master DeltaBots 8C-1 sem reconstrução geométrica.

Dependências: pip install cairosvg pillow
Uso: python tools/apply_official_logo.py /path/to/deltabots_symbol_8C1_master_white.svg
Cria brand/applied/ e atualiza os SVGs de mockup inserindo master por <image data:...>.
Não modifica o arquivo original. NÃO aplica cores, inversões nem redesenha path.
"""
from pathlib import Path
import sys,base64,hashlib,io
from PIL import Image
import cairosvg
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
NS='http://www.w3.org/2000/svg'; ET.register_namespace('',NS)

def apply_master(source:Path):
 assert source.is_file() and source.suffix.lower()=='.svg', 'Arquivo master SVG obrigatório'
 blob=source.read_bytes(); master=ET.fromstring(blob)
 assert master.tag.endswith('svg'), 'Master deve ser SVG válido'
 assert len(blob)<3_000_000,'Master maior que limite conservador'
 # Verifica integridade de input, mas não substitui homologação humana da arte canônica.
 out=ROOT/'brand/applied';out.mkdir(parents=True,exist_ok=True)
 (out/'MASTER_SHA256.txt').write_text(hashlib.sha256(blob).hexdigest()+'  '+source.name+'\n')
 image_data='data:image/svg+xml;base64,'+base64.b64encode(blob).decode('ascii')
 done=0
 for base in [ROOT/'android/screens/svg',ROOT/'web/screens/svg']:
  for p in base.glob('*.svg'):
   tree=ET.parse(p);root=tree.getroot()
   for parent in root.iter():
    for child in list(parent):
     if child.attrib.get('id')=='brand-slot':
      x,y,size=None,None,None
      rectangle=next((e for e in child if e.tag.endswith('rect')),None)
      if rectangle is None:continue
      x,y,size=[rectangle.attrib[a] for a in ('x','y','width')]
      idx=list(parent).index(child)
      parent.remove(child)
      image=ET.Element('{%s}image'%NS,{'x':x,'y':y,'width':size,'height':size,'href':image_data,'preserveAspectRatio':'xMidYMid meet','id':'official-brand-master'})
      parent.insert(idx,image)
      done+=1
   target=out/'screens'/p.relative_to(ROOT).as_posix()
   target.parent.mkdir(parents=True,exist_ok=True)
   tree.write(target,encoding='utf-8',xml_declaration=True)
 # Master rasterizado com PRESERVAÇÃO DE GEOMETRIA e margem 20% para ícones
 png=cairosvg.svg2png(bytestring=blob,output_width=720,output_height=720)
 original=Image.open(io.BytesIO(png)).convert('RGBA')
 # Responsabilidade do usuário inspecionar dimensões, corte e área segura do master.
 for density,px in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
  canvas=Image.new('RGBA',(px,px),(0,0,0,0));side=int(px*.68)
  inset=original.resize((side,side),Image.Resampling.LANCZOS)
  canvas.alpha_composite(inset,((px-side)//2,(px-side)//2))
  dest=out/'android'/'res'/('mipmap-'+density)/'ic_launcher_foreground.png';dest.parent.mkdir(parents=True,exist_ok=True);canvas.save(dest)
 for px in (32,64,192,512):
  dest=out/'web'/f'brand_{px}.png';dest.parent.mkdir(parents=True,exist_ok=True)
  original.resize((px,px),Image.Resampling.LANCZOS).save(dest)
 print('Original SHA256:',hashlib.sha256(blob).hexdigest())
 print('Slots substituídos:',done,'imagens na pasta',out)
 print('ATENÇÃO: revisão óptica manual e brand governance antes de release.')
if __name__=='__main__':
 if len(sys.argv)!=2:sys.exit('Uso: python tools/apply_official_logo.py /path/to/white_master.svg')
 apply_master(Path(sys.argv[1]))
