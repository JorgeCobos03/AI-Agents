"""Build reproducibly with Zig 0.13.0: pip install ziglang==0.13.0."""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
subprocess.run([
    sys.executable, "-m", "ziglang", "c++", "-target", "wasm32-freestanding",
    "-std=c++20", "-O2", "-nostdlib", "-fno-exceptions", "-fno-rtti",
    "-Wl,--no-entry", "-Wl,--export=set_task", "-Wl,--export=solve",
    str(ROOT / "cpp/planner.cpp"), "-o", str(ROOT / "web/planner.wasm"),
], check=True)
