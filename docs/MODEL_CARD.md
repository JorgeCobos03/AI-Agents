# Model card

## Intended use

Educational bilingual incident triage and transparent multi-agent coordination. Not suitable for production security decisions, automated remediation, or decisions about people. No general language generation or external tool execution.

## Model and provenance

Multinomial Naive Bayes with Laplace smoothing (alpha=1), equal learned class priors on a balanced corpus, bag-of-word counts, lowercasing and accent normalization. The corpus is authored synthetic demonstration data distributed under the repository's MIT license. It contains no user data or scraped content. Training uses the Python standard library; exported log probabilities are consumed by JavaScript.

Classes: security, reliability, performance. There are 16 training and 6 held-out examples per class. The split is explicit in `data/corpus.json`; no test samples are used in training. Train/test wording is deliberately simple and similar, so held-out accuracy is optimistic. There is no external validation dataset.

## Evaluation

Run `python scripts/train.py` to regenerate `docs/evaluation.json`. Rows in its confusion matrix are actual labels; columns are predictions in the reported label order. A perfect score on 18 synthetic samples is not evidence of production accuracy. The UI displays uncalibrated posterior scores, not a claim about real-world correctness.

## Failure modes

- Unknown vocabulary produces `unknown` and requests human review in team mode.
- Mixed incidents, negation, sarcasm and long text can be misclassified.
- Repeating a familiar token can inflate posterior confidence.
- A confident prediction can still be wrong. The threshold is illustrative, not empirically calibrated.
- Spanish and English coverage is small. Other languages are unsupported.
- Classification-derived priority is a hand-written policy (+15 for security at posterior >=0.55), not a learned severity estimate.

## Versioning

Model version 1. Rebuilding from the committed corpus is deterministic. Commit corpus, exported model and evaluation report together. Keep domain-specific policies separate from model evaluation.
