import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { authenticatedApiDownload, authenticatedApiRequest } from '../../../lib/auth-api.js';
import './ProductCataloguePage.css';

type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
type PrescriptionClass = 'OTC' | 'PRESCRIPTION_ONLY' | 'CONTROLLED';
type VatStatus = 'VATABLE' | 'ZERO_RATED' | 'EXEMPT';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface CatalogueProduct {
  id: string;
  name: string;
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  manufacturer: string | null;
  supplierId: string | null;
  supplier: Supplier | null;
  categoryId: string | null;
  category: Category | null;
  barcode: string | null;
  sku: string;
  ppbRegistrationNumber: string | null;
  prescriptionClass: PrescriptionClass;
  vatStatus: VatStatus;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  minimumStockLevel: number;
  reorderLevel: number;
  reorderQuantity: number;
  storageInstructions: string | null;
  requiresColdChain: boolean;
  imageUrl: string | null;
  notes: string | null;
  stockQuantity: number;
  reservedStock: number;
  totalStock: number;
  totalStockValue: string;
  earliestExpiry: string | null;
  status: ProductStatus;
  createdAt: string;
}

interface ProductBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: string;
  supplierName: string | null;
  receivedAt: string;
}

interface ProductSale {
  id: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  sale: {
    saleNumber: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    customerName: string | null;
  };
}

interface ProductMovement {
  id: string;
  type: string;
  quantity: number;
  reason: string;
  createdAt: string;
  batch: { batchNumber: string; costPrice: string; expiryDate: string };
  sale: { saleNumber: string } | null;
}

interface ProductDetails extends CatalogueProduct {
  batches: ProductBatch[];
  lastPurchasePrice: string;
  lastSalePrice: string;
  profitMargin: string | null;
  salesHistory: ProductSale[];
  purchaseHistory: ProductMovement[];
  stockMovementHistory: ProductMovement[];
}

interface ProductListResponse {
  items: CatalogueProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ProductForm {
  name: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  manufacturer: string;
  supplierId: string;
  categoryId: string;
  barcode: string;
  sku: string;
  ppbRegistrationNumber: string;
  prescriptionClass: PrescriptionClass;
  vatStatus: VatStatus;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  taxRate: string;
  minimumStockLevel: string;
  reorderLevel: string;
  reorderQuantity: string;
  storageInstructions: string;
  requiresColdChain: boolean;
  status: ProductStatus;
  notes: string;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  brandName: '',
  genericName: '',
  strength: '',
  dosageForm: '',
  packSize: '',
  manufacturer: '',
  supplierId: '',
  categoryId: '',
  barcode: '',
  sku: '',
  ppbRegistrationNumber: '',
  prescriptionClass: 'OTC',
  vatStatus: 'VATABLE',
  costPrice: '0',
  sellingPrice: '',
  wholesalePrice: '',
  taxRate: '0',
  minimumStockLevel: '0',
  reorderLevel: '0',
  reorderQuantity: '0',
  storageInstructions: '',
  requiresColdChain: false,
  status: 'ACTIVE',
  notes: '',
};

const CODE39: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  $: '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100',
};

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

function productQuery(filters: URLSearchParams, page: number): string {
  const query = new URLSearchParams(filters);
  query.set('page', String(page));
  query.set('pageSize', '50');
  return query.toString();
}

