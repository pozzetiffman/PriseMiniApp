"""
Роутер предварительного расчёта цен (quote) для корзины и оформления.
Единый источник истины: те же функции, что используются при confirm.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import database
from ..services.pricing import build_quote, build_quote_for_deal
from ..utils.telegram_auth import validate_init_data_multi_bot
import os
from dotenv import load_dotenv
load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


class QuoteItem(BaseModel):
    """Один товар в запросе на расчёт."""
    product_id: int
    quantity: int


class PricingQuoteRequest(BaseModel):
    """Тело POST /api/pricing/quote. Либо deal_id (для сделки), либо items (для произвольного набора)."""
    deal_id: Optional[int] = None
    items: Optional[List[QuoteItem]] = None
    payment_method: str  # card, cash, transfer, other
    delivery_method: str  # pickup, courier, none


@router.post("/quote")
async def pricing_quote(
    body: PricingQuoteRequest,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """
    Предварительный расчёт: суммы по позициям с учётом способа оплаты и доставки.
    - Если передан deal_id: используются позиции черновой сделки (draft), текущий пользователь должен быть buyer.
    - Если передан items: расчёт по списку { product_id, quantity }.
    Возвращает: items (unit_price, line_total), items_amount, delivery_fee, total_amount, currency.
    При ошибках (нет товара, нет цены) — 400 с деталями.
    """
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Telegram initData is required")
    try:
        buyer_user_id, _, _ = await validate_init_data_multi_bot(
            x_telegram_init_data,
            db,
            default_bot_token=TELEGRAM_BOT_TOKEN if TELEGRAM_BOT_TOKEN else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {str(e)}")

    if body.deal_id is not None:
        quote = build_quote_for_deal(
            db, body.deal_id, body.payment_method, body.delivery_method, buyer_user_id
        )
        if quote is None:
            raise HTTPException(
                status_code=404,
                detail="Сделка не найдена или уже подтверждена",
            )
    elif body.items and len(body.items) > 0:
        items_payload = [{"product_id": it.product_id, "quantity": it.quantity} for it in body.items]
        quote = build_quote(
            db, items_payload, body.payment_method, body.delivery_method, buyer_user_id
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Укажите deal_id или items для расчёта",
        )

    if quote.get("errors"):
        raise HTTPException(
            status_code=400,
            detail="; ".join(quote["errors"]),
        )

    return {
        "items": quote["items"],
        "items_amount": quote["items_amount"],
        "delivery_fee": quote["delivery_fee"],
        "total_amount": quote["total_amount"],
        "currency": quote["currency"],
    }
