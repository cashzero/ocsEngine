"""Report file completion only; never inspect partial VP results."""
from pathlib import Path
import sys

directory = Path(sys.argv[1])
count = 20 if directory.name.endswith('-independent') else 8
total = 0
for name in ['meeting-temperate', 'meeting-eastern', 'attack-temperate', 'attack-eastern']:
    folder = directory / name
    completed = len(list(folder.glob('*.save.json')))
    total += completed
    print(name, f'{completed}/{count}', 'summary', (folder / 'summary.json').exists(),
          'supply', (folder / 'supply-attribution.json').exists(), 'advances', (folder / 'advance-supply.json').exists())
print('total', f'{total}/{4 * count}')
