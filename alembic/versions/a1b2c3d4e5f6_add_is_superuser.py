"""add is_superuser to admins

Revision ID: a1b2c3d4e5f6
Revises: b29cc784b05d
Create Date: 2026-06-20

Additive migration (no data loss). Existing admins are promoted to superuser so
nobody is locked out of admin management after the upgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'b29cc784b05d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'admins',
        sa.Column(
            'is_superuser', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    # keep current admins fully privileged
    op.execute("UPDATE admins SET is_superuser = true")


def downgrade() -> None:
    op.drop_column('admins', 'is_superuser')
