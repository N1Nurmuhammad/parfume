"""payment change/qaytim type: payment_types.is_change flag + seed a type

Revision ID: b8d4f2a6c019
Revises: a7c3e1f9b482
Create Date: 2026-06-29

Additive migration (no data loss): adds payment_types.is_change and seeds a
"Qaytim" (change) payment type. A change-type line is stored as a negative
amount, representing money handed back to the client, so it subtracts from the
order's paid total.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8d4f2a6c019'
down_revision: Union[str, None] = 'a7c3e1f9b482'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payment_types', sa.Column('is_change', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute(
        "INSERT INTO payment_types (name, is_debt, is_cashback, is_change) "
        "SELECT 'Qaytim', false, false, true "
        "WHERE NOT EXISTS (SELECT 1 FROM payment_types WHERE is_change)"
    )


def downgrade() -> None:
    op.execute("DELETE FROM payment_types WHERE is_change")
    op.drop_column('payment_types', 'is_change')
