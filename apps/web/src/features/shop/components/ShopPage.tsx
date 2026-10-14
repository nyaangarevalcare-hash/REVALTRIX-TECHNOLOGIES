import { useEffect, useState } from 'react';
import { authenticatedApiRequest } from '../../../lib/auth-api.js';

interface ShopSettings {
  storeName: string;
  acceptingOrders: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFee: string;
  minimumOrderValue: string;
  currency: string;
}

interface ShopCategory {
  id: string;
  name: string;
  slug: string;
}

interface ShopProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  stockQuantity: number;
  reservedStock: number;
  visibility: 'ONLINE' | 'IN_STORE_ONLY' | 'HIDDEN' | 'DISCONTINUED';
  category: ShopCategory | null;
}

interface ShopOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: string;
  currency: string;
  deliveryMethod: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ productName: string; quantity: number }>;
}

const EMPTY_SETTINGS: ShopSettings = {
  storeName: '',
  acceptingOrders: false,
  deliveryEnabled: false,
  pickupEnabled: true,
  deliveryFee: '0',
  minimumOrderValue: '0',
  currency: 'KES',
};

const ORDER_NEXT: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The shop request failed.';
}

export function ShopPage() {
  const [settings, setSettings] = useState<ShopSettings>(EMPTY_SETTINGS);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [product, setProduct] = useState({
    name: '',
    sku: '',
    price: '',
    stockQuantity: '0',
    categoryId: '',
    imageUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(): Promise<void> {
    setError(null);
    try {
      const [settingsResult, categoriesResult, productsResult, ordersResult] = await Promise.all([
        authenticatedApiRequest<ShopSettings | null>('/v1/shop/settings'),
        authenticatedApiRequest<ShopCategory[]>('/v1/shop/categories'),
        authenticatedApiRequest<ShopProduct[]>('/v1/shop/products'),
        authenticatedApiRequest<ShopOrder[]>('/v1/shop/orders'),
      ]);
      setSettings(settingsResult ?? EMPTY_SETTINGS);
      setCategories(categoriesResult);
      setProducts(productsResult);
      setOrders(ordersResult);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
    successMessage: string,
  ): Promise<boolean> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await authenticatedApiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setNotice(successMessage);
      await load();
      return true;
    } catch (requestError) {
      setError(errorText(requestError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="shop-page">
        <p>Loading shop...</p>
      </main>
    );
  }

  return (
    <main className="shop-page">
      <header className="shop-page-heading">
        <div>
          <p className="dashboard-eyebrow">COMMERCE</p>
          <h1>Shop & Inventory</h1>
          <p>Manage your product catalogue, stock, store availability and orders.</p>
        </div>
        <span className={`shop-status ${settings.acceptingOrders ? 'is-open' : ''}`}>
          {settings.acceptingOrders ? 'Accepting orders' : 'Orders paused'}
        </span>
      </header>

      {error && (
        <div className="shop-alert is-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="shop-alert is-success" role="status">
          {notice}
        </div>
      )}

      <section className="shop-panel">
        <h2>Store settings</h2>
        <form
          className="shop-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(
              '/v1/shop/settings',
              'PATCH',
              {
                ...settings,
                deliveryFee: Number(settings.deliveryFee),
                minimumOrderValue: Number(settings.minimumOrderValue),
              },
              'Store settings saved.',
            );
          }}
        >
          <label>
            Store name
            <input
              required
              maxLength={200}
              value={settings.storeName}
              onChange={(event) => setSettings({ ...settings, storeName: event.target.value })}
            />
          </label>
          <label>
            Currency
            <input
              required
              minLength={3}
              maxLength={3}
              value={settings.currency}
              onChange={(event) =>
                setSettings({ ...settings, currency: event.target.value.toUpperCase() })
              }
            />
          </label>
          <label>
            Delivery fee
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.deliveryFee}
              onChange={(event) => setSettings({ ...settings, deliveryFee: event.target.value })}
            />
          </label>
          <label>
            Minimum order
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.minimumOrderValue}
              onChange={(event) =>
                setSettings({ ...settings, minimumOrderValue: event.target.value })
              }
            />
          </label>
          <label className="shop-checkbox">
            <input
              type="checkbox"
              checked={settings.acceptingOrders}
              onChange={(event) =>
                setSettings({ ...settings, acceptingOrders: event.target.checked })
              }
            />
            Accept orders
          </label>
          <label className="shop-checkbox">
            <input
              type="checkbox"
              checked={settings.deliveryEnabled}
              onChange={(event) =>
                setSettings({ ...settings, deliveryEnabled: event.target.checked })
              }
            />
            Delivery
          </label>
          <label className="shop-checkbox">
            <input
              type="checkbox"
              checked={settings.pickupEnabled}
              onChange={(event) =>
                setSettings({ ...settings, pickupEnabled: event.target.checked })
              }
            />
            Pickup
          </label>
          <button className="shop-button is-primary" disabled={saving} type="submit">
            {saving ? 'Saving...' : 'Save store settings'}
          </button>
        </form>
      </section>

      <div className="shop-columns">
        <section className="shop-panel">
          <h2>Categories</h2>
          <form
            className="shop-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                '/v1/shop/categories',
                'POST',
                {
                  name: categoryName,
                  slug: categorySlug,
                },
                'Category created.',
              ).then((saved) => {
                if (saved) {
                  setCategoryName('');
                  setCategorySlug('');
                }
              });
            }}
          >
            <input
              aria-label="Category name"
              placeholder="Category name"
              required
              maxLength={120}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <input
              aria-label="Category URL slug"
              placeholder="url-slug"
              required
              maxLength={140}
              pattern="[a-zA-Z0-9-]+"
              value={categorySlug}
              onChange={(event) => setCategorySlug(event.target.value)}
            />
            <button className="shop-button is-secondary" disabled={saving} type="submit">
              Add category
            </button>
          </form>
          {categories.length === 0 ? (
            <p className="shop-empty">No categories yet.</p>
          ) : (
            <ul className="shop-category-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <span>{category.name}</span>
                  <code>{category.slug}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="shop-panel">
          <h2>Add a product</h2>
          <form
            className="shop-product-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                '/v1/shop/products',
                'POST',
                {
                  name: product.name,
                  sku: product.sku,
                  price: Number(product.price),
                  stockQuantity: Number(product.stockQuantity),
                  categoryId: product.categoryId || undefined,
                  images: product.imageUrl ? [product.imageUrl] : [],
                  visibility: 'ONLINE',
                },
                'Product added to the catalogue.',
              ).then((saved) => {
                if (saved) {
                  setProduct({
                    name: '',
                    sku: '',
                    price: '',
                    stockQuantity: '0',
                    categoryId: '',
                    imageUrl: '',
                  });
                }
              });
            }}
          >
            <input
              aria-label="Product name"
              placeholder="Product name"
              required
              maxLength={200}
              value={product.name}
              onChange={(event) => setProduct({ ...product, name: event.target.value })}
            />
            <input
              aria-label="SKU"
              placeholder="SKU"
              required
              maxLength={100}
              value={product.sku}
              onChange={(event) => setProduct({ ...product, sku: event.target.value })}
            />
            <input
              aria-label="Price"
              placeholder="Price"
              type="number"
              min="0"
              step="0.01"
              required
              value={product.price}
              onChange={(event) => setProduct({ ...product, price: event.target.value })}
            />
            <input
              aria-label="Stock quantity"
              placeholder="Stock quantity"
              type="number"
              min="0"
              step="1"
              required
              value={product.stockQuantity}
              onChange={(event) => setProduct({ ...product, stockQuantity: event.target.value })}
            />
            <select
              aria-label="Product category"
              value={product.categoryId}
              onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Secure HTTPS product image URL"
              placeholder="Image URL (HTTPS)"
              type="url"
              pattern="https://.*"
              value={product.imageUrl}
              onChange={(event) => setProduct({ ...product, imageUrl: event.target.value })}
            />
            <button className="shop-button is-primary" disabled={saving} type="submit">
              Add product
            </button>
          </form>
        </section>
      </div>

      <section className="shop-panel">
        <h2>
          Product inventory <span className="shop-count">{products.length}</span>
        </h2>
        <div className="shop-table-wrap">
          <table className="shop-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Available</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.sku}</td>
                  <td>{item.category?.name ?? '—'}</td>
                  <td>{item.price}</td>
                  <td>
                    {item.stockQuantity - item.reservedStock} / {item.stockQuantity}
                  </td>
                  <td>
                    <span className={`shop-product-status status-${item.visibility.toLowerCase()}`}>
                      {item.visibility.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {item.visibility === 'ONLINE' ? (
                      <button
                        className="shop-button is-muted"
                        disabled={saving}
                        onClick={() =>
                          void submit(
                            `/v1/shop/products/${item.id}`,
                            'PATCH',
                            { visibility: 'HIDDEN' },
                            'Product hidden.',
                          )
                        }
                        type="button"
                      >
                        Hide
                      </button>
                    ) : item.visibility !== 'DISCONTINUED' ? (
                      <button
                        className="shop-button is-secondary"
                        disabled={saving}
                        onClick={() =>
                          void submit(
                            `/v1/shop/products/${item.id}`,
                            'PATCH',
                            { visibility: 'ONLINE' },
                            'Product listed online.',
                          )
                        }
                        type="button"
                      >
                        List online
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td className="shop-empty" colSpan={7}>
                    Add a product to start managing your inventory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="shop-panel">
        <h2>
          Orders <span className="shop-count">{orders.length}</span>
        </h2>
        <div className="shop-table-wrap">
          <table className="shop-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <small>{order.deliveryMethod.toLowerCase()}</small>
                  </td>
                  <td>
                    {order.customerName}
                    <small>{order.customerPhone}</small>
                  </td>
                  <td>
                    {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}
                  </td>
                  <td>
                    {order.currency} {order.total}
                  </td>
                  <td>
                    <span className="shop-product-status">{order.paymentStatus}</span>
                  </td>
                  <td>
                    <span className={`shop-product-status status-${order.status.toLowerCase()}`}>
                      {order.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {(ORDER_NEXT[order.status] ?? []).map((nextStatus) => (
                      <button
                        className={`shop-button ${nextStatus === 'CANCELLED' ? 'is-danger' : 'is-secondary'}`}
                        disabled={saving}
                        key={nextStatus}
                        onClick={() =>
                          void submit(
                            `/v1/shop/orders/${order.id}/status`,
                            'PATCH',
                            { status: nextStatus },
                            `Order ${order.orderNumber} updated.`,
                          )
                        }
                        type="button"
                      >
                        {nextStatus.replaceAll('_', ' ')}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td className="shop-empty" colSpan={7}>
                    No shop orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
