from pydantic import BaseModel
from typing import List, Optional

class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    parent_id: Optional[int] = None  # ID родительской категории (None для основных категорий)

class Category(CategoryBase):
    id: int
    parent_id: Optional[int] = None
    subcategories: Optional[List['Category']] = None  # Подкатегории (загружаются отдельно)

    class Config:
        from_attributes = True

# Для обновления модели после определения
Category.model_rebuild()







