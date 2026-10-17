import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import './ShopOrdersPage.css';

type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PACKING'
  | 'PACKED'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'REFUNDED';

interface OrderItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unit?: string;
  unitPrice: string | number;
  discount?: string | number;
  lineTotal: string | number;
}

interface OrderPayment {
  id: string;
  amount: string | number;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  isRefund: boolean;
  reason: string | null;
  createdAt: string;
}

interface OrderStatusHistory {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  notes: string | null;
  createdAt: string;
  actorUserId: string | null;
}

interface Delivery {
  id: string;
  riderId: string | null;
  fee: string | number;
  address: unknown;
  customerPhone: string;
  notes: string | null;
  failedDeliveryReason: string | null;
  returnedToStock: boolean;
  deliveredAt: string | null;
  proofs: Array<{ id: string; fileName: string; mimeType: string; createdAt: string }>;
}

interface ShopOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  status: OrderStatus;
  fulfilmentStatus?: OrderStatus;
  paymentStatus: string;
  paymentMethod: string | null;
  currency: string;
  subtotal: string | number;
  discount: string | number;
  deliveryFee: string | number;
  taxTotal: string | number;
  total: string | number;
  deliveryMethod: string;
  deliveryAddress: unknown;
  pickupAt: string | null;
  notes: string | null;
  assignedStaffId: string | null;
  assignedRiderId: string | null;
  deliveryNotes: string | null;
  failedDeliveryReason: string | null;
  prescriptionId: string | null;
  prescriptionKey: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments?: OrderPayment[];
  statusHistory?: OrderStatusHistory[];
  deliveries?: Delivery[];
}

