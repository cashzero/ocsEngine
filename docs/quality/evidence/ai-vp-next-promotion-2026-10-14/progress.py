from pathlib import Path
import sys
root=Path('tmp/ai-match/vp-next-2026-10-14');v=sys.argv[1];total=0
for g in ['meeting','attack']:
 for style in ['temperate','eastern']:
  p=root/f'{g}-v{v}-{style}';n=sum(1 for _ in p.glob('*.save.json'));total+=n
  print(g,style,n,'/20','supply',(p/'supply-attribution.json').exists(),'advances',(p/'advance-supply.json').exists())
print('total',total,'/80')
