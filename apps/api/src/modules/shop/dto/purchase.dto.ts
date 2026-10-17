import { PurchasePaymentMethod, PurchaseStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  taxRate?: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportCost?: number;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportCost?: number;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items?: PurchaseItemDto[];
}

export class PurchaseListQueryDto {
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ReceivePurchaseItemDto {
  @IsUUID()
  purchaseItemId!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantityRejected?: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  batchNumber?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shelfLocation?: string;
}

export class ReceivePurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  items!: ReceivePurchaseItemDto[];
}

export class RecordPurchasePaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PurchasePaymentMethod)
  method!: PurchasePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}

export class CancelPurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReturnPurchaseItemDto {
  @IsUUID()
  purchaseItemId!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;
}

export class ReturnPurchaseDto {
  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReturnPurchaseItemDto)
  items!: ReturnPurchaseItemDto[];
}
