"""Run paired low-column probes and continuations from an extracted Western case list."""
import argparse
import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("phase", choices=["probe", "continue", "score"])
p.add_argument("cases", type=Path)
p.add_argument("promotion", type=Path)
p.add_argument("out", type=Path)
p.add_argument("--jobs", type=int, default=6)
args = p.parse_args()
out = args.out.resolve()
cases = json.loads(args.cases.read_text())
assert len(cases) == 52 and len({(r["match"], r["at"]) for r in cases}) == 52
promotion = args.promotion.resolve()
runner = Path(__file__).with_name("ai-low-column-fork.mjs")

def paired_seed(row, replicate):
    key = f"western-low-column:{row['match']}:{row['at']}:{replicate}"
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:4], "big")

def destination(row, replicate):
    return out / ("probe" if replicate == 0 else "paired") / f"{row['match']}-{row['at']}-{replicate}.json"

def read(row, replicate):
    data = json.loads(destination(row, replicate).read_text())
    assert (data["match"], data["at"], data["seed"]) == (row["match"], row["at"], paired_seed(row, replicate) if replicate else None)
    return data

def run(task):
    row, replicate = task
    final = destination(row, replicate)
    if final.exists():
        read(row, replicate)
        return
    final.parent.mkdir(parents=True, exist_ok=True)
    temp = final.with_suffix(".tmp")
    cmd = ["node", str(runner), "--save", row["save"], "--at", str(row["at"]), "--out", str(temp),
           "--engine", str(promotion / "frozen-v90-standard/dist"), "--candidate", str(out / "dist"),
           "--old-axis", str(promotion / "frozen-v88-standard/dist"), "--old-allied", str(promotion / "frozen-v86/dist")]
    if replicate:
        cmd.extend(["--seed", str(paired_seed(row, replicate))])
    subprocess.run(cmd, check=True)
    temp.replace(final)
    read(row, replicate)

def score():
    import random
    import statistics as st
    from collections import Counter
    games = [r for r in json.loads((Path(cases[0]["save"]).parent / "summary.json").read_text())["records"]
             if r["sides"]["axis"]["policy"] == "heuristic"]
    assert len(games) == len({r["seeds"]["map"] for r in games}) == 40
    map_effects = {r["match"]: 0.0 for r in games}
    classification = Counter()
    events = []
    for row in cases:
        probe = read(row, 0)
        classification[probe["classification"]] += 1
        if not probe["changed"]:
            continue
        pairs = [read(row, rep) for rep in [1, 2]]
        deltas = []
        for pair in pairs:
            for arm in ["candidate", "baseline"]:
                assert pair[arm]["choice"]["action"] == probe[arm]["choice"]["action"]
            deltas.append({k: pair["candidate"]["terminal"][k] - pair["baseline"]["terminal"][k]
                           for k in ["vpMargin", "kill", "loss", "axisUnfed", "alliedUnfed", "axisAttritionLoss", "alliedAttritionLoss"]})
            obs = [pair[a]["nextFriendlyTurn"] for a in ["candidate", "baseline"]]
            assert (obs[0] is None) == (obs[1] is None)
            if obs[0] is not None:
                deltas[-1]["nextTargetHeld"] = int(obs[0]["targetHeld"]) - int(obs[1]["targetHeld"])
        event = {k: st.mean(d[k] for d in deltas if k in d) for k in set.union(*(set(d) for d in deltas))}
        map_effects[row["match"]] += event["vpMargin"]
        events.append(dict(match=row["match"], at=row["at"], **event))
    rng = random.Random(19090)
    values = list(map_effects.values())
    boot = sorted(st.mean(rng.choices(values, k=40)) for _ in range(10000))
    result = dict(classification=classification, changed=len(events), events=events, mapEffects=map_effects,
                  perMap=st.mean(values), interval=[boot[249], boot[9749]], perEvent=sum(values)/len(cases))
    (out / "score.json").write_text(json.dumps(result, indent=2) + "\n")
    print(result["classification"], result["perMap"], result["interval"])

if args.phase == "score":
    score()
else:
    tasks = [(r, 0) for r in cases] if args.phase == "probe" else [(r, n) for r in cases if read(r, 0)["changed"] for n in [1, 2]]
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        list(pool.map(run, tasks))
