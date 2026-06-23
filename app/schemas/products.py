"""Schemas for products."""

from decimal import Decimal

from pydantic import BaseModel, Field, computed_field


class ProductIn(BaseModel):
    name: str
    quantity: int = Field(ge=0)
    price: Decimal = Field(ge=0)
    cargo: Decimal = Field(ge=0)
    cargo_price: Decimal = Field(ge=0)


class ProductOut(BaseModel):
    id: int
    name: str
    quantity: int
    price: Decimal
    cargo: Decimal
    cargo_price: Decimal

    @computed_field
    @property
    def full_price(self) -> Decimal:
        return self.price + self.cargo

    model_config = {"from_attributes": True}
