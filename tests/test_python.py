import asyncio
import itertools
import json
import random
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from agents.model import predict, train, tokenize
from agents.runtime import Incident, plan, run


class AgentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = json.loads((ROOT / "web/model.json").read_text())

    def test_reproducible_training(self):
        corpus = json.loads((ROOT / "data/corpus.json").read_text(encoding="utf-8"))
        rows = [{"text": text, "label": label} for label, texts in corpus["train"].items() for text in texts]
        self.assertEqual(train(rows), self.model)
        self.assertEqual(tokenize("AUTENTICACIÓN"), ["autenticacion"])
        self.assertEqual(predict(self.model, "xyzzy quux")["label"], "unknown")

    def test_reference_against_brute_force(self):
        rng = random.Random(42)
        for _ in range(50):
            tasks = [Incident(str(i), "test", rng.randint(1, 8), rng.randint(1, 100)) for i in range(7)]
            budget = rng.randint(0, 20)
            selected = plan(tasks, budget)
            best = max(sum(t.impact for t, on in zip(tasks, bits) if on) for bits in itertools.product((False, True), repeat=7) if sum(t.cost for t, on in zip(tasks, bits) if on) <= budget)
            self.assertEqual(sum(t.impact for t in tasks if t.id in selected), best)

    def test_pipeline_and_validation(self):
        tasks = [Incident("1", "token leak password", 3, 70), Incident("2", "slow query latency", 3, 80)]
        result = asyncio.run(run(self.model, tasks, 3))
        self.assertEqual(result["selected"], ["1"])
        self.assertTrue(result["review"]["withinBudget"])
        with self.assertRaises(ValueError):
            plan(tasks, -1)
        with self.assertRaises(ValueError):
            plan([tasks[0], tasks[0]], 3)


if __name__ == "__main__":
    unittest.main()
