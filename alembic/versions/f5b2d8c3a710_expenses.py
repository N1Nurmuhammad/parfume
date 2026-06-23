"""store expenses

Revision ID: f5b2d8c3a710
Revises: e4a1c7b9d250
Create Date: 2026-06-21

Additive migration: creates the expenses table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5b2d8c3a710'
down_revision: Union[str, None] = 'e4a1c7b9d250'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'expenses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('currency_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('rate', sa.Numeric(18, 4), nullable=False),
        sa.Column('amount_base', sa.Numeric(14, 2), nullable=False),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['admins.id']),
        sa.ForeignKeyConstraint(['currency_id'], ['currencies.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_expenses_admin_id'), 'expenses', ['admin_id'])
    op.create_index(op.f('ix_expenses_currency_id'), 'expenses', ['currency_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_expenses_currency_id'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_admin_id'), table_name='expenses')
    op.drop_table('expenses')