function ProductImage({ product, large = false }: { product: CatalogueProduct; large?: boolean }) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!product.imageUrl) {
      setSource(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void authenticatedApiDownload(product.imageUrl)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSource(objectUrl);
      })
      .catch((error: unknown) => {
        console.error('Unable to display the product image.', error);
        if (!cancelled) setSource(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.imageUrl]);
  return source ? (
    <img
      className={large ? 'product-image product-image-large' : 'product-image'}
      src={source}
      alt={`${product.name} product`}
    />
  ) : (
    <span
      className={
        large
          ? 'product-image product-image-large product-image-empty'
          : 'product-image product-image-empty'
      }
    >
      {product.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function BarcodeSvg({ value }: { value: string }) {
  const text = `*${value.toUpperCase()}*`;
  const patterns = [...text].map((character) => CODE39[character]);
  if (patterns.some((pattern) => !pattern))
    return <span className="product-barcode-invalid">Unsupported Code 39 characters</span>;
  const units: Array<{ dark: boolean; wide: boolean }> = [];
  for (const pattern of patterns) {
    [...pattern].forEach((bit, index) => units.push({ dark: index % 2 === 0, wide: bit === '1' }));
    units.push({ dark: false, wide: false });
  }
  const width = units.reduce((sum, unit) => sum + (unit.wide ? 3 : 1), 0);
  let offset = 0;
  const bars = units.flatMap((unit, index) => {
    const unitWidth = unit.wide ? 3 : 1;
    const rect =
      unit.dark && index % 2 === 0 ? (
        <rect key={index} x={offset} y="0" width={unitWidth} height="50" fill="#111827" />
      ) : null;
    offset += unitWidth;
    return rect ? [rect] : [];
  });
  return (
    <svg
      className="product-barcode-svg"
      viewBox={`0 0 ${width} 50`}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {bars}
    </svg>
  );
}

export function ProductCataloguePage({ initialSupplierId = '' }: { initialSupplierId?: string }) {
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [genericName, setGenericName] = useState('');
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [prescriptionClass, setPrescriptionClass] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [expiryStatus, setExpiryStatus] = useState('');
  const [coldChain, setColdChain] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogueProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<'SET' | 'INCREASE_PERCENT' | 'DECREASE_PERCENT'>('SET');
  const [bulkValue, setBulkValue] = useState('');
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [details, setDetails] = useState<ProductDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const filters = useMemo(() => {
    const result = new URLSearchParams();
    const values: Record<string, string> = {
      search,
      categoryId,
      brand,
      genericName,
      supplierId,
      prescriptionClass,
      stockStatus,
      expiryStatus,
      coldChain,
      status,
      sortBy,
      sortOrder,
    };
    for (const [key, value] of Object.entries(values)) if (value) result.set(key, value);
    return result;
  }, [
    search,
    categoryId,
    brand,
    genericName,
    supplierId,
    prescriptionClass,
    stockStatus,
    expiryStatus,
    coldChain,
    status,
    sortBy,
    sortOrder,
  ]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedApiRequest<ProductListResponse>(
        `/v1/shop/products?${productQuery(filters, page)}`,
      );
      setProducts(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setSelectedIds((current) =>
        current.filter((id) => response.items.some((item) => item.id === id)),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      authenticatedApiRequest<Category[]>('/v1/shop/categories'),
      authenticatedApiRequest<Supplier[]>('/v1/shop/suppliers'),
    ])
      .then(([categoryList, supplierList]) => {
        if (!cancelled) {
          setCategories(categoryList);
          setSuppliers(supplierList);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to load catalogue options.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (initialSupplierId) {
      setSupplierId(initialSupplierId);
      setPage(1);
    }
  }, [initialSupplierId]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openNewProduct() {
    setError(null);
    setEditingProduct(null);
    setImageFile(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditProduct(product: CatalogueProduct) {
    setError(null);
    setEditingProduct(product);
    setImageFile(null);
    setForm({
      name: product.name,
      brandName: product.brandName ?? '',
      genericName: product.genericName ?? '',
      strength: product.strength ?? '',
      dosageForm: product.dosageForm ?? '',
      packSize: product.packSize ?? '',
      manufacturer: product.manufacturer ?? '',
      supplierId: product.supplierId ?? '',
      categoryId: product.categoryId ?? '',
      barcode: product.barcode ?? '',
      sku: product.sku,
      ppbRegistrationNumber: product.ppbRegistrationNumber ?? '',
      prescriptionClass: product.prescriptionClass,
      vatStatus: product.vatStatus,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      wholesalePrice: product.wholesalePrice ?? '',
      taxRate: '0',
      minimumStockLevel: String(product.minimumStockLevel),
      reorderLevel: String(product.reorderLevel),
      reorderQuantity: String(product.reorderQuantity),
      storageInstructions: product.storageInstructions ?? '',
      requiresColdChain: product.requiresColdChain,
      status: product.status,
      notes: product.notes ?? '',
    });
    setFormOpen(true);
  }

  useEffect(() => {
    if (!formOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [formOpen]);

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const body = {
      ...form,
      categoryId: form.categoryId || null,
      supplierId: form.supplierId || null,
      brandName: emptyToNull(form.brandName),
      genericName: emptyToNull(form.genericName),
      strength: emptyToNull(form.strength),
      dosageForm: emptyToNull(form.dosageForm),
      packSize: emptyToNull(form.packSize),
      manufacturer: emptyToNull(form.manufacturer),
      barcode: emptyToNull(form.barcode),
      ppbRegistrationNumber: emptyToNull(form.ppbRegistrationNumber),
      costPrice: Number(form.costPrice || 0),
      sellingPrice: Number(form.sellingPrice),
      wholesalePrice: form.wholesalePrice ? Number(form.wholesalePrice) : null,
      taxRate: Number(form.taxRate || 0),
      minimumStockLevel: Number(form.minimumStockLevel || 0),
      reorderLevel: Number(form.reorderLevel || 0),
      reorderQuantity: Number(form.reorderQuantity || 0),
      storageInstructions: emptyToNull(form.storageInstructions),
      notes: emptyToNull(form.notes),
    };
    try {
      const product = await authenticatedApiRequest<CatalogueProduct>(
        editingProduct ? `/v1/shop/products/${editingProduct.id}` : '/v1/shop/products',
        {
          method: editingProduct ? 'PUT' : 'POST',
          body: JSON.stringify(body),
        },
      );
      if (imageFile) {
        const imageForm = new FormData();
        imageForm.set('file', imageFile);
        await authenticatedApiRequest(`/v1/shop/products/${product.id}/image`, {
          method: 'POST',
          body: imageForm,
        });
      }
      setFormOpen(false);
      setNotice(editingProduct ? 'Product updated.' : 'Product created.');
      await loadProducts();
      if (details?.id === product.id) await openDetails(product.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(productId: string) {
    setDetailsLoading(true);
    setError(null);
    try {
      const product = await authenticatedApiRequest<ProductDetails>(
        `/v1/shop/products/${productId}`,
      );
      setDetails(product);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to load product details.',
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  async function deactivateProduct(product: CatalogueProduct) {
    if (!window.confirm(`Deactivate ${product.name}? It will remain in sales and audit history.`))
      return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/products/${product.id}`, { method: 'DELETE' });
      setNotice(`${product.name} discontinued.`);
      setDetails(null);
      await loadProducts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to deactivate product.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest('/v1/shop/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, slug: categorySlug }),
      });
      setCategoryName('');
      setCategorySlug('');
      setCategories(await authenticatedApiRequest<Category[]>('/v1/shop/categories'));
      setNotice('Category created.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create category.');
    } finally {
      setSaving(false);
    }
  }

  async function addSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest('/v1/shop/suppliers', {
        method: 'POST',
        body: JSON.stringify({ name: supplierName }),
      });
      setSupplierName('');
      setSuppliers(await authenticatedApiRequest<Supplier[]>('/v1/shop/suppliers'));
      setNotice('Supplier created.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create supplier.');
    } finally {
      setSaving(false);
    }
  }

  async function importProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setError('Choose a CSV or .xlsx file to import.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const data = new FormData();
    data.set('file', importFile);
    try {
      const result = await authenticatedApiRequest<{ imported: number; failed: number }>(
        '/v1/shop/products/import',
        { method: 'POST', body: data },
      );
      setImportOpen(false);
      setImportFile(null);
      setNotice(`Import finished: ${result.imported} created, ${result.failed} failed.`);
      await loadProducts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to import products.');
    } finally {
      setSaving(false);
    }
  }

  async function exportProducts(format: 'csv' | 'xlsx' = 'csv') {
    setSaving(true);
    setError(null);
    try {
      const query = new URLSearchParams(filters);
      query.set('format', format);
      const blob = await authenticatedApiDownload(`/v1/shop/products/export?${query}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `products.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`Product catalogue exported as ${format.toUpperCase()}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to export products.');
    } finally {
      setSaving(false);
    }
  }

  async function bulkUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<{ updatedCount: number }>(
        '/v1/shop/products/bulk-price-update',
        {
          method: 'POST',
          body: JSON.stringify({
            productIds: selectedIds,
            mode: bulkMode,
            value: Number(bulkValue),
          }),
        },
      );
      setBulkOpen(false);
      setBulkValue('');
      setNotice(`${result.updatedCount} product prices updated.`);
      await loadProducts();
      if (details && selectedIds.includes(details.id)) await openDetails(details.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update prices.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  const allPageSelected =
    products.length > 0 && products.every((product) => selectedIds.includes(product.id));

  return (
    <div className="shop-product-catalogue">
      <section className="shop-panel shop-product-toolbar">
        <div>
          <h2>
            Medical product catalogue <span>{total}</span>
          </h2>
          <p>
            Search, review, and maintain pharmacy products, pricing, expiry, and stock controls.
          </p>
        </div>
        <div className="shop-product-actions">
          <button className="shop-btn primary" onClick={openNewProduct} type="button">
            Add Product
          </button>
          <button className="shop-btn secondary" onClick={() => setImportOpen(true)} type="button">
            Import Products
          </button>
          <button
            className="shop-btn secondary"
            disabled={saving}
            onClick={() => void exportProducts()}
            type="button"
          >
            Export Products
          </button>
          <button
            className="shop-btn secondary"
            disabled={selectedIds.length === 0}
            onClick={() => setBarcodeOpen(true)}
            type="button"
          >
            Print Barcode Labels
          </button>
          <button
            className="shop-btn secondary"
            onClick={() => setCategoryOpen(true)}
            type="button"
          >
            Categories
          </button>
          <button
            className="shop-btn secondary"
            disabled={selectedIds.length === 0}
            onClick={() => setBulkOpen(true)}
            type="button"
          >
            Bulk Update Prices
          </button>
        </div>
      </section>

      {(error || notice) && (
        <div className={error ? 'shop-product-alert is-error' : 'shop-product-alert'} role="status">
          {error ?? notice}
          <button
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            type="button"
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="shop-panel shop-product-filters" aria-label="Product filters">
        <input
          className="shop-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, brand, generic, barcode, SKU..."
          aria-label="Search products"
        />
        <select
          className="shop-input"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          className="shop-input"
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          placeholder="Brand"
          aria-label="Filter by brand"
        />
        <input
          className="shop-input"
          value={genericName}
          onChange={(event) => setGenericName(event.target.value)}
          placeholder="Generic name"
          aria-label="Filter by generic name"
        />
        <select
          className="shop-input"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          aria-label="Filter by supplier"
        >
          <option value="">All suppliers</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <select
          className="shop-input"
          value={prescriptionClass}
          onChange={(event) => setPrescriptionClass(event.target.value)}
          aria-label="Filter by prescription class"
        >
          <option value="">All prescription classes</option>
          <option>OTC</option>
          <option value="PRESCRIPTION_ONLY">Prescription only</option>
          <option value="CONTROLLED">Controlled</option>
        </select>
        <select
          className="shop-input"
          value={stockStatus}
          onChange={(event) => setStockStatus(event.target.value)}
          aria-label="Filter by stock"
        >
          <option value="">All stock levels</option>
          <option value="IN_STOCK">In stock</option>
          <option value="LOW_STOCK">Low stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
        </select>
        <select
          className="shop-input"
          value={expiryStatus}
          onChange={(event) => setExpiryStatus(event.target.value)}
          aria-label="Filter by expiry"
        >
          <option value="">All expiry statuses</option>
          <option value="EXPIRED">Expired stock</option>
          <option value="EXPIRING_SOON">Expiring within 30 days</option>
          <option value="NO_EXPIRY">No expiry recorded</option>
        </select>
        <select
          className="shop-input"
          value={coldChain}
          onChange={(event) => setColdChain(event.target.value)}
          aria-label="Filter cold-chain"
        >
          <option value="">Cold-chain: all</option>
          <option value="true">Cold-chain required</option>
          <option value="false">No cold-chain</option>
        </select>
        <select
          className="shop-input"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by product status"
        >
          <option value="">All statuses</option>
          <option>ACTIVE</option>
          <option>INACTIVE</option>
          <option>DISCONTINUED</option>
        </select>
        <select
          className="shop-input"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          aria-label="Sort products"
        >
          <option value="name">Sort: name</option>
          <option value="sellingPrice">Sort: selling price</option>
          <option value="stockQuantity">Sort: stock</option>
          <option value="earliestExpiry">Sort: earliest expiry</option>
          <option value="createdAt">Sort: newest</option>
        </select>
        <select
          className="shop-input"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as 'asc' | 'desc')}
          aria-label="Sort direction"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </section>

      <section className="shop-panel">
        <div className="shop-product-table-wrap">
          <table className="shop-table shop-product-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={() =>
                      setSelectedIds(
                        allPageSelected
                          ? selectedIds.filter(
                              (id) => !products.some((product) => product.id === id),
                            )
                          : [
                              ...new Set([
                                ...selectedIds,
                                ...products.map((product) => product.id),
                              ]),
                            ],
                      )
                    }
                    aria-label="Select current page"
                  />
                </th>
                <th>Image</th>
                <th>Product name</th>
                <th>Brand</th>
                <th>Generic name</th>
                <th>Strength</th>
                <th>Dosage form</th>
                <th>Pack size</th>
                <th>Category</th>
                <th>Barcode / SKU</th>
                <th>Selling price</th>
                <th>Total stock</th>
                <th>Earliest expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  onClick={() => void openDetails(product.id)}
                  className="shop-product-row"
                >
                  <td onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </td>
                  <td>
                    <ProductImage product={product} />
                  </td>
                  <td>
                    <strong>{product.name}</strong>
                    <small>{product.manufacturer ?? ''}</small>
                  </td>
                  <td>{product.brandName ?? '—'}</td>
                  <td>{product.genericName ?? '—'}</td>
                  <td>{product.strength ?? '—'}</td>
                  <td>{product.dosageForm ?? '—'}</td>
                  <td>{product.packSize ?? '—'}</td>
                  <td>{product.category?.name ?? '—'}</td>
                  <td>
                    <code>{product.barcode || product.sku}</code>
                    <small>{product.barcode ? product.sku : ''}</small>
                  </td>
                  <td>{product.sellingPrice}</td>
                  <td>{product.totalStock}</td>
                  <td>
                    {product.earliestExpiry
                      ? new Date(product.earliestExpiry).toLocaleDateString()
                      : '—'}
                  </td>
                  <td>
                    <span className={`shop-product-status status-${product.status.toLowerCase()}`}>
                      {product.status}
                    </span>
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <button
                      className="shop-btn secondary shop-product-small-button"
                      onClick={() => openEditProduct(product)}
                      type="button"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && products.length === 0 && (
                <tr>
                  <td className="shop-empty" colSpan={15}>
                    No products match these filters.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="shop-empty" colSpan={15}>
                    Loading products...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="shop-product-pagination">
          <span>
            {total
              ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total}`
              : '0 products'}{' '}
            · {selectedIds.length} selected
          </span>
          <div>
            <button
              className="shop-btn secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="shop-btn secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => value + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {formOpen && (
        <div className="shop-product-backdrop shop-product-form-backdrop" role="presentation">
          <form
            className="shop-product-drawer shop-product-form"
            aria-labelledby="shop-product-form-title"
            aria-modal="true"
            role="dialog"
            onSubmit={(event) => void submitProduct(event)}
          >
            <header className="shop-product-form-header">
              <h2 id="shop-product-form-title">
                {editingProduct ? 'Edit product' : 'Add product'}
              </h2>
              <button
                disabled={saving}
                onClick={() => setFormOpen(false)}
                type="button"
                aria-label="Close product form"
              >
                ×
              </button>
            </header>
            <div className="shop-product-form-grid">
              <div className="shop-product-form-section">
                <h3>Product information</h3>
                <p>Names and identifiers used to find this product.</p>
              </div>
              <label>
                Product name
                <input
                  className="shop-input"
                  required
                  autoFocus
                  maxLength={200}
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                />
              </label>
              <label>
                Brand name
                <input
                  className="shop-input"
                  value={form.brandName}
                  onChange={(event) => updateForm('brandName', event.target.value)}
                />
              </label>
              <label>
                Generic name
                <input
                  className="shop-input"
                  value={form.genericName}
                  onChange={(event) => updateForm('genericName', event.target.value)}
                />
              </label>
              <label>
                Strength
                <input
                  className="shop-input"
                  value={form.strength}
                  onChange={(event) => updateForm('strength', event.target.value)}
                />
              </label>
              <label>
                Dosage form
                <input
                  className="shop-input"
                  value={form.dosageForm}
                  onChange={(event) => updateForm('dosageForm', event.target.value)}
                />
              </label>
              <label>
                Pack size
                <input
                  className="shop-input"
                  value={form.packSize}
                  onChange={(event) => updateForm('packSize', event.target.value)}
                />
              </label>
              <label>
                Manufacturer
                <input
                  className="shop-input"
                  value={form.manufacturer}
                  onChange={(event) => updateForm('manufacturer', event.target.value)}
                />
              </label>
              <label>
                Supplier
                <select
                  className="shop-input"
                  value={form.supplierId}
                  onChange={(event) => updateForm('supplierId', event.target.value)}
                >
                  <option value="">No supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  className="shop-input"
                  value={form.categoryId}
                  onChange={(event) => updateForm('categoryId', event.target.value)}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Barcode
                <input
                  className="shop-input"
                  value={form.barcode}
                  onChange={(event) => updateForm('barcode', event.target.value)}
                />
              </label>
              <label>
                SKU
                <input
                  className="shop-input"
                  required
                  value={form.sku}
                  onChange={(event) => updateForm('sku', event.target.value)}
                />
              </label>
              <label>
                PPB registration number
                <input
                  className="shop-input"
                  value={form.ppbRegistrationNumber}
                  onChange={(event) => updateForm('ppbRegistrationNumber', event.target.value)}
                />
              </label>
              <div className="shop-product-form-section">
                <h3>Classification and pricing</h3>
                <p>Set dispensing class, VAT treatment, and prices in your store currency.</p>
              </div>
              <label>
                Prescription class
                <select
                  className="shop-input"
                  value={form.prescriptionClass}
                  onChange={(event) =>
                    updateForm('prescriptionClass', event.target.value as PrescriptionClass)
                  }
                >
                  <option>OTC</option>
                  <option value="PRESCRIPTION_ONLY">Prescription only</option>
                  <option value="CONTROLLED">Controlled</option>
                </select>
              </label>
              <label>
                VAT status
                <select
                  className="shop-input"
                  value={form.vatStatus}
                  onChange={(event) => updateForm('vatStatus', event.target.value as VatStatus)}
                >
                  <option value="VATABLE">Vatable</option>
                  <option value="ZERO_RATED">Zero rated</option>
                  <option value="EXEMPT">Exempt</option>
                </select>
              </label>
              <label>
                Cost price
                <input
                  className="shop-input"
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.costPrice}
                  onChange={(event) => updateForm('costPrice', event.target.value)}
                />
              </label>
              <label>
                Selling price
                <input
                  className="shop-input"
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.sellingPrice}
                  onChange={(event) => updateForm('sellingPrice', event.target.value)}
                />
              </label>
              <label>
                Wholesale price
                <input
                  className="shop-input"
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.wholesalePrice}
                  onChange={(event) => updateForm('wholesalePrice', event.target.value)}
                />
              </label>
              <label>
                Tax rate (%)
                <input
                  className="shop-input"
                  min="0"
                  max="100"
                  step="0.001"
                  type="number"
                  value={form.taxRate}
                  onChange={(event) => updateForm('taxRate', event.target.value)}
                />
              </label>
              <label>
                Minimum stock level
                <input
                  className="shop-input"
                  min="0"
                  step="1"
                  type="number"
                  value={form.minimumStockLevel}
                  onChange={(event) => updateForm('minimumStockLevel', event.target.value)}
                />
              </label>
              <label>
                Reorder level
                <input
                  className="shop-input"
                  min="0"
                  step="1"
                  type="number"
                  value={form.reorderLevel}
                  onChange={(event) => updateForm('reorderLevel', event.target.value)}
                />
              </label>
              <label>
                Reorder quantity
                <input
                  className="shop-input"
                  min="0"
                  step="1"
                  type="number"
                  value={form.reorderQuantity}
                  onChange={(event) => updateForm('reorderQuantity', event.target.value)}
                />
              </label>
              <div className="shop-product-form-section">
                <h3>Storage and status</h3>
                <p>Help staff store and handle this product correctly.</p>
              </div>
              <label>
                Storage instructions
                <input
                  className="shop-input"
                  value={form.storageInstructions}
                  onChange={(event) => updateForm('storageInstructions', event.target.value)}
                />
              </label>
              <label>
                Status
                <select
                  className="shop-input"
                  value={form.status}
                  onChange={(event) => updateForm('status', event.target.value as ProductStatus)}
                >
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                  <option>DISCONTINUED</option>
                </select>
              </label>
              <label className="shop-product-file-field">
                Product image
                <input
                  accept="image/jpeg,image/png,image/webp"
                  type="file"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                />
                <small>
                  {imageFile ? `Selected: ${imageFile.name}` : 'Optional. JPG, PNG, or WebP image.'}
                </small>
              </label>
              <label className="shop-product-check">
                <input
                  checked={form.requiresColdChain}
                  onChange={(event) => updateForm('requiresColdChain', event.target.checked)}
                  type="checkbox"
                />{' '}
                Requires cold chain
              </label>
              <label className="shop-product-wide">
                Notes
                <textarea
                  className="shop-input"
                  rows={3}
                  value={form.notes}
                  onChange={(event) => updateForm('notes', event.target.value)}
                />
              </label>
            </div>
            {error && (
              <div className="shop-product-alert is-error shop-product-form-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => setFormOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving} type="submit">
                {saving ? 'Saving product…' : editingProduct ? 'Save changes' : 'Create product'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {categoryOpen && (
        <div
          className="shop-product-backdrop"
          role="presentation"
          onClick={() => setCategoryOpen(false)}
        >
          <section className="shop-product-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Categories & suppliers</h2>
              <button onClick={() => setCategoryOpen(false)} type="button" aria-label="Close">
                ×
              </button>
            </header>
            <form
              className="shop-product-inline-form"
              onSubmit={(event) => void addCategory(event)}
            >
              <input
                className="shop-input"
                required
                placeholder="Category name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
              <input
                className="shop-input"
                required
                placeholder="slug"
                value={categorySlug}
                onChange={(event) => setCategorySlug(event.target.value)}
              />
              <button className="shop-btn primary" disabled={saving} type="submit">
                Add category
              </button>
            </form>
            <ul className="shop-product-option-list">
              {categories.map((category) => (
                <li key={category.id}>
                  {category.name}
                  <code>{category.slug}</code>
                </li>
              ))}
            </ul>
            <h3>Suppliers</h3>
            <form
              className="shop-product-inline-form"
              onSubmit={(event) => void addSupplier(event)}
            >
              <input
                className="shop-input"
                required
                placeholder="Supplier name"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
              />
              <button className="shop-btn primary" disabled={saving} type="submit">
                Add supplier
              </button>
            </form>
            <ul className="shop-product-option-list">
              {suppliers.map((supplier) => (
                <li key={supplier.id}>{supplier.name}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {importOpen && (
        <div
          className="shop-product-backdrop"
          role="presentation"
          onClick={() => setImportOpen(false)}
        >
          <form
            className="shop-product-modal"
            onSubmit={(event) => void importProducts(event)}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Import products</h2>
              <button onClick={() => setImportOpen(false)} type="button" aria-label="Close">
                ×
              </button>
            </header>
            <p>
              Upload CSV or .xlsx with columns such as name, sku, sellingPrice, brandName,
              genericName, category, supplier, and prescriptionClass. Existing categories and
              suppliers are matched by name. Maximum 500 rows, 5 MB.
            </p>
            <label className="shop-product-file-field">
              CSV or Excel file
              <input
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                type="file"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <footer>
              <button
                className="shop-btn secondary"
                onClick={() => setImportOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving || !importFile} type="submit">
                {saving ? 'Importing...' : 'Import products'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {bulkOpen && (
        <div
          className="shop-product-backdrop"
          role="presentation"
          onClick={() => setBulkOpen(false)}
        >
          <form
            className="shop-product-modal"
            onSubmit={(event) => void bulkUpdate(event)}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Bulk update prices</h2>
              <button onClick={() => setBulkOpen(false)} type="button" aria-label="Close">
                ×
              </button>
            </header>
            <p>Update {selectedIds.length} selected products. Changes are audited.</p>
            <label>
              Update mode
              <select
                className="shop-input"
                value={bulkMode}
                onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)}
              >
                <option value="SET">Set selling price</option>
                <option value="INCREASE_PERCENT">Increase by percent</option>
                <option value="DECREASE_PERCENT">Decrease by percent</option>
              </select>
            </label>
            <label>
              {bulkMode === 'SET' ? 'New price' : 'Percent'}
              <input
                className="shop-input"
                required
                min="0"
                step="0.01"
                type="number"
                value={bulkValue}
                onChange={(event) => setBulkValue(event.target.value)}
              />
            </label>
            <footer>
              <button
                className="shop-btn secondary"
                onClick={() => setBulkOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving || !bulkValue} type="submit">
                Apply prices
              </button>
            </footer>
          </form>
        </div>
      )}

      {barcodeOpen && (
        <div
          className="shop-product-backdrop"
          role="presentation"
          onClick={() => setBarcodeOpen(false)}
        >
          <section
            className="shop-product-modal shop-barcode-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Barcode labels</h2>
              <button onClick={() => setBarcodeOpen(false)} type="button" aria-label="Close">
                ×
              </button>
            </header>
            <p>
              Code 39 labels use the product barcode when available, otherwise SKU. Use letters,
              digits, spaces, dash, period, $, /, +, and % for scannable output.
            </p>
            <div className="product-print-surface">
              {products
                .filter((product) => selectedIds.includes(product.id))
                .map((product) => {
                  const value = product.barcode || product.sku;
                  return (
                    <article className="product-barcode-label" key={product.id}>
                      <strong>{product.name}</strong>
                      <BarcodeSvg value={value} />
                      <code>{value}</code>
                    </article>
                  );
                })}
            </div>
            <footer>
              <button
                className="shop-btn secondary"
                onClick={() => setBarcodeOpen(false)}
                type="button"
              >
                Close
              </button>
              <button className="shop-btn primary" onClick={() => window.print()} type="button">
                Print labels
              </button>
            </footer>
          </section>
        </div>
      )}

      {(details || detailsLoading) && (
        <div
          className="shop-product-backdrop shop-product-details-backdrop"
          role="presentation"
          onClick={() => setDetails(null)}
        >
          <aside
            className="shop-product-drawer shop-product-details"
            onClick={(event) => event.stopPropagation()}
          >
            {detailsLoading || !details ? (
              <p>Loading product history...</p>
            ) : (
              <>
                <header>
                  <div>
                    <h2>{details.name}</h2>
                    <p>{details.brandName ?? details.genericName ?? 'Product details'}</p>
                  </div>
                  <button onClick={() => setDetails(null)} type="button" aria-label="Close">
                    ×
                  </button>
                </header>
                <div className="shop-product-detail-actions">
                  <button
                    className="shop-btn secondary"
                    onClick={() => openEditProduct(details)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="shop-btn secondary"
                    onClick={() => {
                      setSelectedIds([details.id]);
                      setDetails(null);
                      setBarcodeOpen(true);
                    }}
                    type="button"
                  >
                    Print barcode
                  </button>
                  <button
                    className="shop-btn danger"
                    disabled={saving || details.status === 'DISCONTINUED'}
                    onClick={() => void deactivateProduct(details)}
                    type="button"
                  >
                    Deactivate
                  </button>
                </div>
                <div className="shop-product-detail-main">
                  <ProductImage product={details} large />
                  <dl>
                    <dt>SKU / barcode</dt>
                    <dd>
                      {details.sku} / {details.barcode ?? '—'}
                    </dd>
                    <dt>Generic / strength / form</dt>
                    <dd>
                      {details.genericName ?? '—'} / {details.strength ?? '—'} /{' '}
                      {details.dosageForm ?? '—'}
                    </dd>
                    <dt>Category / supplier</dt>
                    <dd>
                      {details.category?.name ?? '—'} / {details.supplier?.name ?? '—'}
                    </dd>
                    <dt>Prescription / VAT</dt>
                    <dd>
                      {details.prescriptionClass} / {details.vatStatus}
                    </dd>
                    <dt>Price / cost</dt>
                    <dd>
                      {details.sellingPrice} / {details.costPrice}
                    </dd>
                    <dt>Cold-chain / storage</dt>
                    <dd>
                      {details.requiresColdChain ? 'Required' : 'Not required'} /{' '}
                      {details.storageInstructions ?? '—'}
                    </dd>
                  </dl>
                </div>
                <section className="shop-product-summary">
                  <div>
                    <span>Total stock</span>
                    <strong>{details.totalStock}</strong>
                  </div>
                  <div>
                    <span>Stock value</span>
                    <strong>{details.totalStockValue}</strong>
                  </div>
                  <div>
                    <span>Earliest expiry</span>
                    <strong>
                      {details.earliestExpiry
                        ? new Date(details.earliestExpiry).toLocaleDateString()
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span>Last purchase</span>
                    <strong>{details.lastPurchasePrice}</strong>
                  </div>
                  <div>
                    <span>Last sale</span>
                    <strong>{details.lastSalePrice}</strong>
                  </div>
                  <div>
                    <span>Margin</span>
                    <strong>
                      {details.profitMargin === null ? '—' : `${details.profitMargin}%`}
                    </strong>
                  </div>
                </section>
                <section className="shop-product-history">
                  <h3>Batches</h3>
                  <div className="shop-product-history-scroll">
                    <table className="shop-table">
                      <thead>
                        <tr>
                          <th>Batch</th>
                          <th>Expiry</th>
                          <th>Quantity</th>
                          <th>Cost</th>
                          <th>Supplier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.batches.map((batch) => (
                          <tr key={batch.id}>
                            <td>{batch.batchNumber}</td>
                            <td>{new Date(batch.expiryDate).toLocaleDateString()}</td>
                            <td>{batch.quantity}</td>
                            <td>{batch.costPrice}</td>
                            <td>{batch.supplierName ?? '—'}</td>
                          </tr>
                        ))}
                        {details.batches.length === 0 && (
                          <tr>
                            <td colSpan={5}>No batches recorded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="shop-product-history">
                  <h3>Sales history</h3>
                  <div className="shop-product-history-scroll">
                    <table className="shop-table">
                      <thead>
                        <tr>
                          <th>Sale</th>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Qty</th>
                          <th>Unit price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.salesHistory.map((sale) => (
                          <tr key={sale.id}>
                            <td>{sale.sale.saleNumber}</td>
                            <td>{new Date(sale.sale.createdAt).toLocaleDateString()}</td>
                            <td>{sale.sale.customerName ?? '—'}</td>
                            <td>{sale.quantity}</td>
                            <td>{sale.unitPrice}</td>
                            <td>{sale.lineTotal}</td>
                          </tr>
                        ))}
                        {details.salesHistory.length === 0 && (
                          <tr>
                            <td colSpan={6}>No sales recorded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="shop-product-history">
                  <h3>Purchase / receiving history</h3>
                  <div className="shop-product-history-scroll">
                    <table className="shop-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Batch</th>
                          <th>Quantity</th>
                          <th>Unit cost</th>
                          <th>Supplier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.purchaseHistory.map((movement) => (
                          <tr key={movement.id}>
                            <td>{new Date(movement.createdAt).toLocaleDateString()}</td>
                            <td>{movement.batch.batchNumber}</td>
                            <td>{movement.quantity}</td>
                            <td>{movement.batch.costPrice}</td>
                            <td>{movement.reason}</td>
                          </tr>
                        ))}
                        {details.purchaseHistory.length === 0 && (
                          <tr>
                            <td colSpan={5}>
                              No purchase orders are recorded. Received stock movements are shown
                              here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="shop-product-history">
                  <h3>Stock movement history</h3>
                  <div className="shop-product-history-scroll">
                    <table className="shop-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Quantity</th>
                          <th>Batch</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.stockMovementHistory.map((movement) => (
                          <tr key={movement.id}>
                            <td>{new Date(movement.createdAt).toLocaleString()}</td>
                            <td>{movement.type}</td>
                            <td>{movement.quantity}</td>
                            <td>{movement.batch.batchNumber}</td>
                            <td>{movement.reason}</td>
                          </tr>
                        ))}
                        {details.stockMovementHistory.length === 0 && (
                          <tr>
                            <td colSpan={5}>No stock movements.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
