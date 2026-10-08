"""Deterministic training and held-out evaluation; no third-party packages."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from agents.model import train, predict, LABELS

corpus = json.loads((ROOT / "data/corpus.json").read_text(encoding="utf-8"))
rows = [{"text": text, "label": label} for label, texts in corpus["train"].items() for text in texts]
model = train(rows)
tests = [{"text": text, "label": label} for label, texts in corpus["test"].items() for text in texts]
matrix = [[0] * 3 for _ in LABELS]
correct = 0
for row in tests:
    result = predict(model, row["text"])
    correct += result["label"] == row["label"]
    matrix[LABELS.index(row["label"])][LABELS.index(result["label"])] += 1
report = {"accuracy": correct / len(tests), "testSamples": len(tests), "trainingSamples": len(rows), "labels": LABELS, "confusionMatrix": matrix, "limitation": "Tiny synthetic held-out set authored with the training corpus. This does not establish real-world accuracy or calibration."}
(ROOT / "web/model.json").write_text(json.dumps(model, separators=(",", ":")) + "\n", encoding="utf-8")
(ROOT / "docs/evaluation.json").parent.mkdir(exist_ok=True)
(ROOT / "docs/evaluation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
