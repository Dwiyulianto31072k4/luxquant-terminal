"""
LuxQuant Coin Categorization Terminal Monitor
==============================================
Real-time TUI dashboard untuk monitor coins table.

Display:
- Stats: total / pending / categorized / flagged
- Distribution by token_type & sector
- Recent activity (last 20 categorized)
- Pending queue (top 20 oldest)

Usage:
    python3 -m app.services.coin_terminal_monitor
    python3 -m app.services.coin_terminal_monitor --refresh 5  # 5s refresh

Dependencies:
    pip install rich  # add to requirements.txt

Place at:
    /root/luxquant-terminal/backend/app/services/coin_terminal_monitor.py
"""

import argparse
import os
import time
from datetime import datetime, timezone

from sqlalchemy import create_engine, text

try:
    from rich.console import Console
    from rich.table import Table
    from rich.live import Live
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.text import Text
    from rich.align import Align
except ImportError:
    print("ERROR: rich is not installed. Run: pip install rich")
    exit(1)


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant"
)

engine = create_engine(DATABASE_URL, future=True)
console = Console()


# ============================================================
# DATA QUERIES
# ============================================================

def fetch_overview() -> dict:
    """High-level stats."""
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE review_status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE review_status = 'auto_categorized') AS auto_done,
                COUNT(*) FILTER (WHERE review_status = 'manual_reviewed') AS manual_done,
                COUNT(*) FILTER (WHERE review_status = 'flagged') AS flagged,
                COUNT(*) FILTER (WHERE has_utility = TRUE) AS with_utility,
                COUNT(*) FILTER (WHERE has_utility = FALSE) AS no_utility,
                COUNT(*) FILTER (WHERE fetch_error IS NOT NULL) AS errors
            FROM coins
        """)).fetchone()
        return {
            "total": row[0],
            "pending": row[1],
            "auto_done": row[2],
            "manual_done": row[3],
            "flagged": row[4],
            "with_utility": row[5],
            "no_utility": row[6],
            "errors": row[7],
        }


def fetch_token_type_dist() -> list:
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT COALESCE(token_type, '(unset)') AS t, COUNT(*) AS c
            FROM coins
            GROUP BY token_type
            ORDER BY c DESC
        """)).fetchall()
        return [(r[0], r[1]) for r in rows]


def fetch_sector_dist() -> list:
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT COALESCE(sector, '(unset)') AS s, COUNT(*) AS c
            FROM coins
            GROUP BY sector
            ORDER BY c DESC
        """)).fetchall()
        return [(r[0], r[1]) for r in rows]


def fetch_recent_activity(limit: int = 15) -> list:
    """Last N categorized coins."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT pair, token_type, sector, has_utility,
                   market_cap_rank, last_fetched_at
            FROM coins
            WHERE last_fetched_at IS NOT NULL
            ORDER BY last_fetched_at DESC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
        return rows


