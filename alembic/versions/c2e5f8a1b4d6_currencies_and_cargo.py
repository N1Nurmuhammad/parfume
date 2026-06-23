"""currencies, daily rates, product cargo, multi-currency payments

Revision ID: c2e5f8a1b4d6
Revises: b7d4e9f1a2c3
Create Date: 2026-06-21

Additive migration (no data loss). Seeds UZS (base) + USD + EUR, adds products.cargo
(default 0), and adds currency columns to order_payments — backfilling existing rows
to base currency (UZS, rate 1, amount_base = amount).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2e5f8a1b4d6'
down_revision: Union[str, None] = 'b7d4e9f1a2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- currencies + daily rates ---
    op.create_table(
        'currencies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=8), nullable=False),
        sa.Column('name', sa.String(length=48), nullable=False),
        sa.Column('is_base', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.execute(
        "INSERT INTO currencies (code, name, is_base) VALUES "
        "('UZS', 'Uzbek so''m', true), ('USD', 'US Dollar', false), ('EUR', 'Euro', false)"
    )

    op.create_table(
        'currency_rates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('currency_id', sa.Integer(), nullable=False),
        sa.Column('rate_date', sa.Date(), nullable=False),
        sa.Column('rate', sa.Numeric(18, 4), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['currency_id'], ['currencies.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('currency_id', 'rate_date', name='uq_currency_rate_day'),
    )
    op.create_index(op.f('ix_currency_rates_currency_id'), 'currency_rates', ['currency_id'])
    op.create_index(op.f('ix_currency_rates_rate_date'), 'currency_rates', ['rate_date'])

    # --- product cargo (added to selling price) ---
    op.add_column('products', sa.Column('cargo', sa.Numeric(12, 2), server_default='0', nullable=False))

    # --- multi-currency on payment lines ---
    op.alter_column('order_payments', 'amount', type_=sa.Numeric(14, 2))
    op.add_column('order_payments', sa.Column('currency_id', sa.Integer(), nullable=True))
    op.add_column('order_payments', sa.Column('rate', sa.Numeric(18, 4), nullable=True))
    op.add_column('order_payments', sa.Column('amount_base', sa.Numeric(14, 2), nullable=True))
    # backfill existing payments to base currency (UZS, rate 1)
    op.execute(
        "UPDATE order_payments SET "
        "currency_id = (SELECT id FROM currencies WHERE is_base LIMIT 1), "
        "rate = 1, amount_base = amount"
    )
    op.alter_column('order_payments', 'currency_id', nullable=False)
    op.alter_column('order_payments', 'rate', nullable=False)
    op.alter_column('order_payments', 'amount_base', nullable=False)
    op.create_index(op.f('ix_order_payments_currency_id'), 'order_payments', ['currency_id'])
    op.create_foreign_key(
        'fk_order_payments_currency', 'order_payments', 'currencies', ['currency_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_order_payments_currency', 'order_payments', type_='foreignkey')
    op.drop_index(op.f('ix_order_payments_currency_id'), table_name='order_payments')
    op.drop_column('order_payments', 'amount_base')
    op.drop_column('order_payments', 'rate')
    op.drop_column('order_payments', 'currency_id')
    op.alter_column('order_payments', 'amount', type_=sa.Numeric(12, 2))
    op.drop_column('products', 'cargo')
    op.drop_index(op.f('ix_currency_rates_rate_date'), table_name='currency_rates')
    op.drop_index(op.f('ix_currency_rates_currency_id'), table_name='currency_rates')
    op.drop_table('currency_rates')
    op.drop_table('currencies')
