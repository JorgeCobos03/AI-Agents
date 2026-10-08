import argparse
import asyncio
import json
from pathlib import Path
from .runtime import Incident, run

parser = argparse.ArgumentParser(description="Run the AI-Agents reference pipeline")
parser.add_argument("--native", help="Path to compiled C++ shared library")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
model = json.loads((root / "web/model.json").read_text())
tasks = [Incident("INC-01", "Token leak exposes private credentials", 4, 80), Incident("INC-02", "Database timeout and service unavailable", 3, 70), Incident("INC-03", "Slow query and high latency", 2, 50)]
print(json.dumps(asyncio.run(run(model, tasks, 6, args.native)), indent=2))
