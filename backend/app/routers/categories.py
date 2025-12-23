from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from ..db import models, database
from ..models import category as schemas

router = APIRouter(prefix="/api/categories", tags=["categories"])

@router.get("/", response_model=List[schemas.Category])
def get_categories(user_id: int, db: Session = Depends(database.get_db)):
    print(f"DEBUG: get_categories called with user_id={user_id}, type={type(user_id)}")
    categories = db.query(models.Category).filter(models.Category.user_id == user_id).all()
    print(f"DEBUG: Found {len(categories)} categories")
    return categories

@router.post("/", response_model=schemas.Category)
def create_category(
    category: schemas.CategoryCreate, 
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    db_category = models.Category(name=category.name, user_id=user_id)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    user_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """Удаление категории. При удалении категории также удаляются все товары в этой категории."""
    db_category = db.query(models.Category).filter(
        models.Category.id == category_id,
        models.Category.user_id == user_id
    ).first()
    
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Проверяем, есть ли товары в категории
    products_count = db.query(models.Product).filter(
        models.Product.category_id == category_id
    ).count()
    
    # Удаляем категорию (товары удалятся автоматически из-за cascade)
    db.delete(db_category)
    db.commit()
    
    return {
        "message": f"Category deleted. {products_count} products were also deleted." if products_count > 0 else "Category deleted."
    }
