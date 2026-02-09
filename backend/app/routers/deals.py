"""
Роутер сделок (Deal): оформление корзины как одна сделка с N товарами.
Двухэтапный процесс: checkout/start (draft) -> checkout/confirm (данные + списание остатков).
Товары «под заказ» (orders) не затрагиваются.
"""
import json
import os
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Header, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Optional, List, Tuple
from datetime import datetime
from sqlalchemy.exc import IntegrityError

from ..db import models, database
from ..models import deal as schemas
from ..utils.telegram_auth import validate_init_data_multi_bot
from ..utils.product_snapshot import create_product_snapshot, get_product_display_info_from_snapshot
from ..utils.products_utils import make_full_url
from ..utils.order_number import generate_order_number_11
from ..services.pricing import build_quote_for_deal
from ..utils.product_action_type import get_product_action_type  # Импорт утилиты для валидации

load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _get_unit_price_for_sale(product: models.Product) -> Optional[float]:
    """
    Цена за единицу для продажи: is_sale_enabled -> price_card или price;
    is_for_sale -> price_fixed/price_from/price_to или price со скидкой.
    """
    if getattr(product, "is_sale_enabled", False):
        price = getattr(product, "price_card", None) or product.price
        if price is None:
            return None
        discount = getattr(product, "discount", 0) or 0
        if discount and discount > 0:
            return round(price * (1 - discount / 100), 2)
        return price
    if getattr(product, "is_for_sale", False):
        price_type = getattr(product, "price_type", "range") or "range"
        if price_type == "fixed" and getattr(product, "price_fixed", None) is not None:
            return product.price_fixed
        if getattr(product, "price_from", None) is not None:
            return product.price_from
        if getattr(product, "price_to", None) is not None:
            return product.price_to
        price = product.price
        if price is None:
            return None
        discount = getattr(product, "discount", 0) or 0
        if discount and discount > 0:
            return round(price * (1 - discount / 100), 2)
        return price
    # Обычный товар с ценой
    price = product.price
    if price is None:
        return None
    discount = getattr(product, "discount", 0) or 0
    if discount and discount > 0:
        return round(price * (1 - discount / 100), 2)
    return price


def _get_available_quantity(product: models.Product, db: Session) -> int:
    """Доступное количество: product.quantity - зарезервировано (активные резервации по quantity)."""
    qty = product.quantity if product.quantity is not None else 0
    if qty <= 0:
        return 0
    active = db.query(models.Reservation).filter(
        and_(
            models.Reservation.product_id == product.id,
            models.Reservation.is_active == True,
            models.Reservation.reserved_until > datetime.utcnow(),
        )
    ).all()
    reserved = len(active)  # В модели Reservation нет поля quantity, каждая запись = 1 единица
    return max(0, qty - reserved)


def _snapshot_to_product_display(snapshot) -> Optional[dict]:
    """Преобразует snapshot в словарь product для ответа."""
    if not snapshot or not snapshot.snapshot_json:
        return None
    info = get_product_display_info_from_snapshot(snapshot)
    if not info:
        return None
    # Цена из snapshot для отображения
    price = info.get("price")
    if price is None:
        price = info.get("price_card") or info.get("price_cash")
    info["price"] = price
    if info.get("images_urls"):
        info["images_urls"] = [make_full_url(u) for u in info["images_urls"]]
    if info.get("image_url"):
        info["image_url"] = make_full_url(info["image_url"])
    info["is_unavailable"] = False
    return info


