"""Pydantic models for ERP/POS. UUID string ids stored under `id` in MongoDB (avoids ObjectId issues)."""
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid


def new_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Auth ----------
Role = Literal["ADMIN", "MANAGER", "CASSIERE_DONNA_1", "CASSIERE_DONNA_2", "CASSIERE_UOMO"]

class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: Role
    location_id: Optional[str] = None
    is_demo: bool = False

class UserCreate(UserBase):
    password: str

class UserOut(UserBase):
    id: str
    created_at: datetime

class LoginIn(BaseModel):
    email: str
    password: str


# ---------- Location / Pool ----------
class Location(BaseModel):
    id: str = Field(default_factory=new_id)
    code: str  # LOCATION_DONNA_1, ...
    name: str
    area: Literal["DONNA", "UOMO"]
    pool_id: str

class InventoryPool(BaseModel):
    id: str = Field(default_factory=new_id)
    code: str  # POOL_DONNA, POOL_UOMO
    name: str
    area: Literal["DONNA", "UOMO"]
    shopify_connection_id: Optional[str] = None


# ---------- Catalog ----------
class Brand(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str

class Supplier(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str

class Category(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    parent_id: Optional[str] = None

class Season(BaseModel):
    id: str = Field(default_factory=new_id)
    code: str  # FW26, SS27
    name: str


CHANNELS = ["DONNA_1", "DONNA_2", "SHOPIFY_DONNA", "UOMO", "SHOPIFY_UOMO"]


class ProductBase(BaseModel):
    model_code: str
    name: str
    description: Optional[str] = ""
    brand_id: Optional[str] = None
    supplier_id: Optional[str] = None
    category_id: Optional[str] = None
    season_id: Optional[str] = None
    gender: Literal["DONNA", "UOMO", "UNISEX"] = "DONNA"
    vat_rate: float = 22.0
    status: Literal["ATTIVO", "BOZZA", "ARCHIVIATO"] = "ATTIVO"
    channels: List[str] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)
    is_demo: bool = False

class ProductCreate(ProductBase):
    variants: List["VariantCreate"] = Field(default_factory=list)

class Product(ProductBase):
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class VariantBase(BaseModel):
    color: str
    color_code: Optional[str] = ""
    size: str
    sku: str
    ean: Optional[str] = None
    cost: float = 0.0
    price: float = 0.0
    compare_at_price: Optional[float] = None
    promo_price: Optional[float] = None
    promo_start: Optional[datetime] = None
    promo_end: Optional[datetime] = None

class VariantCreate(VariantBase):
    initial_stock: dict = Field(default_factory=dict)  # {location_id: qty}

class Variant(VariantBase):
    id: str = Field(default_factory=new_id)
    product_id: str
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Inventory ----------
class InventoryRow(BaseModel):
    id: str = Field(default_factory=new_id)
    variant_id: str
    location_id: str
    on_hand: int = 0
    reserved: int = 0
    updated_at: datetime = Field(default_factory=now_utc)

MovementType = Literal[
    "INITIAL_STOCK", "PURCHASE", "SALE", "SHOPIFY_SALE", "RETURN",
    "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "DAMAGED", "RESERVED", "RELEASED"
]

class InventoryMovement(BaseModel):
    id: str = Field(default_factory=new_id)
    variant_id: str
    location_id: str
    type: MovementType
    quantity: int
    origin: str = "MANUAL"  # POS, SHOPIFY, IMPORT, TRANSFER, MANUAL
    document_ref: Optional[str] = None
    user_id: Optional[str] = None
    external_id: Optional[str] = None  # for idempotency
    note: Optional[str] = ""
    created_at: datetime = Field(default_factory=now_utc)


# ---------- POS Sales ----------
class SaleItemIn(BaseModel):
    variant_id: str
    quantity: int = 1
    unit_price: float
    discount_pct: float = 0.0

class SaleCreate(BaseModel):
    location_id: str
    items: List[SaleItemIn]
    payment_method: Literal["CONTANTI", "CARTA", "BONIFICO", "ALTRO"] = "CARTA"
    customer_id: Optional[str] = None
    note: Optional[str] = ""
    external_id: Optional[str] = None  # idempotency

class Sale(BaseModel):
    id: str = Field(default_factory=new_id)
    number: str
    location_id: str
    items: List[dict]
    subtotal: float
    discount_total: float
    total: float
    payment_method: str
    customer_id: Optional[str] = None
    user_id: Optional[str] = None
    is_return: bool = False
    original_sale_id: Optional[str] = None
    channel: Literal["POS", "SHOPIFY_DONNA", "SHOPIFY_UOMO"] = "POS"
    note: Optional[str] = ""
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Transfers ----------
class TransferItemIn(BaseModel):
    variant_id: str
    quantity: int

class TransferCreate(BaseModel):
    from_location_id: str
    to_location_id: str
    items: List[TransferItemIn]
    note: Optional[str] = ""

class Transfer(BaseModel):
    id: str = Field(default_factory=new_id)
    number: str
    from_location_id: str
    to_location_id: str
    items: List[dict]
    status: Literal["COMPLETATO", "IN_CORSO", "ANNULLATO"] = "COMPLETATO"
    user_id: Optional[str] = None
    note: Optional[str] = ""
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Customers ----------
class Customer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Promotions ----------
class Promotion(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    scope: Literal["CATEGORY", "BRAND", "SEASON", "PRODUCT"]
    scope_id: str
    discount_pct: float
    start: datetime
    end: datetime
    active: bool = True
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Shopify ----------
class ShopifyConnection(BaseModel):
    id: str = Field(default_factory=new_id)
    code: Literal["SHOPIFY_DONNA", "SHOPIFY_UOMO"]
    store_domain: Optional[str] = None
    access_token: Optional[str] = None  # stored in DB, masked on output
    pool_id: str
    connected: bool = False
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None

class ShopifyConnectionIn(BaseModel):
    store_domain: str
    access_token: str


# ---------- Sync Jobs ----------
SyncStatus = Literal["PENDING", "PROCESSING", "SUCCESS", "FAILED", "RETRY"]

class SyncJob(BaseModel):
    id: str = Field(default_factory=new_id)
    origin: str  # ERP, SHOPIFY_DONNA, SHOPIFY_UOMO
    destination: str
    type: str  # INVENTORY_UPDATE, PRODUCT_PUSH, ORDER_INGEST
    sku: Optional[str] = None
    payload: dict = Field(default_factory=dict)
    status: SyncStatus = "PENDING"
    attempts: int = 0
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


# ---------- CSV Import ----------
class CSVProfile(BaseModel):
    id: str = Field(default_factory=new_id)
    supplier_name: str
    mapping: dict  # {"ARTICOLO": "model_code", ...}
    created_at: datetime = Field(default_factory=now_utc)

class CSVImport(BaseModel):
    id: str = Field(default_factory=new_id)
    supplier_name: str
    filename: str
    profile_id: Optional[str] = None
    rows_total: int = 0
    rows_ok: int = 0
    rows_error: int = 0
    errors: List[dict] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=now_utc)


# ---------- Audit ----------
class AuditLog(BaseModel):
    id: str = Field(default_factory=new_id)
    action: str
    entity: str
    entity_id: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    details: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=now_utc)


ProductCreate.model_rebuild()
