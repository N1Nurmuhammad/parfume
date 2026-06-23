"""order status: paid|delivery, due_date, paid_at

Revision ID: e4a1c7b9d250
Revises: d3f6a9c2e1b8
Create Date: 2026-06-21

Additive migration (no data loss): adds orders.status / due_date / paid_at and
backfills existing rows to status='paid' with paid_at = created_at.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e4a1c7b9d250'
down_revision: Union[str, None] = 'd3f6a9c2e1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('status', sa.String(length=16), server_default='paid', nullable=False))
    op.add_column('orders', sa.Column('due_date', sa.Date(), nullable=True))
    op.add_column('orders', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'])
    # existing orders were paid at creation
    op.execute("UPDATE orders SET paid_at = created_at WHERE paid_at IS NULL")


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_status'), table_name='orders')
    op.drop_column('orders', 'paid_at')
    op.drop_column('orders', 'due_date')
    op.drop_column('orders', 'status')
