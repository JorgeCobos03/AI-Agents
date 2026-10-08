"""Multinomial Naive Bayes text classification, using only the standard library."""
from collections import Counter
import math
import re
import unicodedata

LABELS = ("security", "reliability", "performance")


def tokenize(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFD", text.lower())
    normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", normalized)


def train(rows: list[dict]) -> dict:
    counts = {label: Counter() for label in LABELS}
    docs = Counter()
    for row in rows:
        counts[row["label"]].update(tokenize(row["text"]))
        docs[row["label"]] += 1
    vocabulary = sorted(set().union(*(c.keys() for c in counts.values())))
    return {
        "algorithm": "multinomial-naive-bayes", "version": 1,
        "labels": list(LABELS), "vocabulary": vocabulary,
        "logPrior": [math.log(docs[label] / len(rows)) for label in LABELS],
        "logLikelihood": [[math.log((counts[label][word] + 1) / (sum(counts[label].values()) + len(vocabulary))) for word in vocabulary] for label in LABELS],
        "trainingSamples": len(rows),
        "notice": "Educational model trained on a small synthetic bilingual corpus; probabilities are not calibrated. Not an LLM.",
    }


def predict(model: dict, text: str) -> dict:
    index = {word: i for i, word in enumerate(model["vocabulary"])}
    tokens = [word for word in tokenize(text) if word in index]
    scores = [prior + sum(model["logLikelihood"][c][index[word]] for word in tokens) for c, prior in enumerate(model["logPrior"])]
    weights = [math.exp(score - max(scores)) for score in scores]
    probabilities = [weight / sum(weights) for weight in weights]
    best = max(range(len(scores)), key=scores.__getitem__)
    return {"label": model["labels"][best] if tokens else "unknown", "confidence": probabilities[best], "knownTokens": len(tokens), "probabilities": probabilities}
