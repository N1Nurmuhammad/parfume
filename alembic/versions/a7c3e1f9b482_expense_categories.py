"""expense categories

Revision ID: a7c3e1f9b482
Revises: f5b2d8c3a710
Create Date: 2026-06-22

Additive migration: creates the expense_categories lookup table and adds a
nullable expenses.category_id foreign key.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7c3e1f9b482'
down_revision: Union[str, None] = 'f5b2d8c3a710'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'expense_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.add_column('expenses', sa.Column('category_id', sa.Integer(), nullable=True))
    op.create_index(
        op.f('ix_expenses_category_id'), 'expenses', ['category_id']
    )
    op.create_foreign_key(
        'fk_expenses_category_id', 'expenses', 'expense_categories',
        ['category_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_expenses_category_id', 'expenses', type_='foreignkey')
    op.drop_index(op.f('ix_expenses_category_id'), table_name='expenses')
    op.drop_column('expenses', 'category_id')
    op.drop_table('expense_categories')
