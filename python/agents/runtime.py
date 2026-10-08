"""Async message-passing agents with a bounded, typed shared state."""
import asyncio
import ctypes
from dataclasses import dataclass, asdict
from .model import predict


@dataclass(frozen=True)
class Incident:
    id: str
    text: str
    cost: int
    impact: int


def validate(incidents: list[Incident], budget: int) -> None:
    if type(budget) is not int or not 0 <= budget <= 100 or not 1 <= len(incidents) <= 20:
        raise ValueError("Expected 1–20 incidents and integer budget 0–100")
    if len({i.id for i in incidents}) != len(incidents):
        raise ValueError("Duplicate incident IDs")
    for i in incidents:
        if not isinstance(i.text, str) or not 1 <= len(i.text) <= 500 or type(i.cost) is not int or not 1 <= i.cost <= 100 or type(i.impact) is not int or not 1 <= i.impact <= 100:
            raise ValueError("Invalid incident")


def plan(incidents: list[Incident], budget: int, library: str | None = None) -> list[str]:
    validate(incidents, budget)
    if library:
        native = ctypes.CDLL(library)
        native.set_task.argtypes = [ctypes.c_int] * 3
        native.set_task.restype = ctypes.c_int
        native.solve.argtypes = [ctypes.c_int] * 2
        native.solve.restype = ctypes.c_int
        for index, task in enumerate(incidents):
            if native.set_task(index, task.cost, task.impact) != 0:
                raise RuntimeError("C++ rejected task")
        mask = native.solve(len(incidents), budget)
        if mask < 0:
            raise RuntimeError("C++ planner failed")
    else:
        states = [(0, 0)] * (budget + 1)
        for index, task in enumerate(incidents):
            previous = states[:]
            for b in range(task.cost, budget + 1):
                value, bits = previous[b - task.cost]
                if value + task.impact > previous[b][0]:
                    states[b] = (value + task.impact, bits | (1 << index))
        mask = states[budget][1]
    return [task.id for index, task in enumerate(incidents) if mask & (1 << index)]


async def run(model: dict, incidents: list[Incident], budget: int, library: str | None = None) -> dict:
    validate(incidents, budget)
    events = []
    async def classify(task: Incident) -> dict:
        await asyncio.sleep(0)  # Cooperative scheduling; independent per-incident inference.
        result = {**asdict(task), **predict(model, task.text)}
        events.append({"agent": "analyst", "incident": task.id, "label": result["label"]})
        return result
    analyses = await asyncio.gather(*(classify(task) for task in incidents))
    # Learned classification affects the plan via an explicit, inspectable policy.
    weighted = [Incident(t.id, t.text, t.cost, min(100, t.impact + (15 if a["label"] == "security" and a["confidence"] >= .55 else 0))) for t, a in zip(incidents, analyses)]
    selected = plan(weighted, budget, library)
    events.append({"agent": "planner", "selected": selected})
    used = sum(t.cost for t in incidents if t.id in selected)
    review = {"withinBudget": used <= budget, "used": used, "requiresHumanReview": any(a["confidence"] < .55 or a["label"] == "unknown" for a in analyses)}
    events.append({"agent": "reviewer", **review})
    return {"analyses": analyses, "selected": selected, "review": review, "events": events}