def _create_draft_deal(
    buyer_user_id: int,
    item_map: dict,
    db: Session,
) -> Tuple[models.Deal, int, float]:
    """
    Создаёт сделку в статусе draft с позициями и snapshots.
    Возвращает (deal, total_count, total_amount).
    Вызывается из checkout/start и из старого checkout (перед confirm).
    """
    deal_items_to_create = []
    total_count = 0
    total_amount = 0.0

    for product_id, quantity in item_map.items():
        product = db.query(models.Product).filter(models.Product.id == product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Товар {product_id} не найден")
        
        # ========== ВАЛИДАЦИЯ ТИПА ТОВАРА: ТОЛЬКО SALE МОЖНО ОФОРМЛЯТЬ ==========
        # ВАЖНО: Используем ЕДИНУЮ функцию вычисления action_type (источник истины)
        user_role = 'client' if buyer_user_id != product.user_id else 'owner'
        
        # Получаем настройки магазина из БД
        from ..utils.product_action_type import get_shop_settings_dict
        shop_settings = get_shop_settings_dict(product.user_id, getattr(product, 'bot_id', None), db)
        
        action_type, can_add_to_cart, reason_not_sale = get_product_action_type(
            product, user_role, shop_settings, db
        )
        
        # ЕДИНООБРАЗНОЕ ЛОГИРОВАНИЕ: формат как в products list для сравнения
        print(
            f"[DEALS CHECKOUT DEBUG] Product {product_id}: "
            f"action_type={action_type}, "
            f"can_add_to_cart={can_add_to_cart}, "
            f"reason_not_sale={reason_not_sale}, "
            f"flags: is_sale_enabled={getattr(product, 'is_sale_enabled', False)}, "
            f"is_made_to_order={getattr(product, 'is_made_to_order', False)}, "
            f"is_reservation_enabled={getattr(product, 'is_reservation_enabled', False)}, "
            f"price_card={getattr(product, 'price_card', None)}, "
            f"price_cash={getattr(product, 'price_cash', None)}"
        )
        
        # ВАЛИДАЦИЯ: Только товары с action_type="sale" и can_add_to_cart=True можно оформить
        if not can_add_to_cart or action_type != "sale":
            action_type_text = {
                'purchase': 'покупка',
                'order': 'заказ',
                'reserve': 'резервация',
                'none': 'не продается'
            }.get(action_type, 'не продается')
            
            error_message = f"Товар «{product.name}» нельзя оформить. Тип: {action_type_text}"
            print(f"[DEALS CHECKOUT DEBUG] BLOCKED: product_id={product_id}, action_type={action_type}, reason={reason_not_sale}")
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "NOT_SALE",
                    "message": error_message,
                    "action_type": action_type,
                    "reason": reason_not_sale,
                    "product_id": product_id,
                    "product_name": product.name
                }
            )
        # ========== КОНЕЦ ВАЛИДАЦИИ ТИПА ТОВАРА ==========
        if buyer_user_id == product.user_id:
            raise HTTPException(
                status_code=400,
                detail="Вы не можете купить свой собственный товар",
            )
        avail_qty = _get_available_quantity(product, db)
        if quantity > avail_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно товара «{product.name}». Доступно: {avail_qty} шт.",
            )
        unit_price = _get_unit_price_for_sale(product)
        if unit_price is None:
            raise HTTPException(
                status_code=400,
                detail=f"У товара «{product.name}» не указана цена для покупки",
            )
        snapshot_id = create_product_snapshot(
            db=db,
            product=product,
            user_id=buyer_user_id,
            operation_type="deal",
        )
        line_total = round(unit_price * quantity, 2)
        deal_items_to_create.append({
            "product_id": product_id,
            "snapshot_id": snapshot_id,
            "seller_user_id": product.user_id,
            "quantity": quantity,
            "price_per_unit": unit_price,
            "line_total": line_total,
        })
        total_count += quantity
        total_amount += line_total

    total_amount = round(total_amount, 2)
    deal = models.Deal(
        buyer_user_id=buyer_user_id,
        status="draft",
        total_items_count=total_count,
        total_amount=total_amount,
        currency="RUB",
    )
    db.add(deal)
    db.flush()
    for row in deal_items_to_create:
        item = models.DealItem(
            deal_id=deal.id,
            product_id=row["product_id"],
            snapshot_id=row["snapshot_id"],
            seller_user_id=row["seller_user_id"],
            quantity=row["quantity"],
            price_per_unit=row["price_per_unit"],
            line_total=row["line_total"],
        )
        db.add(item)
    db.commit()
    db.refresh(deal)
    return deal, total_count, total_amount


