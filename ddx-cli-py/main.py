"""ddx-cli-py - interactive Rich console demo for the ddx-terminal-bridge spike.

Proves: a real Python program with a styled Rich console + a blocking interactive
prompt runs in the shared tmux terminal, and an external agent can answer the prompt
via `tmux send-keys`. Run with: `uv run main.py`.
"""

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table

console = Console()


def main() -> None:
    console.print(
        Panel.fit(
            "[bold cyan]ddx-cli-py[/bold cyan]\n[dim]Rich console + interactive prompt[/dim]",
            border_style="green",
            title="ddx-terminal-bridge spike",
        )
    )

    # BLOCKING interactive prompts - the agent must answer these via send-keys.
    name = Prompt.ask("[yellow]What is your name[/yellow]", default="world")
    color = Prompt.ask(
        "[yellow]Pick a color[/yellow]", choices=["red", "green", "blue"], default="green"
    )

    table = Table(title="Answers captured", border_style=color)
    table.add_column("field", style="bold")
    table.add_column("value", style=color)
    table.add_row("name", name)
    table.add_row("color", color)
    console.print(table)

    console.print(f"[bold {color}]DDX-CLI-PY-DONE name={name} color={color}[/bold {color}]")


if __name__ == "__main__":
    main()
