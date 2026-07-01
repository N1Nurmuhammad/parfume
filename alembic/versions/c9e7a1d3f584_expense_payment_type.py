"""expense payment type

Revision ID: c9e7a1d3f584
Revises: b8d4f2a6c019
Create Date: 2026-07-01

Additive migration: adds a nullable expenses.payment_type_id foreign key so an
expense can be attributed to the payment method it was paid from (Cash / Card /
…). Legacy rows stay null (unattributed) and are excluded from per-method
netting in analytics.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9e7a1d3f584'
down_revision: Union[str, None] = 'b8d4f2a6c019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('payment_type_id', sa.Integer(), nullable=True))
    op.create_index(
        op.f('ix_expenses_payment_type_id'), 'expenses', ['payment_type_id']
    )
    op.create_foreign_key(
        'fk_expenses_payment_type_id', 'expenses', 'payment_types',
        ['payment_type_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_expenses_payment_type_id', 'expenses', type_='foreignkey')
    op.drop_index(op.f('ix_expenses_payment_type_id'), table_name='expenses')
    op.drop_column('expenses', 'payment_type_id')