def fetch_pending_queue(limit: int = 15) -> list:
    """Oldest pending coins (next to be processed)."""
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT c.pair, c.created_at, COUNT(s.signal_id) AS signal_count
            FROM coins c
            LEFT JOIN signals s ON s.pair = c.pair
            WHERE c.review_status = 'pending'
            GROUP BY c.pair, c.created_at
            ORDER BY c.created_at ASC
            LIMIT :limit
        """), {"limit": limit}).fetchall()
        return rows


# ============================================================
# RENDERING
# ============================================================

def render_header() -> Panel:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = Text("LuxQuant Coin Categorization Monitor", style="bold gold1")
    sub = Text(f"  •  {now}", style="dim")
    return Panel(Align.center(title + sub), style="gold1")


def render_overview() -> Panel:
    stats = fetch_overview()
    total = max(stats["total"], 1)

    pct_done = (stats["auto_done"] + stats["manual_done"]) / total * 100
    pct_pending = stats["pending"] / total * 100

    table = Table.grid(padding=(0, 2))
    table.add_column(justify="right", style="dim")
    table.add_column(justify="left", style="bold")

    table.add_row("Total Coins", f"{stats['total']:>5}")
    table.add_row("Pending", f"[yellow]{stats['pending']:>5}[/yellow]  ({pct_pending:.1f}%)")
    table.add_row("Auto Categorized", f"[cyan]{stats['auto_done']:>5}[/cyan]")
    table.add_row("Manual Reviewed", f"[green]{stats['manual_done']:>5}[/green]")
    table.add_row("Flagged", f"[red]{stats['flagged']:>5}[/red]")
    table.add_row("Fetch Errors", f"[red]{stats['errors']:>5}[/red]")
    table.add_row("─" * 5, "─" * 20)
    table.add_row("Has Utility", f"[green]{stats['with_utility']:>5}[/green]")
    table.add_row("No Utility (memecoins)", f"[yellow]{stats['no_utility']:>5}[/yellow]")
    table.add_row("─" * 5, "─" * 20)
    table.add_row("Progress", f"[bold green]{pct_done:.1f}%[/bold green]")

    return Panel(table, title="[bold]Overview[/bold]", border_style="gold1")


def render_distribution(title: str, data: list) -> Panel:
    table = Table.grid(padding=(0, 2))
    table.add_column(style="dim")
    table.add_column(justify="right", style="bold")
    table.add_column(style="green")

    total = sum(c for _, c in data) or 1
    bar_width = 15

    for name, count in data[:10]:
        pct = count / total * 100
        bar_filled = int(bar_width * pct / 100)
        bar = "█" * bar_filled + "░" * (bar_width - bar_filled)
        table.add_row(name, f"{count}", bar)

    return Panel(table, title=f"[bold]{title}[/bold]", border_style="cyan")


def render_recent_activity() -> Panel:
    rows = fetch_recent_activity(15)
    table = Table(show_header=True, header_style="bold gold1", border_style="dim")
    table.add_column("Pair", style="bold cyan", width=14)
    table.add_column("Type", style="magenta", width=12)
    table.add_column("Sector", style="green", width=14)
    table.add_column("Utility", justify="center", width=8)
    table.add_column("Rank", justify="right", style="dim", width=6)
    table.add_column("When", style="dim", width=10)

    now = datetime.now(timezone.utc)
    for r in rows:
        pair, ttype, sector, has_util, rank, fetched_at = r
        util_str = "[green]✓[/green]" if has_util else "[red]✗[/red]" if has_util is False else "[dim]?[/dim]"

        if fetched_at:
            if fetched_at.tzinfo is None:
                fetched_at = fetched_at.replace(tzinfo=timezone.utc)
            delta = now - fetched_at
            secs = int(delta.total_seconds())
            if secs < 60:
                when = f"{secs}s ago"
            elif secs < 3600:
                when = f"{secs // 60}m ago"
            elif secs < 86400:
                when = f"{secs // 3600}h ago"
            else:
                when = f"{secs // 86400}d ago"
        else:
            when = "-"

        table.add_row(
            pair,
            ttype or "[dim]?[/dim]",
            sector or "[dim]?[/dim]",
            util_str,
            str(rank) if rank else "-",
            when,
        )
    return Panel(table, title="[bold]Recent Activity[/bold]", border_style="cyan")


def render_pending_queue() -> Panel:
    rows = fetch_pending_queue(15)
    table = Table(show_header=True, header_style="bold gold1", border_style="dim")
    table.add_column("Pair", style="bold yellow", width=14)
    table.add_column("Signals", justify="right", style="dim", width=8)
    table.add_column("In Queue Since", style="dim")

    now = datetime.now(timezone.utc)
    for r in rows:
        pair, created_at, sig_count = r
        if created_at:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            delta = now - created_at
            secs = int(delta.total_seconds())
            if secs < 60:
                when = f"{secs}s ago"
            elif secs < 3600:
                when = f"{secs // 60}m ago"
            elif secs < 86400:
                when = f"{secs // 3600}h ago"
            else:
                when = f"{secs // 86400}d ago"
        else:
            when = "-"
        table.add_row(pair, str(sig_count), when)
    return Panel(table, title="[bold]Pending Queue[/bold]", border_style="yellow")


def build_layout() -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="body"),
    )
    layout["body"].split_row(
        Layout(name="left", ratio=1),
        Layout(name="right", ratio=2),
    )
    layout["left"].split_column(
        Layout(name="overview"),
        Layout(name="token_dist"),
        Layout(name="sector_dist"),
    )
    layout["right"].split_column(
        Layout(name="recent"),
        Layout(name="pending"),
    )
    return layout


def update_layout(layout: Layout):
    layout["header"].update(render_header())
    layout["overview"].update(render_overview())
    layout["token_dist"].update(render_distribution("Token Types", fetch_token_type_dist()))
    layout["sector_dist"].update(render_distribution("Sectors", fetch_sector_dist()))
    layout["recent"].update(render_recent_activity())
    layout["pending"].update(render_pending_queue())


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", type=int, default=3, help="Refresh interval in seconds")
    args = parser.parse_args()

    layout = build_layout()
    update_layout(layout)

    with Live(layout, refresh_per_second=1, screen=True) as live:
        try:
            while True:
                update_layout(layout)
                time.sleep(args.refresh)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
