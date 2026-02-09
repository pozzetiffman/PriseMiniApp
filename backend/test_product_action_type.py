"""
Тесты для проверки правильности вычисления action_type и can_add_to_cart.
Запуск: pytest backend/test_product_action_type.py -v
Или: python3 -m pytest backend/test_product_action_type.py -v
"""
import pytest
import sys
import os
from unittest.mock import Mock

# Добавляем путь к проекту для импорта
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.product_action_type import get_product_action_type


class MockProduct:
    """Мок объекта Product для тестирования"""
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


def test_reservation_priority():
    """Тест 1: Резервация имеет приоритет над продажей"""
    product = MockProduct(
        is_reservation_enabled=True,
        is_sale_enabled=True,
        is_made_to_order=False,
        price_card=1000.0,
        price_cash=950.0
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "reserve", f"Expected 'reserve', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    assert reason == "reservation_only", f"Expected 'reservation_only', got '{reason}'"
    print("✅ Test 1 PASSED: Reservation has priority over sale")


def test_made_to_order_priority():
    """Тест 2: Под заказ имеет приоритет над продажей"""
    product = MockProduct(
        is_reservation_enabled=False,
        is_sale_enabled=True,
        is_made_to_order=True,
        price_card=1000.0
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "order", f"Expected 'order', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    assert reason == "order_only", f"Expected 'order_only', got '{reason}'"
    print("✅ Test 2 PASSED: Made-to-order has priority over sale")


def test_sale_with_price():
    """Тест 3: Продажа разрешена если есть цена"""
    product = MockProduct(
        is_reservation_enabled=False,
        is_sale_enabled=True,
        is_made_to_order=False,
        price_card=1000.0,
        price_cash=None
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "sale", f"Expected 'sale', got '{action_type}'"
    assert can_add_to_cart == True, f"Expected True, got {can_add_to_cart}"
    assert reason is None, f"Expected None, got '{reason}'"
    print("✅ Test 3 PASSED: Sale allowed when price is set")


def test_sale_without_price():
    """Тест 4: Продажа запрещена если цена не задана"""
    product = MockProduct(
        is_reservation_enabled=False,
        is_sale_enabled=True,
        is_made_to_order=False,
        price_card=None,
        price_cash=None,
        price=None
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "none", f"Expected 'none', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    assert reason == "price_not_set", f"Expected 'price_not_set', got '{reason}'"
    print("✅ Test 4 PASSED: Sale blocked when price is not set")


def test_reservation_and_sale_conflict():
    """Тест 5: При конфликте резервация побеждает"""
    product = MockProduct(
        is_reservation_enabled=True,
        is_sale_enabled=True,
        is_made_to_order=False,
        price_card=1000.0
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "reserve", f"Expected 'reserve', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    print("✅ Test 5 PASSED: Reservation wins over sale in conflict")


def test_made_to_order_and_sale_conflict():
    """Тест 6: При конфликте под заказ побеждает"""
    product = MockProduct(
        is_reservation_enabled=False,
        is_sale_enabled=True,
        is_made_to_order=True,
        price_card=1000.0
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "order", f"Expected 'order', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    print("✅ Test 6 PASSED: Made-to-order wins over sale in conflict")


def test_none_when_no_flags():
    """Тест 7: Если нет флагов - возвращается none"""
    product = MockProduct(
        is_reservation_enabled=False,
        is_sale_enabled=False,
        is_made_to_order=False,
        is_for_sale=False,
        is_client_sale=False
    )
    shop_settings = {"reservations_enabled": False}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='client', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "none", f"Expected 'none', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    print("✅ Test 7 PASSED: None when no flags are set")


def test_owner_role():
    """Тест 8: Для владельца всегда возвращается none"""
    product = MockProduct(
        is_reservation_enabled=True,
        is_sale_enabled=True,
        is_made_to_order=False,
        price_card=1000.0
    )
    shop_settings = {"reservations_enabled": True}
    
    action_type, can_add_to_cart, reason = get_product_action_type(
        product, user_role='owner', shop_settings=shop_settings, db=None
    )
    
    assert action_type == "none", f"Expected 'none', got '{action_type}'"
    assert can_add_to_cart == False, f"Expected False, got {can_add_to_cart}"
    assert reason == "not_for_clients", f"Expected 'not_for_clients', got '{reason}'"
    print("✅ Test 8 PASSED: Owner always gets none")


if __name__ == "__main__":
    # Запуск тестов без pytest (для быстрой проверки)
    print("Running product_action_type tests...\n")
    
    test_reservation_priority()
    test_made_to_order_priority()
    test_sale_with_price()
    test_sale_without_price()
    test_reservation_and_sale_conflict()
    test_made_to_order_and_sale_conflict()
    test_none_when_no_flags()
    test_owner_role()
    
    print("\n✅ All tests passed!")
