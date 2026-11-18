"""Prepare a research-only derivative of the frozen heuristic@90 JavaScript build."""
import argparse
import hashlib
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("frozen_dist", type=Path)
parser.add_argument("output_dist", type=Path)
args = parser.parse_args()
relative = Path("ai/policies/heuristic.js")
source = (args.frozen_dist / relative).read_bytes()
original = b"vacate * contestedVp(objective) * w.objectiveTaken * (effortTarget ? w.assaultObjective : 1)"
if source.count(original) != 1:
    raise ValueError("Expected one positive objective score term in the frozen build")
factor = b"(situation.attack && !situation.defending && action.combatKind === 'REGULAR' && context.view.projection?.sequence.phase === 'COMBAT' && forecast.columnIndex <= 3 ? 0.5 : 1)"
shutil.copytree(args.frozen_dist, args.output_dist)
candidate = source.replace(original, original + b" * " + factor)
(args.output_dist / relative).write_bytes(candidate)
print("baseline", hashlib.sha256(source).hexdigest(), "candidate", hashlib.sha256(candidate).hexdigest())