def _confirm_deal_and_decrement_stock(
    deal: models.Deal,
    body: schemas.DealConfirmRequest,
    buyer_user_id: int,
    db: Session,
) -> None:
    """
    Обновляет сделку данными оформления: пересчитывает суммы по единому pricing-модулю
    (payment_method, delivery_fee), обновляет DealItem.price_per_unit и line_total,
    присваивает deal_number, переводит в active, атомарно списывает остатки по позициям.
    Финал сумм — только из build_quote_for_deal (единый источник истины).
    """
    # Единый расчёт итогов: цена с учётом способа оплаты + доставка
    quote = build_quote_for_deal(db, deal.id, body.payment_method, body.delivery_method, buyer_user_id)
    if quote is None:
        raise HTTPException(status_code=400, detail="Не удалось пересчитать сумму сделки")
    if quote.get("errors"):
        raise HTTPException(status_code=400, detail="; ".join(quote["errors"]))

    # Обновляем позиции: фиксируем unit_price и line_total из quote
    quote_by_product = {row["product_id"]: row for row in quote["items"]}
    deal_items = db.query(models.DealItem).filter(models.DealItem.deal_id == deal.id).all()
    for di in deal_items:
        row = quote_by_product.get(di.product_id)
        if row:
            di.price_per_unit = row["unit_price"]
            di.line_total = row["line_total"]

    # Поля оформления и финальные суммы
    deal.payment_method = body.payment_method
    deal.delivery_method = body.delivery_method
    deal.delivery_fee = quote.get("delivery_fee") or 0
    deal.items_amount = quote.get("items_amount")
    deal.total_amount = quote.get("total_amount")
    deal.customer_name = body.customer_name.strip() or None
    deal.customer_phone = body.customer_phone.strip() or None
    deal.delivery_address = (body.delivery_address or "").strip() or None
    deal.customer_comment = (body.customer_comment or "").strip() or None
    deal.status = "active"
    deal.updated_at = datetime.utcnow()

    # Присваиваем номер сделки (с retry по уникальности)
    for _ in range(5):
        deal.deal_number = generate_order_number_11()
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            db.refresh(deal)
    else:
        raise HTTPException(status_code=500, detail="Не удалось сгенерировать уникальный номер сделки")

    # Атомарно списываем остатки
    for di in deal_items:
        product = db.query(models.Product).filter(models.Product.id == di.product_id).first()
        if not product:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Товар id={di.product_id} не найден")
        avail = _get_available_quantity(product, db)
        if di.quantity > avail:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно товара «{product.name}». Доступно: {avail} шт., в сделке: {di.quantity} шт.",
            )
        product.quantity = (product.quantity or 0) - di.quantity
    db.commit()
    db.refresh(deal)


