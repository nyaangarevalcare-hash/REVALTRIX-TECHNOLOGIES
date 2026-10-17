import {
  ProductPrescriptionClass,
  ProductStatus,
  ProductVatStatus,
  ProductVisibility,
  ShopOrderType,
  ShopOrderStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateShopSettingsDto {
  @IsString()
  @Length(1, 200)
  storeName!: string;

  @IsOptional()
  @IsBoolean()
  acceptingOrders?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumOrderValue?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class CreateShopCategoryDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 140)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateShopProductDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  categoryId?: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 100)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @IsBoolean()
  prescriptionRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class UpdateShopProductDto {
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string | null;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @IsBoolean()
  prescriptionRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class ShopOrderLineDto {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateShopOrderDto {
  @IsString()
  @Length(1, 200)
  customerName!: string;

  @IsString()
  @Length(1, 50)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  customerEmail?: string;

  @IsString()
  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryMethod!: 'PICKUP' | 'DELIVERY';

  @IsOptional()
  @IsEnum(ShopOrderType)
  orderType?: ShopOrderType;

  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, string>;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopOrderLineDto)
  items!: ShopOrderLineDto[];
}

export class UpdateShopOrderStatusDto {
  @IsEnum(ShopOrderStatus)
  status!: ShopOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateShopOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, string> | null;

  @IsOptional()
  @IsISO8601()
  pickupAt?: string | null;

  @IsOptional()
  @IsUUID()
  prescriptionId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prescriptionKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryNotes?: string | null;
}

export class AssignShopOrderDto {
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @IsOptional()
  @IsUUID()
  riderId?: string | null;
}

export class CancelShopOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RefundShopOrderDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  returnToStock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;
}

export class RecordShopOrderPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Length(1, 40)
  method!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class ReturnShopOrderDto {
  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  returnToStock?: boolean;
}

export class ShopPosSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  batchId!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;
}

export class ShopPosPaymentDto {
  @IsIn(['CASH', 'MPESA_STK_PUSH', 'CARD', 'BANK_TRANSFER', 'CREDIT_ACCOUNT'])
  method!: 'CASH' | 'MPESA_STK_PUSH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class CreateShopPosSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopPosSaleItemDto)
  items!: ShopPosSaleItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ShopPosPaymentDto)
  payments!: ShopPosPaymentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPhone?: string;
}

export class HoldShopPosSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopPosSaleItemDto)
  items!: ShopPosSaleItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;
}

export class ResumeShopPosSaleDto {
  @IsUUID()
  heldSaleId!: string;

  @IsOptional()
  @IsBoolean()
  consume?: boolean;
}

export class RefundShopPosSaleDto {
  @IsUUID()
  saleId!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  returnStock?: boolean;
}

export class ReceiveShopPosBatchDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @Length(1, 100)
  batchNumber!: string;

  @IsISO8601()
  expiryDate!: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;
}

export class ProductCatalogueDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 100)
  sku!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  genericName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosageForm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packSize?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ppbRegistrationNumber?: string | null;

  @IsOptional()
  @IsEnum(ProductPrescriptionClass)
  prescriptionClass?: ProductPrescriptionClass;

  @IsOptional()
  @IsEnum(ProductVatStatus)
  vatStatus?: ProductVatStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStockLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  storageInstructions?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresColdChain?: boolean;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @IsBoolean()
  prescriptionRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}

export class CreateProductCatalogueDto extends ProductCatalogueDto {}

export class UpdateProductCatalogueDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  sku?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  genericName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosageForm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packSize?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ppbRegistrationNumber?: string | null;

  @IsOptional()
  @IsEnum(ProductPrescriptionClass)
  prescriptionClass?: ProductPrescriptionClass;

  @IsOptional()
  @IsEnum(ProductVatStatus)
  vatStatus?: ProductVatStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  wholesalePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumStockLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  storageInstructions?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresColdChain?: boolean;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;
}

export class ProductListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  genericName?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsEnum(ProductPrescriptionClass)
  prescriptionClass?: ProductPrescriptionClass;

  @IsOptional()
  @IsIn(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'])
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  @IsOptional()
  @IsIn(['EXPIRED', 'EXPIRING_SOON', 'NO_EXPIRY'])
  expiryStatus?: 'EXPIRED' | 'EXPIRING_SOON' | 'NO_EXPIRY';

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  coldChain?: boolean;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['name', 'sellingPrice', 'stockQuantity', 'createdAt', 'earliestExpiry'])
  sortBy?: 'name' | 'sellingPrice' | 'stockQuantity' | 'createdAt' | 'earliestExpiry';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class CreateSupplierDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}

export class BulkPriceUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  productIds!: string[];

  @IsIn(['SET', 'INCREASE_PERCENT', 'DECREASE_PERCENT'])
  mode!: 'SET' | 'INCREASE_PERCENT' | 'DECREASE_PERCENT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;
}
