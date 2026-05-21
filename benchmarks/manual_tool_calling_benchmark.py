"""Tool calling benchmark for Qwen3.5-9B-MLX-4bit.
Tests whether this model can serve as the base for a Claude Code-like agent.
"""

import json, time, sys, re
from pathlib import Path
import mlx.core as mx
from mlx_lm import load, stream_generate
from mlx_lm.sample_utils import make_sampler

MODEL_PATH = str(Path(__file__).parent.parent / "Qwen3.5-9B-MLX-4bit")

# ── 8 tools mirroring Claude Code's core set ──
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file from the filesystem. Returns the file contents with line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to the file to read"}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create a new file or overwrite an existing file with new content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to the file"},
                    "content": {"type": "string", "description": "The content to write"}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Perform exact string replacement in an existing file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path to the file"},
                    "old_string": {"type": "string", "description": "The text to replace"},
                    "new_string": {"type": "string", "description": "The text to replace it with"}
                },
                "required": ["file_path", "old_string", "new_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Execute a shell command and return its output. Use for git, running tests, installing packages, etc. Prefer read_file/grep for file operations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to execute"},
                    "description": {"type": "string", "description": "Short description of what this command does"}
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "Search file contents using regex patterns. Returns matching lines with file paths and line numbers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "The regex pattern to search for"},
                    "path": {"type": "string", "description": "Directory or file path to search in"},
                    "include": {"type": "string", "description": "File pattern to include, e.g. '*.py'"}
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": "Find files matching a glob pattern.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern, e.g. 'src/**/*.ts'"}
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information. Use for documentation, error messages, API references.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "task",
            "description": "Launch a sub-agent to handle a complex multi-step task autonomously. Use for tasks that require many steps or would clutter the context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Short (3-5 word) description of what the sub-agent will do"},
                    "prompt": {"type": "string", "description": "The complete task description for the sub-agent"}
                },
                "required": ["description", "prompt"]
            }
        }
    }
]

# ── Test cases ──
# Format: (instruction, expected_tool, expected_params_subset, category)
# category: "single" | "param" | "multi" | "edge"

TEST_CASES = [
    # ── Single tool selection (10 cases) ──
    (
        "Read the file /Users/phoenix/config.json",
        "read_file",
        {"file_path": "/Users/phoenix/config.json"},
        "single"
    ),
    (
        "Search for all Python files in the src directory",
        "glob",
        {"pattern": "src/**/*.py"},
        "single"
    ),
    (
        "Find where the function 'handleLogin' is defined in the codebase",
        "grep",
        {"pattern": "handleLogin"},
        "single"
    ),
    (
        "Search the web for the error message 'TypeError: undefined is not a function'",
        "web_search",
        {"query": "TypeError: undefined is not a function"},
        "single"
    ),
    (
        "Run the test suite with: pytest tests/ -v",
        "bash",
        {"command": "pytest tests/ -v"},
        "single"
    ),
    (
        "I need to find all TypeScript files that reference 'useAuth'",
        "grep",
        {"pattern": "useAuth"},
        "single"
    ),
    (
        "What's in the file package.json?",
        "read_file",
        {"file_path": "package.json"},
        "single"
    ),
    (
        "Show me all markdown files in the docs folder",
        "glob",
        {"pattern": "docs/**/*.md"},
        "single"
    ),
    (
        "Look up the React useEffect documentation online",
        "web_search",
        {"query": "React useEffect documentation"},
        "single"
    ),
    (
        "git status and git diff",
        "bash",
        {"command": "git status"},  # Accept either partial match
        "single"
    ),

    # ── Parameter extraction (10 cases) ──
    (
        "Create a file /tmp/test.py with a hello world function",
        "write_file",
        {"file_path": "/tmp/test.py"},
        "param"
    ),
    (
        "In the file src/auth.ts, change the line 'const PORT = 3000' to 'const PORT = 8080'",
        "edit_file",
        {"file_path": "src/auth.ts", "old_string": "const PORT = 3000", "new_string": "const PORT = 8080"},
        "param"
    ),
    (
        "Write a README.md that says '# My Project\n\nA test project'",
        "write_file",
        {"file_path": "README.md"},
        "param"
    ),
    (
        "Run: npm install --save-dev typescript @types/node",
        "bash",
        {"command": "npm install --save-dev typescript @types/node"},
        "param"
    ),
    (
        "Search for 'TODO' in all .py files under the src/ directory",
        "grep",
        {"pattern": "TODO", "include": "*.py"},
        "param"
    ),
    (
        "I need a sub-agent to investigate why the login flow is broken in auth.ts and suggest fixes",
        "task",
        {"description": "investigate login flow bug"},
        "param"
    ),
    (
        "Edit /etc/hosts to replace '127.0.0.1 localhost' with '127.0.0.1 myapp.local'",
        "edit_file",
        {"file_path": "/etc/hosts", "old_string": "127.0.0.1 localhost", "new_string": "127.0.0.1 myapp.local"},
        "param"
    ),
    (
        "Find files matching '*.test.ts' in the project",
        "glob",
        {"pattern": "**/*.test.ts"},
        "param"
    ),
    (
        "Look up 'how to fix CORS error in Express' on the web",
        "web_search",
        {"query": "how to fix CORS error in Express"},
        "param"
    ),
    (
        "Delegate to a specialized agent: review all security vulnerabilities in the auth module",
        "task",
        {"description": "review auth security vulnerabilities"},
        "param"
    ),

    # ── Edge cases / ambiguous (5 cases) ──
    (
        "Check if the server is running",
        "bash",
        {},  # Accept any bash command
        "edge"
    ),
    (
        "I want to see the logs",
        "bash",
        {},
        "edge"
    ),
    (
        "What's the weather like?",
        "web_search",
        {},
        "edge"
    ),
    (
        "Tell me about the architecture of this project",
        "glob",  # or read_file - accept either
        {},
        "edge"
    ),
    (
        "Fix all the bugs in this file",
        "read_file",  # Should read first before editing
        {},
        "edge"
    ),
]


