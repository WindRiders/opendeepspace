"""Test DeepSpace config loading."""
import os, re, yaml, sys
from pathlib import Path

# Use relative paths from this file's location
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))
os.chdir(str(project_root))

with open("config/config.yaml") as f:
    raw = f.read()

def expand_env(match):
    val = os.environ.get(match.group(1), "")
    return val

raw = re.sub(r'\$\{(\w+)\}', expand_env, raw)
cfg = yaml.safe_load(raw)

api_key = cfg["llm"]["api_key"]
print(f"API key length: {len(api_key)}")
print(f"API key starts with: {api_key[:8]}")
print("OK")