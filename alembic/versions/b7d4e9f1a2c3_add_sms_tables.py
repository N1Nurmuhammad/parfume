"""add sms broadcast tables

Revision ID: b7d4e9f1a2c3
Revises: a1b2c3d4e5f6
Create Date: 2026-06-21

Additive migration (no data loss): creates sms_broadcasts + sms_messages.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d4e9f1a2c3'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sms_broadcasts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('audience', sa.String(length=16), nullable=False),
        sa.Column('custom_numbers', sa.Text(), nullable=True),
        sa.Column('schedule_kind', sa.String(length=8), nullable=False),
        sa.Column('cron', sa.String(length=120), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_runs', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=16), server_default='scheduled', nullable=False),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('run_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('recipients_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('sent_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('failed_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['admins.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sms_broadcasts_admin_id'), 'sms_broadcasts', ['admin_id'])
    op.create_index(op.f('ix_sms_broadcasts_scheduled_at'), 'sms_broadcasts', ['scheduled_at'])
    op.create_index(op.f('ix_sms_broadcasts_status'), 'sms_broadcasts', ['status'])

    op.create_table(
        'sms_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('broadcast_id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=True),
        sa.Column('phone', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=8), nullable=False),
        sa.Column('error', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['broadcast_id'], ['sms_broadcasts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sms_messages_broadcast_id'), 'sms_messages', ['broadcast_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_sms_messages_broadcast_id'), table_name='sms_messages')
    op.drop_table('sms_messages')
    op.drop_index(op.f('ix_sms_broadcasts_status'), table_name='sms_broadcasts')
    op.drop_index(op.f('ix_sms_broadcasts_scheduled_at'), table_name='sms_broadcasts')
    op.drop_index(op.f('ix_sms_broadcasts_admin_id'), table_name='sms_broadcasts')
    op.drop_table('sms_broadcasts')