@router.post("/checkout/start", response_model=schemas.DealCheckoutStartResponse)
async def deal_checkout_start(
    body: schemas.DealCheckoutRequest,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """
    Этап 1: создать черновую сделку (draft) с позициями и snapshots.
    Возвращает deal_id и сводку для отображения формы оформления.
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

    if not body.items or len(body.items) == 0:
        raise HTTPException(status_code=400, detail="Список товаров не может быть пустым")

    item_map = {}
    for it in body.items:
        if it.quantity < 1:
            raise HTTPException(status_code=400, detail=f"Количество для товара {it.product_id} должно быть не менее 1")
        item_map[it.product_id] = item_map.get(it.product_id, 0) + it.quantity

    deal, total_count, total_amount = _create_draft_deal(buyer_user_id, item_map, db)
    return schemas.DealCheckoutStartResponse(
        deal_id=deal.id,
        status=deal.status,
        total_items_count=total_count,
        total_amount=total_amount,
        currency=deal.currency,
    )


@router.post("/checkout/confirm", response_model=schemas.DealCheckoutResponse)
async def deal_checkout_confirm(
    body: schemas.DealConfirmRequest,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """
    Этап 2: подтвердить сделку (данные оформления + списание остатков).
    Сделка должна быть в статусе draft и принадлежать текущему пользователю.
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

    if not body.customer_name or not body.customer_name.strip():
        raise HTTPException(status_code=400, detail="Укажите имя")
    if not body.customer_phone or not body.customer_phone.strip():
        raise HTTPException(status_code=400, detail="Укажите телефон")

    deal = (
        db.query(models.Deal)
        .filter(models.Deal.id == body.deal_id, models.Deal.buyer_user_id == buyer_user_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")
    if deal.status != "draft":
        raise HTTPException(status_code=400, detail="Сделка уже подтверждена или отменена")

    _confirm_deal_and_decrement_stock(deal, body, buyer_user_id, db)
    return deal


@router.post("/checkout", response_model=schemas.DealCheckoutResponse)
async def create_deal_checkout(
    body: schemas.DealCheckoutRequest,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """
    [Deprecated] Оформление одной операцией (без шага оформления).
    Эквивалентно: checkout/start + checkout/confirm с дефолтами (card, pickup, «Клиент», «—»).
    Рекомендуется использовать checkout/start и checkout/confirm для полного ввода данных.
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

    if not body.items or len(body.items) == 0:
        raise HTTPException(status_code=400, detail="Список товаров не может быть пустым")

    item_map = {}
    for it in body.items:
        if it.quantity < 1:
            raise HTTPException(status_code=400, detail=f"Количество для товара {it.product_id} должно быть не менее 1")
        item_map[it.product_id] = item_map.get(it.product_id, 0) + it.quantity

    # Этап 1: черновая сделка
    deal, _, _ = _create_draft_deal(buyer_user_id, item_map, db)
    # Этап 2: подтверждение с дефолтными данными (совместимость со старым клиентом)
    confirm_body = schemas.DealConfirmRequest(
        deal_id=deal.id,
        payment_method="card",
        delivery_method="pickup",
        customer_name="Клиент",
        customer_phone="—",
        delivery_address=None,
        customer_comment=None,
    )
    deal = db.query(models.Deal).filter(models.Deal.id == deal.id).first()
    _confirm_deal_and_decrement_stock(deal, confirm_body, buyer_user_id, db)
    db.refresh(deal)
    return deal


@router.get("/my", response_model=List[schemas.DealSummary])
async def get_my_deals(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """Активные сделки текущего пользователя (buyer)."""
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

    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.buyer_user_id == buyer_user_id,
            models.Deal.status == "active",
        )
        .order_by(models.Deal.created_at.desc())
        .all()
    )

    result = []
    for d in deals:
        first_image_url = None
        first_item = (
            db.query(models.DealItem)
            .filter(models.DealItem.deal_id == d.id)
            .first()
        )
        if first_item and first_item.snapshot_id:
            snap = (
                db.query(models.UserProductSnapshot)
                .filter(models.UserProductSnapshot.snapshot_id == first_item.snapshot_id)
                .first()
            )
            if snap and snap.snapshot_json:
                try:
                    data = json.loads(snap.snapshot_json)
                    urls = data.get("images_urls") or []
                    if urls:
                        first_image_url = urls[0] if isinstance(urls[0], str) else None
                    elif data.get("image_url"):
                        first_image_url = data["image_url"]
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append(
            schemas.DealSummary(
                id=d.id,
                deal_number=d.deal_number,
                buyer_user_id=d.buyer_user_id,
                created_at=d.created_at,
                status=d.status,
                total_items_count=d.total_items_count,
                total_amount=d.total_amount,
                currency=d.currency,
                first_image_url=make_full_url(first_image_url) if first_image_url else None,
            )
        )
    return result


@router.get("/history", response_model=List[schemas.DealSummary])
async def get_deals_history(
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """Завершённые и отменённые сделки текущего пользователя."""
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

    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.buyer_user_id == buyer_user_id,
            models.Deal.status.in_(["completed", "cancelled"]),
        )
        .order_by(models.Deal.created_at.desc())
        .all()
    )

    result = []
    for d in deals:
        first_image_url = None
        first_item = (
            db.query(models.DealItem)
            .filter(models.DealItem.deal_id == d.id)
            .first()
        )
        if first_item and first_item.snapshot_id:
            snap = (
                db.query(models.UserProductSnapshot)
                .filter(models.UserProductSnapshot.snapshot_id == first_item.snapshot_id)
                .first()
            )
            if snap and snap.snapshot_json:
                try:
                    data = json.loads(snap.snapshot_json)
                    urls = data.get("images_urls") or []
                    if urls:
                        first_image_url = urls[0] if isinstance(urls[0], str) else None
                    elif data.get("image_url"):
                        first_image_url = data["image_url"]
                except (json.JSONDecodeError, TypeError):
                    pass
        result.append(
            schemas.DealSummary(
                id=d.id,
                deal_number=d.deal_number,
                buyer_user_id=d.buyer_user_id,
                created_at=d.created_at,
                status=d.status,
                total_items_count=d.total_items_count,
                total_amount=d.total_amount,
                currency=d.currency,
                first_image_url=make_full_url(first_image_url) if first_image_url else None,
            )
        )
    return result


@router.get("/{deal_id}", response_model=schemas.DealDetailResponse)
async def get_deal_detail(
    deal_id: int,
    x_telegram_init_data: Optional[str] = Header(None, alias="X-Telegram-Init-Data"),
    db: Session = Depends(database.get_db),
):
    """Детали сделки с позициями и snapshot-данными товаров."""
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

    deal = (
        db.query(models.Deal)
        .filter(models.Deal.id == deal_id, models.Deal.buyer_user_id == buyer_user_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    items = db.query(models.DealItem).filter(models.DealItem.deal_id == deal_id).all()
    item_responses = []
    for di in items:
        product_display = None
        if di.snapshot_id:
            snap = (
                db.query(models.UserProductSnapshot)
                .filter(models.UserProductSnapshot.snapshot_id == di.snapshot_id)
                .first()
            )
            if snap:
                product_display = _snapshot_to_product_display(snap)
        if not product_display:
            product_display = {
                "id": di.product_id,
                "name": "Товар недоступен",
                "price": None,
                "image_url": None,
                "images_urls": [],
                "is_unavailable": True,
            }

        pd = product_display or {}
        product_obj = schemas.DealItemProduct(
            id=pd.get("id"),
            name=pd.get("name"),
            price=pd.get("price"),
            price_card=pd.get("price_card"),
            price_cash=pd.get("price_cash"),
            discount=pd.get("discount", 0),
            image_url=pd.get("image_url"),
            images_urls=pd.get("images_urls"),
            is_unavailable=pd.get("is_unavailable", False),
        ) if product_display else None

        item_responses.append(
            schemas.DealItemResponse(
                id=di.id,
                product_id=di.product_id,
                snapshot_id=di.snapshot_id,
                seller_user_id=di.seller_user_id,
                quantity=di.quantity,
                price_per_unit=di.price_per_unit,
                line_total=di.line_total,
                product=product_obj,
            )
        )

    return schemas.DealDetailResponse(
        id=deal.id,
        deal_number=deal.deal_number,
        buyer_user_id=deal.buyer_user_id,
        created_at=deal.created_at,
        updated_at=getattr(deal, "updated_at", None),
        status=deal.status,
        total_items_count=deal.total_items_count,
        items_amount=getattr(deal, "items_amount", None),
        delivery_fee=getattr(deal, "delivery_fee", None),
        total_amount=deal.total_amount,
        currency=deal.currency,
        payment_method=getattr(deal, "payment_method", None),
        delivery_method=getattr(deal, "delivery_method", None),
        customer_name=getattr(deal, "customer_name", None),
        customer_phone=getattr(deal, "customer_phone", None),
        delivery_address=getattr(deal, "delivery_address", None),
        customer_comment=getattr(deal, "customer_comment", None),
        seller_comment=getattr(deal, "seller_comment", None),
        items=item_responses,
    )
