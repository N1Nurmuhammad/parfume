"""migrate legacy Qaytim (is_change) payment lines onto real methods

Revision ID: f7c1a9e3b204
Revises: c9e7a1d3f584
Create Date: 2026-07-02

Money-back / change used to be its own `is_change` payment type ("Qaytim"):
historical `order_payments` rows point at that type with a NEGATIVE amount so
they subtract from the order's paid total. The new model represents change as
a per-line concept — a NEGATIVE-amount line under the REAL method it offsets
(Cash / Card / …) — with no dedicated type persisted.

This backfill moves the old rows to the new shape WITHOUT losing data: each
change line is re-pointed to a sibling payment line in the same order & the
same currency (the method it offset), falling back to "Cash" (else the lowest
non-special method). Amount / currency / rate / base are preserved; the value
is forced negative so it keeps subtracting. No rows are deleted, and the
Qaytim payment type row itself is left in place (production still references it
and the app keeps `pt.is_change` as a fallback trigger for any stragglers).

Downgrade is a no-op: once migrated, these rows are indistinguishable from
change lines created natively under the new model, so the split can't be
reconstructed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7c1a9e3b204"
down_revision: Union[str, None] = "c9e7a1d3f584"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    change_ids = [
        r[0]
        for r in conn.execute(
            sa.text("SELECT id FROM payment_types WHERE is_change")
        )
    ]
    if not change_ids:
        return

    # real, non-special methods a change line can be attributed to
    real = conn.execute(
        sa.text(
            "SELECT id, name FROM payment_types "
            "WHERE NOT is_change AND NOT is_debt AND NOT is_cashback ORDER BY id"
        )
    ).fetchall()
    if not real:
        # nothing to attribute onto; leave legacy rows untouched
        return
    cash_id = next(
        (rid for rid, name in real if (name or "").strip().lower() == "cash"),
        real[0][0],
    )

    change_lines = conn.execute(
        sa.text(
            "SELECT id, order_id, currency_id FROM order_payments "
            "WHERE payment_type_id IN :ids"
        ).bindparams(sa.bindparam("ids", expanding=True)),
        {"ids": change_ids},
    ).fetchall()

    sibling_sql = sa.text(
        "SELECT op.payment_type_id FROM order_payments op "
        "JOIN payment_types pt ON pt.id = op.payment_type_id "
        "WHERE op.order_id = :oid AND op.currency_id = :cid AND op.id <> :pid "
        "AND NOT pt.is_change AND NOT pt.is_debt AND NOT pt.is_cashback "
        "ORDER BY abs(op.amount) DESC, op.id LIMIT 1"
    )
    update_sql = sa.text(
        "UPDATE order_payments SET payment_type_id = :t, "
        "amount = -abs(amount), amount_base = -abs(amount_base) WHERE id = :pid"
    )

    for pid, order_id, currency_id in change_lines:
        sibling = conn.execute(
            sibling_sql, {"oid": order_id, "cid": currency_id, "pid": pid}
        ).fetchone()
        target = sibling[0] if sibling else cash_id
        conn.execute(update_sql, {"t": target, "pid": pid})


def downgrade() -> None:
    # Irreversible: migrated rows are indistinguishable from natively-created
    # change lines, so the original Qaytim attribution can't be restored.
    pass
