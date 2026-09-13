"""Order calculations and workflow."""

from dataclasses import dataclass
from typing import List


@dataclass
class LineItem:
    sku: str
    qty: int
    unit_price: float


class EmptyOrderError(Exception):
    pass


def calculate_subtotal(items: List[LineItem]) -> float:
    if not items:
        raise EmptyOrderError("order has no items")
    total = 0.0
    for item in items:
        if item.qty <= 0:
            raise ValueError(f"invalid qty for {item.sku}")
        if item.unit_price < 0:
            raise ValueError(f"invalid price for {item.sku}")
        total += item.qty * item.unit_price
    return round(total, 2)


def apply_discount(subtotal: float, percent: float) -> float:
    if subtotal < 0:
        raise ValueError("subtotal cannot be negative")
    if percent < 0 or percent > 100:
        raise ValueError("percent must be between 0 and 100")
    return round(subtotal * (1 - percent / 100.0), 2)


def can_fulfill(stock: int, qty: int) -> bool:
    if qty <= 0:
        return False
    return stock >= qty
