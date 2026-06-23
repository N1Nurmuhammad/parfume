"""cashback: client balance, ledger, payment flag; rename order discount

Revision ID: d3f6a9c2e1b8
Revises: c2e5f8a1b4d6
Create Date: 2026-06-21

Additive migration (no data loss): adds clients.cashback, payment_types.is_cashback,
a cashback_logs ledger, seeds a Cashback payment type, and renames
orders.discount -> orders.cashback_percent.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3f6a9c2e1b8'
down_revision: Union[str, None] = 'c2e5f8a1b4d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clients', sa.Column('cashback', sa.Numeric(14, 2), server_default='0', nullable=False))
    op.add_column('payment_types', sa.Column('is_cashback', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute(
        "INSERT INTO payment_types (name, is_debt, is_cashback) "
        "SELECT 'Cashback', false, true "
        "WHERE NOT EXISTS (SELECT 1 FROM payment_types WHERE is_cashback)"
    )

    op.create_table(
        'cashback_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('change', sa.Numeric(14, 2), nullable=False),
        sa.Column('cashback_after', sa.Numeric(14, 2), nullable=False),
        sa.Column('reason', sa.String(length=32), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['admins.id']),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id']),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cashback_logs_client_id'), 'cashback_logs', ['client_id'])
    op.create_index(op.f('ix_cashback_logs_admin_id'), 'cashback_logs', ['admin_id'])

    # discount % becomes cashback % (the column no longer reduces the total)
    op.alter_column('orders', 'discount', new_column_name='cashback_percent')


def downgrade() -> None:
    op.alter_column('orders', 'cashback_percent', new_column_name='discount')
    op.drop_index(op.f('ix_cashback_logs_admin_id'), table_name='cashback_logs')
    op.drop_index(op.f('ix_cashback_logs_client_id'), table_name='cashback_logs')
    op.drop_table('cashback_logs')
    op.execute("DELETE FROM payment_types WHERE is_cashback")
    op.drop_column('payment_types', 'is_cashback')
    op.drop_column('clients', 'cashback')
