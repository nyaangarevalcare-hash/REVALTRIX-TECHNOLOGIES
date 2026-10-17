import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { authenticatedApiDownload, authenticatedApiRequest } from '../../../lib/auth-api.js';
import './ShopPurchasesPage.css';

interface Supplier {
  id: string;
  name: string;
  outstandingBalance?: string | null;
  outstandingBalanceCurrency?: string | null;
  outstandingBalances?: Array<{ currency: string; amount: string }>;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface PurchaseLine {
  id?: string;
  productId: string;
  productName?: string;
  sku?: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityReturned?: number;
  quantityRejected?: number;
  unitCost: string | number;
  taxRate?: string | number;
  totalCost?: string | number;
}

interface PurchasePayment {
  id: string;
  amount: string | number;
  method: string;
  reference: string | null;
  paidAt: string;
}

interface ReceivedLine {
  id: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: number;
  quantityRejected: number;
  unitCost: string | number;
  sellingPrice: string | number;
  shelfLocation: string | null;
}

interface GoodsReceivedNote {
  id: string;
  grnNumber: string;
  receivedDate: string;
  receivedBy: string | null;
  invoiceReference: string | null;
  notes: string | null;
  items: ReceivedLine[];
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: Supplier;
  orderDate: string;
  expectedDeliveryDate: string | null;
  status: string;
  subtotal: string | number;
  tax: string | number;
  transportCost: string | number;
  total: string | number;
  amountPaid: string | number;
  balance: string | number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt?: string | null;
  items: PurchaseLine[];
  payments?: PurchasePayment[];
  goodsReceivedNotes?: GoodsReceivedNote[];
  invoiceUrl?: string | null;
  auditHistory?: Array<{
    id: string;
    action: string;
    outcome: string;
    metadata: unknown;
    createdAt: string;
    actorUser: { displayName: string } | null;
  }>;
  createdAt?: string;
}

interface PurchaseListResponse {
  items: ApiPurchase[];
  total?: number;
}

interface ApiPurchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplier: Supplier;
  createdAt: string;
  expectedAt: string | null;
  status: string;
  subtotal: string | number;
  taxTotal: string | number;
  transportCost: string | number;
  total: string | number;
  amountPaid: string | number;
  balance: string | number;
  createdBy?: { displayName: string } | null;
  approvedBy?: { displayName: string } | null;
  approvedAt?: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    receivedQuantity: number;
    rejectedQuantity: number;
    returnedQuantity: number;
    unitCost: string | number;
    taxRate: string | number;
    lineTotal: string | number;
  }>;
  payments: PurchasePayment[];
  receipts: Array<{
    id: string;
    receiptNumber: string;
    receivedAt: string;
    receivedBy: { displayName: string } | null;
    notes: string | null;
    invoiceReference: string | null;
    items: Array<{
      id: string;
      quantity: number;
      quantityRejected: number;
      unitCost: string | number;
      sellingPrice: string | number | null;
      shelfLocation: string | null;
      purchaseItem: { id: string; productName: string };
      batch: { batchNumber: string; expiryDate: string; costPrice: string | number } | null;
    }>;
  }>;
  auditHistory?: NonNullable<PurchaseOrder['auditHistory']>;
  invoiceUrl?: string | null;
}

interface PurchaseDraftLine {
  productId: string;
  quantityOrdered: string;
  unitCost: string;
  taxRate: string;
}

interface ReceiveDraftLine {
  purchaseOrderItemId: string;
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: string;
  quantityRejected: string;
  unitCost: string;
  sellingPrice: string;
  batchNumber: string;
  expiryDate: string;
  shelfLocation: string;
}

interface ReturnDraftLine {
  goodsReceivedNoteItemId: string;
  productName: string;
  batchNumber: string;
  quantityAvailable: number;
  quantityReturned: string;
}

const money = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '—';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The purchase request failed.';
}

