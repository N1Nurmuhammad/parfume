"""Product endpoints: REST CRUD."""

from fastapi import APIRouter, Depends, HTTPException

from ..database.repo import BaseRepo, get_repo
from ..schemas import ProductIn, ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
async def list_products(repo: BaseRepo = Depends(get_repo)) -> list[ProductOut]:
    return [ProductOut.model_validate(p) for p in await repo.products.list()]


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(
    body: ProductIn, repo: BaseRepo = Depends(get_repo)
) -> ProductOut:
    product = await repo.products.add(
        body.name, body.quantity, body.price, body.cargo, body.cargo_price
    )
    await repo.commit()
    return ProductOut.model_validate(product)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int, body: ProductIn, repo: BaseRepo = Depends(get_repo)
) -> ProductOut:
    product = await repo.products.update(
        product_id, body.name, body.quantity, body.price, body.cargo, body.cargo_price
    )
    if product is None:
        raise HTTPException(status_code=404, detail="product not found")
    await repo.commit()
    return ProductOut.model_validate(product)


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    if not await repo.products.delete(product_id):
        raise HTTPException(status_code=404, detail="product not found")
    await repo.commit()