def load_model_tokenizer():
    print(f"Loading model from {MODEL_PATH}...")
    t0 = time.time()
    model, tokenizer = load(MODEL_PATH)
    print(f"  Loaded in {time.time() - t0:.1f}s")
    return model, tokenizer


def build_messages(tools, user_instruction):
    """Build messages with tools injected via Qwen's chat template."""
    system = (
        "You are a coding agent assistant. You have access to tools for file operations, "
        "shell commands, web search, and task delegation."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_instruction}
    ]


def apply_chat_template(tokenizer, messages, tools, add_generation_prompt=True):
    """Apply Qwen's chat template with tools."""
    return tokenizer.apply_chat_template(
        messages,
        tools=tools if tools else None,
        add_generation_prompt=add_generation_prompt,
        tokenize=False,
        enable_thinking=False  # Disable thinking for faster + more reliable tool calls
    )


def parse_tool_call(text):
    """Parse Qwen3.5's XML-format tool call output."""
    # Pattern: <tool_call>\n<function=NAME>\n<parameter=KEY>\nVALUE\n</parameter>\n</function>\n</tool_call>
    result = []
    # Find all tool_call blocks
    blocks = re.findall(r'<tool_call>(.*?)</tool_call>', text, re.DOTALL)
    for block in blocks:
        func_match = re.search(r'<function=(\w+)>', block)
        if not func_match:
            continue
        func_name = func_match.group(1)
        params = {}
        param_blocks = re.findall(r'<parameter=(\w+)>\s*(.*?)\s*</parameter>', block, re.DOTALL)
        for key, val in param_blocks:
            params[key] = val.strip()
        result.append({"name": func_name, "arguments": params})
    return result


def evaluate_test(test_case, tool_calls):
    """Evaluate a single test case. Returns (passed, details)."""
    instruction, expected_tool, expected_params, category = test_case

    if not tool_calls:
        return False, f"Expected {expected_tool}, got no tool call"

    # Check if expected tool is among the called tools
    called_names = [tc["name"] for tc in tool_calls]
    if expected_tool not in called_names:
        return False, f"Expected {expected_tool}, got {called_names}"

    # Find the matching tool call
    tc = next(tc for tc in tool_calls if tc["name"] == expected_tool)

    # Check parameters (partial match - only check the keys we specified)
    if expected_params:
        for key, expected_val in expected_params.items():
            actual_val = tc["arguments"].get(key, "")
            if key == "description" or key == "prompt" or key == "query":
                # For text params, check fuzzy containment
                if expected_val.lower() not in actual_val.lower():
                    return False, f"Param '{key}': expected to contain '{expected_val}', got '{actual_val[:80]}'"
            elif expected_val not in actual_val:
                return False, f"Param '{key}': expected '{expected_val}', got '{actual_val[:80]}'"

    return True, f"Correctly called {expected_tool}"


