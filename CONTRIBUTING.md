# Contributing

Open an issue explaining the problem or submit a focused pull request with the behavior change and validation. Do not add credentials, production incident data, or paid dependencies to the public demo.

1. Run `python scripts/train.py` after corpus/model changes and inspect the evaluation limitations.
2. Rebuild `web/planner.wasm` with `python scripts/build_wasm.py` after C++ changes.
3. Run `python -m unittest discover -s tests -p "test_*.py" -v`, `npm test` and `npm run build`.
4. Check team mode, all three individual agents, zero budget, uncertainty, cancellation and JSON export in a browser.
5. Check narrow screens and keyboard navigation. Preserve the static asset budget and local-only inference.

Never claim quality improvements solely from the tiny synthetic test set. Add meaningful cases and document tradeoffs. The public C ABI is bounded and stateful; preserve input checks and test native/Wasm parity.