const FILTERS: Array<{ value: 'ALL' | OrderStatus; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKING', label: 'Packing' },
  { value: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const money = (amount: string | number, currency: string) =>
  `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value: string) => new Date(value).toLocaleString();
const statusLabel = (status: string) => status.replaceAll('_', ' ').toLowerCase();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The order request failed.';
}

function addressText(address: unknown): string {
  if (!address || typeof address !== 'object') return '—';
  return (
    Object.entries(address)
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ') || '—'
  );
}

function nextActions(order: ShopOrder): Array<{ status: OrderStatus; label: string }> {
  switch (order.status) {
    case 'PENDING':
      return [{ status: 'CONFIRMED', label: 'Accept Order' }];
    case 'CONFIRMED':
      return [{ status: 'PACKING', label: 'Mark as Packing' }];
    case 'PACKING':
    case 'PACKED':
      return order.deliveryMethod === 'PICKUP'
        ? [{ status: 'READY_FOR_PICKUP', label: 'Mark Ready for Pickup' }]
        : [{ status: 'OUT_FOR_DELIVERY', label: 'Start Delivery' }];
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return [{ status: 'DELIVERED', label: 'Mark Delivered' }];
    case 'DELIVERED':
      return [{ status: 'COMPLETED', label: 'Complete Order' }];
    default:
      return [];
  }
}

export function ShopOrdersPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [riderId, setRiderId] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [returnToStock, setReturnToStock] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState('');
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<ShopOrder[]>('/v1/shop/orders');
      setOrders(result);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => filter === 'ALL' || order.status === filter),
    [orders, filter],
  );

  async function refreshSelected(orderId: string) {
    await loadOrders();
    const details = await authenticatedApiRequest<ShopOrder>(`/v1/shop/orders/${orderId}`);
    setSelected(details);
  }

  async function changeStatus(order: ShopOrder, status: OrderStatus, notes?: string) {
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${order.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, notes }),
      });
      setNotice(`Order ${order.orderNumber} marked ${statusLabel(status)}.`);
      await refreshSelected(order.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function cancelOrder(order: ShopOrder) {
    const reason = window.prompt(`Reason for cancelling ${order.orderNumber}:`);
    if (reason === null) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setNotice('Order cancelled. Reserved stock was released where applicable.');
      await refreshSelected(order.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function assignOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${selected.id}/assign`, {
        method: 'PUT',
        body: JSON.stringify({ staffId: staffId || null, riderId: riderId || null }),
      });
      setAssignOpen(false);
      setNotice('Order assignment saved.');
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function processRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${selected.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(refundAmount || selected.total),
          reason: refundReason,
          returnToStock,
        }),
      });
      setRefundOpen(false);
      setNotice('Order refund recorded.');
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${selected.id}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(paymentAmount),
          method: paymentMethod,
          reference: paymentReference || undefined,
        }),
      });
      setPaymentOpen(false);
      setNotice('Order payment recorded.');
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function returnDelivery(order: ShopOrder) {
    const reason = window.prompt('Enter the failed-delivery or return reason:');
    if (reason === null) return;
    const restock = window.confirm('Return the original, unexpired batches to saleable stock?');
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${order.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason, returnToStock: restock }),
      });
      setNotice('Delivery return recorded.');
      await refreshSelected(order.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function savePrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/orders/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({ prescriptionId: prescriptionId.trim() || null }),
      });
      setPrescriptionOpen(false);
      setNotice('Prescription reference attached.');
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function uploadProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !proofFile) {
      setError('Select a proof-of-delivery image or document.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', proofFile);
      await authenticatedApiRequest(`/v1/shop/orders/${selected.id}/delivery-proof`, {
        method: 'POST',
        body: formData,
      });
      setProofFile(null);
      setNotice('Delivery proof uploaded.');
      await refreshSelected(selected.id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function sendWhatsAppUpdate(order: ShopOrder) {
    setSaving(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<{ whatsappUrl: string }>(
        `/v1/shop/orders/${order.id}/whatsapp-update`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
      setNotice('WhatsApp message draft opened for the customer.');
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="shop-orders">
      <header className="shop-orders-heading">
        <div>
          <h2>
            Orders <span>{orders.length}</span>
          </h2>
          <p>Review order details, fulfilment, delivery, and payment history.</p>
        </div>
        <button
          className="shop-btn secondary"
          disabled={loading || saving}
          onClick={() => void loadOrders()}
          type="button"
        >
          Refresh
        </button>
      </header>
      {error && (
        <div className="shop-order-alert is-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="shop-order-alert" role="status">
          {notice}
        </div>
      )}
      <nav className="shop-order-filters" aria-label="Filter orders">
        {FILTERS.map(({ value, label }) => (
          <button
            aria-pressed={filter === value}
            className={filter === value ? 'is-selected' : ''}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="shop-order-table-wrap">
        <table className="shop-order-table">
          <thead>
            <tr>
              <th>Order number</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payment method</th>
              <th>Payment</th>
              <th>Fulfilment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
              <tr key={order.id}>
                <td>
                  <button
                    className="shop-order-link"
                    onClick={() => void refreshSelected(order.id)}
                    type="button"
                  >
                    {order.orderNumber}
                  </button>
                </td>
                <td>{dateTime(order.createdAt)}</td>
                <td>
                  {order.customerName}
                  <small>{order.customerPhone}</small>
                </td>
                <td>{order.orderType?.replaceAll('_', ' ') ?? order.deliveryMethod}</td>
                <td>{order.items.reduce((total, item) => total + item.quantity, 0)}</td>
                <td>{money(order.total, order.currency)}</td>
                <td>{order.paymentMethod ?? '—'}</td>
                <td>{statusLabel(order.paymentStatus)}</td>
                <td>
                  <span className={`shop-order-status status-${order.status.toLowerCase()}`}>
                    {statusLabel(order.status)}
                  </span>
                </td>
                <td>
                  <button
                    className="shop-btn secondary shop-order-small"
                    onClick={() => void refreshSelected(order.id)}
                    type="button"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td className="shop-order-empty" colSpan={10}>
                  Loading orders…
                </td>
              </tr>
            )}
            {!loading && filteredOrders.length === 0 && (
              <tr>
                <td className="shop-order-empty" colSpan={10}>
                  No orders in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="shop-order-backdrop" onClick={() => setSelected(null)} role="presentation">
          <section
            aria-labelledby="shop-order-detail-title"
            aria-modal="true"
            className="shop-order-drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="shop-order-drawer-header">
              <div>
                <h2 id="shop-order-detail-title">{selected.orderNumber}</h2>
                <p>
                  {statusLabel(selected.status)} · {dateTime(selected.createdAt)}
                </p>
              </div>
              <button
                aria-label="Close order details"
                onClick={() => setSelected(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="shop-order-actions">
              {nextActions(selected).map((action) => (
                <button
                  className="shop-btn primary"
                  disabled={saving}
                  key={action.status}
                  onClick={() => void changeStatus(selected, action.status)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
              {selected.status === 'PENDING' && (
                <button
                  className="shop-btn danger"
                  disabled={saving}
                  onClick={() => void cancelOrder(selected)}
                  type="button"
                >
                  Reject Order
                </button>
              )}
              {['PENDING', 'CONFIRMED', 'PACKING', 'PACKED'].includes(selected.status) && (
                <button
                  className="shop-btn danger"
                  disabled={saving}
                  onClick={() => void cancelOrder(selected)}
                  type="button"
                >
                  Cancel Order
                </button>
              )}
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => {
                  setStaffId(selected.assignedStaffId ?? '');
                  setRiderId(selected.assignedRiderId ?? '');
                  setAssignOpen(true);
                }}
                type="button"
              >
                Assign Staff / Rider
              </button>
              {!['PAID', 'REFUNDED'].includes(selected.paymentStatus) &&
                !['CANCELLED', 'REFUNDED'].includes(selected.status) && (
                  <button
                    className="shop-btn secondary"
                    disabled={saving}
                    onClick={() => {
                      setPaymentAmount('');
                      setPaymentOpen(true);
                    }}
                    type="button"
                  >
                    Record Payment
                  </button>
                )}
              {selected.paymentStatus === 'PAID' &&
                !['REFUNDED', 'CANCELLED'].includes(selected.status) && (
                  <button
                    className="shop-btn danger"
                    disabled={saving}
                    onClick={() => {
                      const paid = (selected.payments ?? [])
                        .filter((payment) => !payment.isRefund && payment.status === 'PAID')
                        .reduce((sum, payment) => sum + Number(payment.amount), 0);
                      const refunded = (selected.payments ?? [])
                        .filter((payment) => payment.isRefund)
                        .reduce((sum, payment) => sum + Number(payment.amount), 0);
                      setRefundAmount(
                        Math.max(0, (paid || Number(selected.total)) - refunded).toFixed(2),
                      );
                      setRefundReason('');
                      setReturnToStock(false);
                      setRefundOpen(true);
                    }}
                    type="button"
                  >
                    Process Refund
                  </button>
                )}
              {['OUT_FOR_DELIVERY', 'DELIVERED'].includes(selected.status) && (
                <button
                  className="shop-btn danger"
                  disabled={saving}
                  onClick={() => void returnDelivery(selected)}
                  type="button"
                >
                  Failed Delivery / Return
                </button>
              )}
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => window.print()}
                type="button"
              >
                Print Invoice
              </button>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => void sendWhatsAppUpdate(selected)}
                type="button"
              >
                Send WhatsApp Update
              </button>
              <button
                className="shop-btn secondary"
                disabled={saving}
                onClick={() => {
                  setPrescriptionId(selected.prescriptionId ?? '');
                  setPrescriptionOpen(true);
                  setNotice(null);
                }}
                type="button"
              >
                Attach Prescription
              </button>
            </div>
            <div className="shop-order-grid">
              <article>
                <h3>Customer</h3>
                <p>
                  <strong>{selected.customerName}</strong>
                  <br />
                  {selected.customerPhone}
                  <br />
                  {selected.customerEmail ?? '—'}
                </p>
              </article>
              <article>
                <h3>Order and payment</h3>
                <p>
                  Type: {selected.orderType.replaceAll('_', ' ')}
                  <br />
                  Subtotal: {money(selected.subtotal, selected.currency)}
                  <br />
                  Discount: {money(selected.discount, selected.currency)}
                  <br />
                  VAT: {money(selected.taxTotal, selected.currency)}
                  <br />
                  Delivery fee: {money(selected.deliveryFee, selected.currency)}
                  <br />
                  <strong>Total: {money(selected.total, selected.currency)}</strong>
                  <br />
                  {statusLabel(selected.paymentStatus)} ·{' '}
                  {selected.paymentMethod ?? 'Payment method unavailable'}
                </p>
              </article>
              <article>
                <h3>Delivery / pickup</h3>
                <p>
                  Method: {selected.deliveryMethod}
                  <br />
                  Address: {addressText(selected.deliveryAddress)}
                  <br />
                  Pickup time: {selected.pickupAt ? dateTime(selected.pickupAt) : '—'}
                  <br />
                  Assigned staff: {selected.assignedStaffId ?? '—'}
                  <br />
                  Rider: {selected.assignedRiderId ?? '—'}
                  <br />
                  Notes: {selected.deliveryNotes ?? selected.notes ?? '—'}
                  <br />
                  Failed delivery:{' '}
                  {selected.failedDeliveryReason ??
                    selected.deliveries?.[0]?.failedDeliveryReason ??
                    '—'}
                  <br />
                  Delivery fee: {money(selected.deliveryFee, selected.currency)}
                </p>
              </article>
              <article>
                <h3>Prescription</h3>
                <p>
                  {selected.prescriptionId ??
                    selected.prescriptionKey ??
                    'No prescription attached'}
                </p>
              </article>
            </div>
            <section className="shop-order-invoice" aria-label="Printable order invoice">
              <h1>Order invoice</h1>
              <p>
                <strong>{selected.orderNumber}</strong> · {dateTime(selected.createdAt)}
              </p>
              <p>
                {selected.customerName} · {selected.customerPhone}
                <br />
                {selected.customerEmail ?? ''}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td>
                        {item.quantity} {item.unit ?? 'unit'}
                      </td>
                      <td>{money(item.unitPrice, selected.currency)}</td>
                      <td>{money(item.lineTotal, selected.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Subtotal: {money(selected.subtotal, selected.currency)}
                <br />
                Discount: {money(selected.discount, selected.currency)}
                <br />
                VAT: {money(selected.taxTotal, selected.currency)}
                <br />
                Delivery: {money(selected.deliveryFee, selected.currency)}
                <br />
                <strong>Total: {money(selected.total, selected.currency)}</strong>
              </p>
            </section>
            <h3>Items</h3>
            <div className="shop-order-table-wrap">
              <table className="shop-order-table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Discount</th>
                    <th>Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td>{item.sku}</td>
                      <td>
                        {item.quantity} {item.unit ?? 'unit'}
                      </td>
                      <td>{money(item.unitPrice, selected.currency)}</td>
                      <td>{money(item.discount ?? 0, selected.currency)}</td>
                      <td>{money(item.lineTotal, selected.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Payment history</h3>
            <div className="shop-order-table-wrap">
              <table className="shop-order-table compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.payments?.map((payment) => (
                    <tr key={payment.id}>
                      <td>{dateTime(payment.createdAt)}</td>
                      <td>{payment.method}</td>
                      <td>{money(payment.amount, payment.currency)}</td>
                      <td>{payment.isRefund ? 'Refund' : payment.status}</td>
                      <td>{payment.reference ?? '—'}</td>
                      <td>{payment.reason ?? '—'}</td>
                    </tr>
                  )) ?? (
                    <tr>
                      <td colSpan={6}>No payment records.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <h3>Status timeline</h3>
            <ol className="shop-order-timeline">
              {selected.statusHistory?.map((item) => (
                <li key={item.id}>
                  <strong>
                    {item.fromStatus ? `${statusLabel(item.fromStatus)} → ` : ''}
                    {statusLabel(item.toStatus)}
                  </strong>
                  <small>
                    {dateTime(item.createdAt)} · {item.actorUserId ?? 'System'}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </small>
                </li>
              )) ?? <li>Timeline unavailable.</li>}
            </ol>
            <h3>Delivery proof</h3>
            {selected.deliveries
              ?.flatMap((delivery) => delivery.proofs)
              .map((proof) => (
                <p key={proof.id}>
                  {proof.fileName} · uploaded {dateTime(proof.createdAt)}
                </p>
              ))}
            <form className="shop-order-inline-form" onSubmit={(event) => void uploadProof(event)}>
              <input
                accept="image/*,.pdf"
                aria-label="Proof of delivery"
                onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <button className="shop-btn secondary" disabled={saving} type="submit">
                Upload proof
              </button>
            </form>
            {assignOpen && (
              <div className="shop-order-modal-backdrop">
                <form className="shop-order-modal" onSubmit={(event) => void assignOrder(event)}>
                  <h3>Assign staff and rider</h3>
                  <label>
                    Staff user ID
                    <input value={staffId} onChange={(event) => setStaffId(event.target.value)} />
                  </label>
                  <label>
                    Rider user ID
                    <input value={riderId} onChange={(event) => setRiderId(event.target.value)} />
                  </label>
                  <footer>
                    <button
                      className="shop-btn secondary"
                      onClick={() => setAssignOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button className="shop-btn primary" disabled={saving} type="submit">
                      Save assignment
                    </button>
                  </footer>
                </form>
              </div>
            )}
            {paymentOpen && (
              <div className="shop-order-modal-backdrop">
                <form className="shop-order-modal" onSubmit={(event) => void recordPayment(event)}>
                  <h3>Record order payment</h3>
                  <label>
                    Amount
                    <input
                      min="0.01"
                      required
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
                      {['CASH', 'MPESA', 'CARD', 'BANK_TRANSFER', 'CREDIT_ACCOUNT'].map(
                        (method) => (
                          <option key={method}>{method}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Reference
                    <input
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                    />
                  </label>
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
            {prescriptionOpen && (
              <div className="shop-order-modal-backdrop">
                <form
                  className="shop-order-modal"
                  onSubmit={(event) => void savePrescription(event)}
                >
                  <h3>Attach prescription reference</h3>
                  <p>
                    Attach the pharmacy-verified prescription identifier. This does not replace
                    verification.
                  </p>
                  <label>
                    Prescription ID
                    <input
                      value={prescriptionId}
                      onChange={(event) => setPrescriptionId(event.target.value)}
                    />
                  </label>
                  <footer>
                    <button
                      className="shop-btn secondary"
                      onClick={() => setPrescriptionOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button className="shop-btn primary" disabled={saving} type="submit">
                      Save reference
                    </button>
                  </footer>
                </form>
              </div>
            )}
            {refundOpen && (
              <div className="shop-order-modal-backdrop">
                <form className="shop-order-modal" onSubmit={(event) => void processRefund(event)}>
                  <h3>Process order refund</h3>
                  <label>
                    Refund amount
                    <input
                      min="0.01"
                      required
                      step="0.01"
                      type="number"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </label>
                  <label>
                    Reason
                    <textarea
                      required
                      value={refundReason}
                      onChange={(event) => setRefundReason(event.target.value)}
                    />
                  </label>
                  <label className="shop-order-checkbox">
                    <input
                      checked={returnToStock}
                      onChange={(event) => setReturnToStock(event.target.checked)}
                      type="checkbox"
                    />{' '}
                    Return eligible items to stock
                  </label>
                  <footer>
                    <button
                      className="shop-btn secondary"
                      onClick={() => setRefundOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button className="shop-btn primary" disabled={saving} type="submit">
                      Confirm refund
                    </button>
                  </footer>
                </form>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