def run_tests(model, tokenizer, test_cases):
    results = {"single": [], "param": [], "edge": []}
    total_start = time.time()

    for i, test_case in enumerate(test_cases):
        instruction, expected_tool, expected_params, category = test_case

        messages = build_messages(TOOLS, instruction)
        prompt = apply_chat_template(tokenizer, messages, TOOLS)

        t0 = time.time()
        # Generate with tool call parsing
        response = ""
        tool_calls = None

        # Use stream_generate for streaming to detect early completion
        try:
            full_output = ""
            for response_obj in stream_generate(
                model,
                tokenizer,
                prompt=prompt,
                max_tokens=512,
                sampler=make_sampler(temp=0.0),
            ):
                full_output += response_obj.text
                # Try to parse tool calls from partial output
                if '</tool_call>' in full_output:
                    tool_calls = parse_tool_call(full_output)
                    break

            if tool_calls is None:
                tool_calls = parse_tool_call(full_output)
                response = full_output
        except Exception as e:
            response = str(e)
            tool_calls = None

        elapsed = time.time() - t0
        passed, detail = evaluate_test(test_case, tool_calls)

        results[category].append({
            "passed": passed,
            "instruction": instruction[:80],
            "expected": expected_tool,
            "detail": detail,
            "time": elapsed,
        })

        status = "✓" if passed else "✗"
        print(f"  [{status}] {category:6s} | {instruction[:70]:70s} | {detail[:60]} ({elapsed:.1f}s)")

    total_elapsed = time.time() - total_start
    return results, total_elapsed


def print_report(results, total_time):
    all_results = []
    for cat_results in results.values():
        all_results.extend(cat_results)
    passed = sum(1 for r in all_results if r["passed"])
    total = len(all_results)

    print("\n" + "=" * 70)
    print("Qwen3.5-9B Tool Calling Benchmark Report")
    print("=" * 70)

    for cat, cat_results in results.items():
        cat_passed = sum(1 for r in cat_results if r["passed"])
        cat_total = len(cat_results)
        avg_time = sum(r["time"] for r in cat_results) / cat_total if cat_total else 0
        print(f"  {cat:8s}: {cat_passed}/{cat_total} passed ({cat_passed/cat_total*100:.0f}%)  avg {avg_time:.1f}s/call")

    print(f"\n  Overall: {passed}/{total} passed ({passed/total*100:.0f}%)")
    print(f"  Total time: {total_time:.1f}s")
    print(f"  Avg time per test: {total_time/total:.1f}s")

    # Recommendations
    print("\n" + "-" * 70)
    print("Assessment:")
    if passed/total >= 0.8:
        print("  ✅ EXCELLENT - Model is highly reliable for tool calling.")
        print("     Can serve as the core agent with 8+ tools.")
    elif passed/total >= 0.6:
        print("  ⚠️  GOOD - Model is usable but needs guardrails.")
        print("     Keep tools under 12, add Zod validation on parameters.")
        print("     Consider multi-turn stability testing.")
    elif passed/total >= 0.4:
        print("  ⚠️  MARGINAL - Model can call tools but is unreliable.")
        print("     Reduce tools to 5-6 core ones. Add heavy validation.")
        print("     Strongly consider upgrading to Qwen3-32B.")
    else:
        print("  ❌ POOR - Model is not suitable as an agent base.")
        print("     Upgrade to at least Qwen3-32B or Qwen3-Coder-30B.")

    # Parameter quality
    param_results = results.get("param", [])
    if param_results:
        param_pass = sum(1 for r in param_results if r["passed"])
        print(f"\n  Parameter extraction accuracy: {param_pass}/{len(param_results)}")
        if param_pass/len(param_results) < 0.5:
            print("  → Tools with 2+ required params are unreliable. Simplify tool schemas.")

    # Speed
    avg_time = sum(r["time"] for r in all_results) / total
    print(f"  Average generation time: {avg_time:.1f}s")
    if avg_time > 5:
        print("  → Consider using speculative decoding or a smaller draft model.")


if __name__ == "__main__":
    model, tokenizer = load_model_tokenizer()

    # Quick warmup
    print("Warming up...")
    messages = build_messages(TOOLS, "What is 2+2?")
    prompt = apply_chat_template(tokenizer, messages, TOOLS)
    list(stream_generate(model, tokenizer, prompt=prompt, max_tokens=10, sampler=make_sampler(temp=0.0)))
    print("Ready.\n")

    print(f"Running {len(TEST_CASES)} test cases...\n")
    results, total_time = run_tests(model, tokenizer, TEST_CASES)
    print_report(results, total_time)