function adaptPurchase(purchase: ApiPurchase): PurchaseOrder {
  return {
    id: purchase.id,
    poNumber: purchase.purchaseNumber,
    supplierId: purchase.supplierId,
    supplier: purchase.supplier,
    orderDate: purchase.createdAt,
    expectedDeliveryDate: purchase.expectedAt,
    status: purchase.status === 'RECEIVED' ? 'FULLY_RECEIVED' : purchase.status,
    subtotal: purchase.subtotal,
    tax: purchase.taxTotal,
    transportCost: purchase.transportCost,
    total: purchase.total,
    amountPaid: purchase.amountPaid,
    balance: purchase.balance,
    createdBy: purchase.createdBy?.displayName ?? null,
    approvedBy: purchase.approvedBy?.displayName ?? null,
    approvedAt: purchase.approvedAt ?? null,
    items: purchase.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantityOrdered: item.quantity,
      quantityReceived: item.receivedQuantity,
      quantityRejected: item.rejectedQuantity,
      quantityReturned: item.returnedQuantity,
      unitCost: item.unitCost,
      taxRate: item.taxRate,
      totalCost: item.lineTotal,
    })),
    payments: purchase.payments,
    goodsReceivedNotes: purchase.receipts.map((receipt) => ({
      id: receipt.id,
      grnNumber: receipt.receiptNumber,
      receivedDate: receipt.receivedAt,
      receivedBy: receipt.receivedBy?.displayName ?? null,
      invoiceReference: receipt.invoiceReference,
      notes: receipt.notes,
      items: receipt.items.map((item) => ({
        id: item.purchaseItem.id,
        productName: item.purchaseItem.productName,
        batchNumber: item.batch?.batchNumber ?? 'Rejected',
        expiryDate: item.batch?.expiryDate ?? '',
        quantityReceived: item.quantity,
        quantityRejected: item.quantityRejected,
        unitCost: item.unitCost,
        sellingPrice: item.sellingPrice ?? 0,
        shelfLocation: item.shelfLocation,
      })),
    })),
    invoiceUrl: purchase.invoiceUrl,
    createdAt: purchase.createdAt,
    auditHistory: purchase.auditHistory,
  };
}

