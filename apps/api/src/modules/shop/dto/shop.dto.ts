import { ProductVisibility, ShopOrderStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
}