export function ShopPurchasesPage({
  onViewInventory,
  initialSupplierId = '',
}: {
  onViewInventory: (purchaseId: string) => void;
  initialSupplierId?: string;
}) {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewFilter, setViewFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [transportCost, setTransportCost] = useState('0');
  const [orderLines, setOrderLines] = useState<PurchaseDraftLine[]>([
    { productId: '', quantityOrdered: '1', unitCost: '', taxRate: '0' },
  ]);
  const [receiveLines, setReceiveLines] = useState<ReceiveDraftLine[]>([]);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnDraftLine[]>([]);
  const [returnReason, setReturnReason] = useState('');

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedApiRequest<PurchaseListResponse>('/v1/shop/purchases');
      setPurchases(response.items.map(adaptPurchase));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      authenticatedApiRequest<Supplier[]>('/v1/shop/suppliers'),
      authenticatedApiRequest<{ items: Product[] }>('/v1/shop/products?page=1&pageSize=100'),
    ])
      .then(([supplierList, productResponse]) => {
        setSuppliers(supplierList);
        setProducts(productResponse.items);
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, []);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const filteredPurchases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (statusFilter !== 'ALL' && purchase.status !== statusFilter) return false;
      if (viewFilter === 'UNPAID' && Number(purchase.balance) <= 0) return false;
      if (viewFilter === 'PENDING' && !['SENT', 'DRAFT'].includes(purchase.status)) return false;
      if (viewFilter === 'RECEIVABLE' && !['SENT', 'PARTIALLY_RECEIVED'].includes(purchase.status))
        return false;
      if (viewFilter === 'PARTIAL' && purchase.status !== 'PARTIALLY_RECEIVED') return false;
      if (viewFilter === 'RETURNS' && !['RETURNED', 'PARTIALLY_RETURNED'].includes(purchase.status))
        return false;
      return (
        !needle ||
        purchase.poNumber.toLowerCase().includes(needle) ||
        purchase.supplier.name.toLowerCase().includes(needle)
      );
    });
  }, [purchases, query, statusFilter, viewFilter]);

  function openNewOrder() {
    setError(null);
    setEditingId(null);
    setSupplierId(initialSupplierId);
    setExpectedDeliveryDate('');
    setTransportCost('0');
    setOrderLines([{ productId: '', quantityOrdered: '1', unitCost: '', taxRate: '0' }]);
    setOrderOpen(true);
  }

  function openEditOrder(purchase: PurchaseOrder) {
    setError(null);
    setEditingId(purchase.id);
    setSupplierId(purchase.supplierId);
    setExpectedDeliveryDate(purchase.expectedDeliveryDate?.slice(0, 10) ?? '');
    setTransportCost(String(purchase.transportCost));
    setOrderLines(
      purchase.items.map((item) => ({
        productId: item.productId,
        quantityOrdered: String(item.quantityOrdered),
        unitCost: String(item.unitCost),
        taxRate: String(item.taxRate ?? 0),
      })),
    );
    setOrderOpen(true);
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      supplierId,
      expectedAt: expectedDeliveryDate || null,
      transportCost: Number(transportCost || 0),
      items: orderLines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantityOrdered),
        unitCost: Number(line.unitCost),
        taxRate: Number(line.taxRate || 0),
      })),
    };
    try {
      const response = await authenticatedApiRequest<ApiPurchase>(
        editingId ? `/v1/shop/purchases/${editingId}` : '/v1/shop/purchases',
        { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      const saved = adaptPurchase(response);
      setOrderOpen(false);
      setSelected(saved);
      setNotice(editingId ? 'Purchase order updated.' : 'Purchase order created.');
      await loadPurchases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function openPurchase(purchaseId: string) {
    setError(null);
    try {
      const response = await authenticatedApiRequest<ApiPurchase>(
        `/v1/shop/purchases/${purchaseId}`,
      );
      setSelected(adaptPurchase(response));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function runAction(path: string, success: string, body?: unknown): Promise<boolean> {
    if (!selected) return false;
    setSaving(true);
    setError(null);
    try {
      const endpoint = path === 'payment' ? 'payments' : path;
      await authenticatedApiRequest(`/v1/shop/purchases/${selected.id}/${endpoint}`, {
        method: 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      setNotice(success);
      await openPurchase(selected.id);
      await loadPurchases();
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openReceiving(purchase: PurchaseOrder) {
    setSelected(purchase);
    setError(null);
    setReceiveLines(
      purchase.items
        .filter(
          (item) => item.quantityOrdered > item.quantityReceived + (item.quantityRejected ?? 0),
        )
        .map((item) => ({
          purchaseOrderItemId: item.id ?? '',
          productId: item.productId,
          productName:
            item.productName ?? products.find((p) => p.id === item.productId)?.name ?? '',
          quantityOrdered:
            item.quantityOrdered - item.quantityReceived - (item.quantityRejected ?? 0),
          quantityReceived: String(
            item.quantityOrdered - item.quantityReceived - (item.quantityRejected ?? 0),
          ),
          quantityRejected: '0',
          unitCost: String(item.unitCost),
          sellingPrice: '',
          batchNumber: '',
          expiryDate: '',
          shelfLocation: '',
        })),
    );
    setInvoiceReference('');
    setReceiveNotes('');
    setReceiveOpen(true);
  }

  function openReturn(purchase: PurchaseOrder) {
    const lines = purchase.items
      .filter((item) => item.quantityReceived > (item.quantityReturned ?? 0))
      .map((item) => ({
        goodsReceivedNoteItemId: item.id ?? '',
        productName: item.productName ?? item.productId,
        batchNumber: 'received batches',
        quantityAvailable: item.quantityReceived - (item.quantityReturned ?? 0),
        quantityReturned: '0',
      }));
    if (lines.length === 0) {
      setError('There are no received items available to return.');
      return;
    }
    setReturnLines(lines);
    setReturnReason('');
    setError(null);
    setReturnOpen(true);
  }

  async function returnItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const items = returnLines
      .filter((line) => Number(line.quantityReturned) > 0)
      .map((line) => ({
        purchaseItemId: line.goodsReceivedNoteItemId,
        quantity: Number(line.quantityReturned),
      }));
    if (items.length === 0) {
      setError('Enter a return quantity for at least one received item.');
      return;
    }
    await runAction('return', 'Supplier return recorded.', {
      reason: returnReason,
      items,
    });
    setReturnOpen(false);
  }

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      if (
        receiveLines.some(
          (line) =>
            Number(line.quantityReceived) + Number(line.quantityRejected) > line.quantityOrdered,
        )
      ) {
        throw new Error(
          'Accepted plus rejected quantities cannot exceed the outstanding quantity.',
        );
      }
      await authenticatedApiRequest(`/v1/shop/purchases/${selected.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          invoiceReference: invoiceReference || undefined,
          notes: receiveNotes || undefined,
          items: receiveLines
            .filter((line) => Number(line.quantityReceived) + Number(line.quantityRejected) > 0)
            .map((line) => ({
              purchaseItemId: line.purchaseOrderItemId,
              quantity: Number(line.quantityReceived),
              quantityRejected: Number(line.quantityRejected),
              ...(Number(line.quantityReceived) > 0 && {
                batchNumber: line.batchNumber,
                expiryDate: line.expiryDate,
              }),
              ...(line.unitCost && { unitCost: Number(line.unitCost) }),
              ...(line.sellingPrice && { sellingPrice: Number(line.sellingPrice) }),
              ...(line.shelfLocation && { shelfLocation: line.shelfLocation }),
            })),
        }),
      });
      setReceiveOpen(false);
      setNotice('Stock received and batch records created.');
      await openPurchase(selected.id);
      await loadPurchases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await runAction('payments', 'Payment recorded.', {
      amount: Number(paymentAmount),
      method: paymentMethod,
      reference: paymentReference || null,
    });
    if (saved) {
      setPaymentOpen(false);
      setPaymentAmount('');
      setPaymentReference('');
    }
  }

  async function uploadInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !invoiceFile) {
      setError('Choose an invoice file to upload.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', invoiceFile);
      await authenticatedApiRequest(`/v1/shop/purchases/${selected.id}/invoice`, {
        method: 'POST',
        body: form,
      });
      setInvoiceOpen(false);
      setInvoiceFile(null);
      setNotice('Supplier invoice uploaded.');
      await openPurchase(selected.id);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function exportPurchases() {
    setSaving(true);
    setError(null);
    try {
      const blob = await authenticatedApiDownload('/v1/shop/purchases/export');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'purchases.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function downloadInvoice(purchaseId: string) {
    setSaving(true);
    setError(null);
    try {
      const blob = await authenticatedApiDownload(`/v1/shop/purchases/${purchaseId}/invoice`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `purchase-invoice-${purchaseId}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  const totalDraft = orderLines.reduce(
    (sum, line) =>
      sum +
      Number(line.quantityOrdered || 0) *
        Number(line.unitCost || 0) *
        (1 + Number(line.taxRate || 0) / 100),
    0,
  );

  return (
    <section className="shop-purchases">
      <header className="shop-purchase-toolbar">
        <div>
          <h2>Purchases</h2>
          <p>Purchase orders, supplier deliveries, invoices, and payments.</p>
        </div>
        <div className="shop-purchase-actions">
          <button className="shop-btn primary" onClick={openNewOrder} type="button">
            New Purchase Order
          </button>
          <button
            className="shop-btn secondary"
            onClick={() => {
              setStatusFilter('ALL');
              setViewFilter('RECEIVABLE');
              setNotice('Choose Receive on the purchase order you are accepting.');
              setError(null);
            }}
            type="button"
          >
            Receive Stock
          </button>
          <button
            className="shop-btn secondary"
            onClick={() => void exportPurchases()}
            type="button"
          >
            Export Purchases
          </button>
        </div>
      </header>
      {error && (
        <div className="shop-purchase-alert is-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="shop-purchase-alert" role="status">
          {notice}
        </div>
      )}
      <div className="shop-purchase-quick-filters">
        {[
          ['ALL', 'All purchases'],
          ['PENDING', 'Pending delivery'],
          ['PARTIAL', 'Partially received'],
          ['UNPAID', 'Unpaid purchases'],
          ['RETURNS', 'Supplier returns'],
        ].map(([value, label]) => (
          <button
            aria-pressed={viewFilter === value}
            className={viewFilter === value ? 'is-selected' : ''}
            key={value}
            onClick={() => setViewFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="shop-purchase-filters">
        <input
          aria-label="Search purchase orders"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search PO number or supplier"
          value={query}
        />
        <select
          aria-label="Filter purchase order status"
          onChange={(event) => setStatusFilter(event.target.value)}
          value={statusFilter}
        >
          <option value="ALL">All statuses</option>
          {[
            'DRAFT',
            'SENT',
            'PARTIALLY_RECEIVED',
            'FULLY_RECEIVED',
            'PARTIALLY_RETURNED',
            'RETURNED',
            'CANCELLED',
          ].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      <div className="shop-purchase-table-wrap">
        <table className="shop-purchase-table">
          <thead>
            <tr>
              <th>PO number</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Expected delivery</th>
              <th>Items</th>
              <th>Total cost</th>
              <th>Amount paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Received by</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map((purchase) => (
              <tr key={purchase.id} onClick={() => void openPurchase(purchase.id)}>
                <td>
                  <button className="shop-purchase-link" type="button">
                    {purchase.poNumber}
                  </button>
                </td>
                <td>{purchase.supplier.name}</td>
                <td>{date(purchase.orderDate)}</td>
                <td>{date(purchase.expectedDeliveryDate)}</td>
                <td>{purchase.items.length}</td>
                <td>{money(purchase.total)}</td>
                <td>{money(purchase.amountPaid)}</td>
                <td>{money(purchase.balance)}</td>
                <td>
                  <span className={`shop-purchase-status status-${purchase.status.toLowerCase()}`}>
                    {purchase.status.replaceAll('_', ' ')}
                  </span>
                </td>
                <td>{purchase.goodsReceivedNotes?.[0]?.receivedBy ?? '—'}</td>
                <td className="shop-purchase-row-actions">
                  <button
                    className="shop-btn secondary shop-purchase-small"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReceiving(purchase);
                    }}
                    type="button"
                    disabled={!['SENT', 'PARTIALLY_RECEIVED'].includes(purchase.status)}
                  >
                    Receive
                  </button>
                  <button
                    className="shop-btn secondary shop-purchase-small"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openPurchase(purchase.id);
                    }}
                    type="button"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filteredPurchases.length === 0 && (
              <tr>
                <td colSpan={11} className="shop-purchase-empty">
                  No purchase orders match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={11} className="shop-purchase-empty">
                  Loading purchases…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && !receiveOpen && !returnOpen && !paymentOpen && !invoiceOpen && (
        <div
          className="shop-purchase-backdrop"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <section
            className="shop-purchase-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-purchase-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shop-purchase-panel-header">
              <div>
                <h2 id="shop-purchase-detail-title">{selected.poNumber}</h2>
                <p>
                  {selected.supplier.name} · {selected.status.replaceAll('_', ' ')}
                </p>
              </div>
              <button
                aria-label="Close purchase details"
                onClick={() => setSelected(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="shop-purchase-detail-actions">
              {selected.status === 'DRAFT' && (
                <>
                  <button
                    className="shop-btn secondary"
                    onClick={() => openEditOrder(selected)}
                    type="button"
                  >
                    Edit PO
                  </button>
                  <button
                    className="shop-btn primary"
                    disabled={saving}
                    onClick={() => void runAction('send', 'Purchase order sent to supplier.')}
                    type="button"
                  >
                    Send to Supplier
                  </button>
                </>
              )}
              {['SENT', 'PARTIALLY_RECEIVED'].includes(selected.status) && (
                <button
                  className="shop-btn primary"
                  onClick={() => openReceiving(selected)}
                  type="button"
                >
                  Receive Items
                </button>
              )}
              <button
                className="shop-btn secondary"
                onClick={() => {
                  setInvoiceReference('');
                  setInvoiceOpen(true);
                }}
                type="button"
              >
                Upload Invoice
              </button>
              {Number(selected.balance) > 0 && (
                <button
                  className="shop-btn secondary"
                  onClick={() => {
                    setPaymentAmount(String(selected.balance));
                    setPaymentOpen(true);
                  }}
                  type="button"
                >
                  Record Payment
                </button>
              )}
              {['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'].includes(selected.status) && (
                <button
                  className="shop-btn danger"
                  disabled={saving}
                  onClick={() => {
                    if (window.confirm('Cancel this purchase order?'))
                      void runAction('cancel', 'Purchase order cancelled.');
                  }}
                  type="button"
                >
                  Cancel PO
                </button>
              )}
              {selected.goodsReceivedNotes?.some((note) => note.items.length > 0) && (
                <button
                  className="shop-btn danger"
                  onClick={() => openReturn(selected)}
                  type="button"
                >
                  Return Items
                </button>
              )}
              <button
                className="shop-btn secondary"
                onClick={() => onViewInventory(selected.id)}
                type="button"
              >
                View Stock Received
              </button>
              <button className="shop-btn secondary" onClick={() => window.print()} type="button">
                Print PO
              </button>
            </div>
            <dl className="shop-purchase-summary">
              <div>
                <dt>Order date</dt>
                <dd>{date(selected.orderDate)}</dd>
              </div>
              <div>
                <dt>Expected delivery</dt>
                <dd>{date(selected.expectedDeliveryDate)}</dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(selected.subtotal)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(selected.tax)}</dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>{money(selected.transportCost)}</dd>
              </div>
              <div>
                <dt>Total / Balance</dt>
                <dd>
                  {money(selected.total)} / {money(selected.balance)}
                </dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{selected.createdBy ?? '—'}</dd>
              </div>
              <div>
                <dt>Approved by</dt>
                <dd>
                  {selected.approvedBy ?? 'Pending'}
                  {selected.approvedAt ? ` · ${date(selected.approvedAt)}` : ''}
                </dd>
              </div>
              {selected.supplier.outstandingBalances?.map((balance) => (
                <div key={balance.currency}>
                  <dt>Supplier balance ({balance.currency})</dt>
                  <dd>{money(balance.amount)}</dd>
                </div>
              ))}
              {selected.supplier.outstandingBalance !== undefined &&
                !selected.supplier.outstandingBalances?.length && (
                  <div>
                    <dt>
                      Supplier balance
                      {selected.supplier.outstandingBalanceCurrency
                        ? ` (${selected.supplier.outstandingBalanceCurrency})`
                        : ''}
                    </dt>
                    <dd>
                      {selected.supplier.outstandingBalance === null
                        ? 'Multiple currencies'
                        : money(selected.supplier.outstandingBalance)}
                    </dd>
                  </div>
                )}
            </dl>
            <h3>Approval and audit history</h3>
            <div className="shop-purchase-table-wrap">
              <table className="shop-purchase-table compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>By</th>
                    <th>Outcome</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.auditHistory?.map((entry) => (
                    <tr key={entry.id}>
                      <td>{date(entry.createdAt)}</td>
                      <td>{entry.action.replaceAll('_', ' ')}</td>
                      <td>{entry.actorUser?.displayName ?? 'System'}</td>
                      <td>{entry.outcome}</td>
                      <td>{entry.metadata ? JSON.stringify(entry.metadata) : '—'}</td>
                    </tr>
                  ))}
                  {!selected.auditHistory?.length && (
                    <tr>
                      <td colSpan={5}>No audit entries available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <h3>Items</h3>
            <div className="shop-purchase-table-wrap">
              <table className="shop-purchase-table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Rejected</th>
                    <th>Unit cost</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item, index) => (
                    <tr key={item.id ?? `${item.productId}-${index}`}>
                      <td>
                        {item.productName ??
                          products.find((p) => p.id === item.productId)?.name ??
                          item.productId}
                      </td>
                      <td>
                        {item.sku ?? products.find((p) => p.id === item.productId)?.sku ?? '—'}
                      </td>
                      <td>{item.quantityOrdered}</td>
                      <td>{item.quantityReceived}</td>
                      <td>{item.quantityRejected ?? 0}</td>
                      <td>{money(item.unitCost)}</td>
                      <td>
                        {money(item.totalCost ?? Number(item.unitCost) * item.quantityOrdered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Payments</h3>
            <div className="shop-purchase-table-wrap">
              <table className="shop-purchase-table compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.payments?.map((payment) => (
                    <tr key={payment.id}>
                      <td>{date(payment.paidAt)}</td>
                      <td>{payment.method}</td>
                      <td>{payment.reference ?? '—'}</td>
                      <td>{money(payment.amount)}</td>
                    </tr>
                  )) ?? (
                    <tr>
                      <td colSpan={4}>No payments recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <h3>Goods received notes / batches</h3>
            {selected.goodsReceivedNotes?.length ? (
              selected.goodsReceivedNotes.map((grn) => (
                <section className="shop-purchase-grn" key={grn.id}>
                  <strong>
                    {grn.grnNumber} · {date(grn.receivedDate)}
                  </strong>
                  <span>
                    Received by {grn.receivedBy ?? '—'} · Invoice {grn.invoiceReference ?? '—'}
                  </span>
                  <div className="shop-purchase-table-wrap">
                    <table className="shop-purchase-table compact">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch</th>
                          <th>Expiry</th>
                          <th>Received</th>
                          <th>Rejected</th>
                          <th>Unit cost</th>
                          <th>Shelf</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grn.items.map((line) => (
                          <tr key={line.id}>
                            <td>{line.productName}</td>
                            <td>{line.batchNumber}</td>
                            <td>{date(line.expiryDate)}</td>
                            <td>{line.quantityReceived}</td>
                            <td>{line.quantityRejected}</td>
                            <td>{money(line.unitCost)}</td>
                            <td>{line.shelfLocation ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))
            ) : (
              <p className="shop-purchase-empty">No goods received notes yet.</p>
            )}
            <h3>Invoices</h3>
            {selected.invoiceUrl ? (
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => void downloadInvoice(selected.id)}
                type="button"
              >
                View supplier invoice
              </button>
            ) : (
              <p className="shop-purchase-empty">No invoice uploaded.</p>
            )}
          </section>
        </div>
      )}

      {orderOpen && (
        <div className="shop-purchase-backdrop shop-purchase-modal-backdrop">
          <form className="shop-purchase-modal" onSubmit={(event) => void saveOrder(event)}>
            <header>
              <h2>{editingId ? 'Edit purchase order' : 'New purchase order'}</h2>
              <button aria-label="Close" onClick={() => setOrderOpen(false)} type="button">
                ×
              </button>
            </header>
            <div className="shop-purchase-form-grid">
              <label>
                Supplier
                <select
                  required
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expected delivery
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(event) => setExpectedDeliveryDate(event.target.value)}
                />
              </label>
              <label>
                Transport cost
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={transportCost}
                  onChange={(event) => setTransportCost(event.target.value)}
                />
              </label>
            </div>
            <h3>Order items</h3>
            <div className="shop-purchase-draft-lines">
              {orderLines.map((line, index) => (
                <div className="shop-purchase-draft-line" key={index}>
                  <label>
                    Product
                    <select
                      required
                      value={line.productId}
                      onChange={(event) =>
                        setOrderLines((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productId: event.target.value } : row,
                          ),
                        )
                      }
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      required
                      min="1"
                      step="1"
                      type="number"
                      value={line.quantityOrdered}
                      onChange={(event) =>
                        setOrderLines((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, quantityOrdered: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Unit cost
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={line.unitCost}
                      onChange={(event) =>
                        setOrderLines((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, unitCost: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Tax rate (%)
                    <input
                      min="0"
                      max="100"
                      step="0.001"
                      type="number"
                      value={line.taxRate}
                      onChange={(event) =>
                        setOrderLines((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, taxRate: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="shop-btn danger"
                    disabled={orderLines.length === 1}
                    onClick={() =>
                      setOrderLines((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              className="shop-btn secondary"
              onClick={() =>
                setOrderLines((rows) => [
                  ...rows,
                  { productId: '', quantityOrdered: '1', unitCost: '', taxRate: '0' },
                ])
              }
              type="button"
            >
              Add item
            </button>
            <p className="shop-purchase-total">Items subtotal: {money(totalDraft)}</p>
            {error && (
              <div className="shop-purchase-alert is-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => setOrderOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving} type="submit">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create PO'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {receiveOpen && selected && (
        <div className="shop-purchase-backdrop shop-purchase-modal-backdrop">
          <form className="shop-purchase-modal" onSubmit={(event) => void receiveStock(event)}>
            <header>
              <h2>Receive items · {selected.poNumber}</h2>
              <button aria-label="Close" onClick={() => setReceiveOpen(false)} type="button">
                ×
              </button>
            </header>
            <label>
              Supplier invoice reference
              <input
                value={invoiceReference}
                onChange={(event) => setInvoiceReference(event.target.value)}
              />
            </label>
            <div className="shop-purchase-receive-lines">
              {receiveLines.map((line, index) => (
                <fieldset key={line.purchaseOrderItemId}>
                  <legend>
                    {line.productName} · outstanding {line.quantityOrdered}
                  </legend>
                  <div className="shop-purchase-form-grid">
                    <label>
                      Received qty
                      <input
                        min="0"
                        max={line.quantityOrdered}
                        type="number"
                        value={line.quantityReceived}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, quantityReceived: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Rejected/damaged
                      <input
                        min="0"
                        max={line.quantityOrdered}
                        type="number"
                        value={line.quantityRejected}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, quantityRejected: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Batch number
                      <input
                        required={Number(line.quantityReceived) > 0}
                        value={line.batchNumber}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, batchNumber: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Expiry date
                      <input
                        required={Number(line.quantityReceived) > 0}
                        type="date"
                        value={line.expiryDate}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, expiryDate: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Unit cost
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={line.unitCost}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, unitCost: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Selling price
                      <input
                        min="0"
                        step="0.01"
                        type="number"
                        value={line.sellingPrice}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, sellingPrice: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Shelf location
                      <input
                        value={line.shelfLocation}
                        onChange={(event) =>
                          setReceiveLines((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, shelfLocation: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
            <label>
              Notes
              <textarea
                rows={2}
                value={receiveNotes}
                onChange={(event) => setReceiveNotes(event.target.value)}
              />
            </label>
            {error && (
              <div className="shop-purchase-alert is-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => setReceiveOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving} type="submit">
                {saving ? 'Receiving…' : 'Confirm receipt'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {returnOpen && selected && (
        <div className="shop-purchase-backdrop shop-purchase-modal-backdrop">
          <form className="shop-purchase-modal" onSubmit={(event) => void returnItems(event)}>
            <header>
              <h2>Return items · {selected.poNumber}</h2>
              <button aria-label="Close" onClick={() => setReturnOpen(false)} type="button">
                ×
              </button>
            </header>
            <label>
              Reason for return
              <textarea
                required
                rows={2}
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
              />
            </label>
            {returnLines.map((line, index) => (
              <label key={line.goodsReceivedNoteItemId}>
                {line.productName} · batch {line.batchNumber} · received {line.quantityAvailable}
                <input
                  min="0"
                  max={line.quantityAvailable}
                  step="1"
                  type="number"
                  value={line.quantityReturned}
                  onChange={(event) =>
                    setReturnLines((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index
                          ? { ...item, quantityReturned: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
            ))}
            {error && (
              <div className="shop-purchase-alert is-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => setReturnOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn danger" disabled={saving} type="submit">
                Record return
              </button>
            </footer>
          </form>
        </div>
      )}

      {paymentOpen && selected && (
        <div className="shop-purchase-backdrop shop-purchase-modal-backdrop">
          <form
            className="shop-purchase-modal shop-purchase-compact-modal"
            onSubmit={(event) => void recordPayment(event)}
          >
            <header>
              <h2>Record payment</h2>
              <button aria-label="Close" onClick={() => setPaymentOpen(false)} type="button">
                ×
              </button>
            </header>
            <label>
              Amount
              <input
                required
                min="0.01"
                max={Number(selected.balance)}
                step="0.01"
                type="number"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            <label>
              Payment method
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {['CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'].map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label>
              Reference
              <input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
            {error && (
              <div className="shop-purchase-alert is-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                onClick={() => setPaymentOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving} type="submit">
                Record payment
              </button>
            </footer>
          </form>
        </div>
      )}

      {invoiceOpen && selected && (
        <div className="shop-purchase-backdrop shop-purchase-modal-backdrop">
          <form
            className="shop-purchase-modal shop-purchase-compact-modal"
            onSubmit={(event) => void uploadInvoice(event)}
          >
            <header>
              <h2>Upload supplier invoice</h2>
              <button aria-label="Close" onClick={() => setInvoiceOpen(false)} type="button">
                ×
              </button>
            </header>
            <label>
              Invoice file
              <input
                required
                type="file"
                accept=".pdf,image/jpeg,image/png"
                onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {error && (
              <div className="shop-purchase-alert is-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                className="shop-btn secondary"
                onClick={() => setInvoiceOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="shop-btn primary" disabled={saving} type="submit">
                Upload invoice
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
