import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { authenticatedApiDownload, authenticatedApiRequest } from '../../../lib/auth-api.js';
import './ShopSuppliersPage.css';

type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  physicalAddress: string | null;
  paymentTerms: string | null;
  creditLimit: string | number | null;
  currentBalance: string | number;
  bankDetails: string | null;
  kraPin: string | null;
  notes: string | null;
  status: SupplierStatus;
  isActive?: boolean;
  outstandingBalance?: string | null;
  outstandingBalanceCurrency?: string | null;
  outstandingBalances?: Array<{ currency: string; amount: string }>;
  productsSupplied?: number;
  lastPurchase?: string | null;
}

interface SupplierProduct {
  id: string;
  name: string;
  sku: string;
  brandName?: string | null;
  genericName?: string | null;
  sellingPrice?: string | number;
}

interface SupplierPurchase {
  id: string;
  purchaseNumber: string;
  status: string;
  total: string | number;
  amountPaid: string | number;
  balance: string | number;
  createdAt: string;
  expectedAt?: string | null;
  items?: Array<{ productName: string; quantity: number; receivedQuantity: number }>;
  payments?: Array<{
    id: string;
    amount: string | number;
    method: string;
    reference: string | null;
    paidAt: string;
  }>;
}

interface SupplierPayment {
  id: string;
  amount: string | number;
  method: string;
  reference: string | null;
  paidAt: string;
  notes?: string | null;
}

interface SupplierPrice {
  id: string;
  product: { id: string; name: string; sku: string };
  costPrice: string | number;
  effectiveDate: string;
  notes: string | null;
}

interface SupplierReturn {
  id: string;
  returnNumber: string;
  reason: string;
  createdAt: string;
  total?: string | number;
}

interface SupplierDetails extends Supplier {
  contacts?: Array<{ id: string; name: string; role: string | null; phone: string | null; email: string | null }>;
  products?: SupplierProduct[];
  productPrices?: SupplierPrice[];
  payments?: SupplierPayment[];
  purchases?: SupplierPurchase[];
  returns?: SupplierReturn[];
}

interface SupplierForm {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  physicalAddress: string;
  paymentTerms: string;
  creditLimit: string;
  bankDetails: string;
  kraPin: string;
  notes: string;
  status: SupplierStatus;
}

const EMPTY_FORM: SupplierForm = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  physicalAddress: '',
  paymentTerms: '',
  creditLimit: '0',
  bankDetails: '',
  kraPin: '',
  notes: '',
  status: 'ACTIVE',
};

const formatMoney = (value: string | number | null | undefined) =>
  Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString() : '—';

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The supplier request failed.';
}

function activeStatus(supplier: Supplier): SupplierStatus {
  return supplier.status ?? (supplier.isActive === false ? 'INACTIVE' : 'ACTIVE');
}

export function ShopSuppliersPage({
  onCreatePurchase,
  onViewProducts,
}: {
  onCreatePurchase: (supplierId: string) => void;
  onViewProducts: (supplierId: string) => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<SupplierDetails | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OUTSTANDING' | 'HISTORY'>('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [statement, setStatement] = useState<unknown[] | null>(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<Supplier[] | { items: Supplier[] }>(
        '/v1/shop/suppliers',
      );
      setSuppliers(Array.isArray(result) ? result : result.items);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      if (filter === 'OUTSTANDING' && Number(supplier.outstandingBalance ?? supplier.currentBalance) <= 0)
        return false;
      if (filter === 'HISTORY' && !supplier.lastPurchase) return false;
      return (
        !needle ||
        supplier.name.toLowerCase().includes(needle) ||
        (supplier.contactName ?? '').toLowerCase().includes(needle) ||
        (supplier.phone ?? '').toLowerCase().includes(needle) ||
        (supplier.email ?? '').toLowerCase().includes(needle)
      );
    });
  }, [suppliers, query, filter]);

  function updateForm<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      physicalAddress: supplier.physicalAddress ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      creditLimit: String(supplier.creditLimit ?? 0),
      bankDetails: supplier.bankDetails ?? '',
      kraPin: supplier.kraPin ?? '',
      notes: supplier.notes ?? '',
      status: activeStatus(supplier),
    });
    setError(null);
    setFormOpen(true);
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      contactName: form.contactName || null,
      phone: form.phone || null,
      email: form.email || null,
      physicalAddress: form.physicalAddress || null,
      paymentTerms: form.paymentTerms || null,
      creditLimit: Number(form.creditLimit || 0),
      bankDetails: form.bankDetails || null,
      kraPin: form.kraPin || null,
      notes: form.notes || null,
    };
    try {
      await authenticatedApiRequest<Supplier>(
        editing ? `/v1/shop/suppliers/${editing.id}` : '/v1/shop/suppliers',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      setFormOpen(false);
      setNotice(editing ? 'Supplier updated.' : 'Supplier created.');
      await loadSuppliers();
      if (editing && selected?.id === editing.id) await openDetails(editing.id);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(id: string) {
    setError(null);
    setStatement(null);
    setSaving(true);
    try {
      const details = await authenticatedApiRequest<SupplierDetails>(`/v1/shop/suppliers/${id}`);
      setSelected(details);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/suppliers/${selected.id}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(paymentAmount),
          method: paymentMethod,
          reference: paymentReference || null,
          notes: paymentNotes || null,
        }),
      });
      setPaymentOpen(false);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
      setNotice('Supplier payment recorded.');
      await openDetails(selected.id);
      await loadSuppliers();
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function loadStatement(supplierId: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await authenticatedApiRequest<unknown[] | { items: unknown[] }>(
        `/v1/shop/suppliers/${supplierId}/statement`,
      );
      setStatement(Array.isArray(result) ? result : result.items);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSupplier(supplier: Supplier) {
    if (!window.confirm(`Deactivate ${supplier.name}? Existing purchase history will remain.`))
      return;
    setSaving(true);
    setError(null);
    try {
      await authenticatedApiRequest(`/v1/shop/suppliers/${supplier.id}`, { method: 'DELETE' });
      setNotice(`${supplier.name} deactivated.`);
      setSelected(null);
      await loadSuppliers();
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function exportSuppliers() {
    setSaving(true);
    setError(null);
    try {
      const blob = await authenticatedApiDownload('/v1/shop/suppliers/export');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'suppliers.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function importSuppliers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) {
      setError('Choose a CSV or Excel file to import.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = new FormData();
      data.set('file', importFile);
      await authenticatedApiRequest('/v1/shop/suppliers/import', {
        method: 'POST',
        body: data,
      });
      setImportOpen(false);
      setImportFile(null);
      setNotice('Supplier import completed.');
      await loadSuppliers();
    } catch (requestError) {
      setError(getMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function viewSupplierProducts(supplierId: string) {
    setSelected(null);
    onViewProducts(supplierId);
  }

  return (
    <section className="shop-suppliers">
      <header className="shop-supplier-toolbar">
        <div>
          <h2>Suppliers</h2>
          <p>Manage supplier contacts, balances, purchase history, and product pricing.</p>
        </div>
        <div className="shop-supplier-actions">
          <button className="shop-btn primary" onClick={openCreate} type="button">
            Add Supplier
          </button>
          <button className="shop-btn secondary" onClick={() => setImportOpen(true)} type="button">
            Import Suppliers
          </button>
          <button className="shop-btn secondary" disabled={saving} onClick={() => void exportSuppliers()} type="button">
            Export Suppliers
          </button>
        </div>
      </header>
      {error && <div className="shop-supplier-alert is-error" role="alert">{error}</div>}
      {notice && <div className="shop-supplier-alert" role="status">{notice}</div>}
      <div className="shop-supplier-filters">
        <input
          aria-label="Search suppliers"
          placeholder="Search supplier, contact, phone, or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="shop-supplier-filter-buttons">
          {[
            ['ALL', 'All suppliers'],
            ['OUTSTANDING', 'Outstanding balances'],
            ['HISTORY', 'Purchase history'],
          ].map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? 'is-selected' : ''}
              key={value}
              onClick={() => setFilter(value as typeof filter)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="shop-supplier-table-wrap">
        <table className="shop-supplier-table">
          <thead>
            <tr>
              <th>Supplier name</th><th>Contact person</th><th>Phone</th><th>Email</th>
              <th>Payment terms</th><th>Credit limit</th><th>Current balance</th>
              <th>Products supplied</th><th>Last purchase</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((supplier) => (
              <tr key={supplier.id} onClick={() => void openDetails(supplier.id)}>
                <td><button className="shop-supplier-link" type="button">{supplier.name}</button></td>
                <td>{supplier.contactName ?? '—'}</td>
                <td>{supplier.phone ?? '—'}</td>
                <td>{supplier.email ?? '—'}</td>
                <td>{supplier.paymentTerms ?? '—'}</td>
                <td>{supplier.creditLimit == null ? '—' : formatMoney(supplier.creditLimit)}</td>
                <td>{supplier.outstandingBalances?.length ? supplier.outstandingBalances.map((item) => `${item.currency} ${formatMoney(item.amount)}`).join(' · ') : supplier.outstandingBalance == null ? formatMoney(supplier.currentBalance) : `${supplier.outstandingBalanceCurrency ?? ''} ${formatMoney(supplier.outstandingBalance)}`}</td>
                <td>{supplier.productsSupplied ?? '—'}</td>
                <td>{formatDate(supplier.lastPurchase)}</td>
                <td><span className={`shop-supplier-status status-${activeStatus(supplier).toLowerCase()}`}>{activeStatus(supplier)}</span></td>
                <td><button className="shop-btn secondary shop-supplier-small" onClick={(event) => { event.stopPropagation(); void openDetails(supplier.id); }} type="button">Details</button></td>
              </tr>
            ))}
            {loading && <tr><td className="shop-supplier-empty" colSpan={11}>Loading suppliers…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td className="shop-supplier-empty" colSpan={11}>No suppliers match this view.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="shop-supplier-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="shop-supplier-drawer" role="dialog" aria-modal="true" aria-labelledby="shop-supplier-title" onClick={(event) => event.stopPropagation()}>
            <header className="shop-supplier-drawer-header">
              <div><h2 id="shop-supplier-title">{selected.name}</h2><p>{activeStatus(selected)}</p></div>
              <button aria-label="Close supplier details" onClick={() => setSelected(null)} type="button">×</button>
            </header>
            <div className="shop-supplier-detail-actions">
              <button className="shop-btn secondary" onClick={() => openEdit(selected)} type="button">Edit Supplier</button>
              <button className="shop-btn primary" onClick={() => onCreatePurchase(selected.id)} type="button">Create Purchase Order</button>
              <button className="shop-btn secondary" onClick={() => { setPaymentAmount(''); setPaymentOpen(true); }} type="button">Record Payment</button>
              <button className="shop-btn secondary" disabled={saving} onClick={() => void loadStatement(selected.id)} type="button">View Statement</button>
              <button className="shop-btn secondary" onClick={() => viewSupplierProducts(selected.id)} type="button">View Products</button>
              {activeStatus(selected) === 'ACTIVE' && <button className="shop-btn danger" disabled={saving} onClick={() => void deactivateSupplier(selected)} type="button">Deactivate Supplier</button>}
            </div>
            <h3>Supplier profile</h3>
            <dl className="shop-supplier-summary">
              <div><dt>Contact person</dt><dd>{selected.contactName ?? '—'}</dd></div>
              <div><dt>Phone</dt><dd>{selected.phone ?? '—'}</dd></div>
              <div><dt>Email</dt><dd>{selected.email ?? '—'}</dd></div>
              <div><dt>Address</dt><dd>{selected.physicalAddress ?? '—'}</dd></div>
              <div><dt>Payment terms</dt><dd>{selected.paymentTerms ?? '—'}</dd></div>
              <div><dt>Credit limit</dt><dd>{selected.creditLimit == null ? '—' : formatMoney(selected.creditLimit)}</dd></div>
              <div><dt>Current balance</dt><dd>{selected.outstandingBalances?.length ? selected.outstandingBalances.map((item) => `${item.currency} ${formatMoney(item.amount)}`).join(' · ') : `${selected.outstandingBalanceCurrency ?? ''} ${formatMoney(selected.outstandingBalance ?? selected.currentBalance)}`}</dd></div>
              <div><dt>KRA PIN</dt><dd>{selected.kraPin ?? '—'}</dd></div>
              <div><dt>Bank details</dt><dd>{selected.bankDetails ?? '—'}</dd></div>
              <div><dt>Notes</dt><dd>{selected.notes ?? '—'}</dd></div>
            </dl>
            <h3>Contacts</h3>
            {selected.contacts?.length ? <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th></tr></thead><tbody>{selected.contacts.map((contact) => <tr key={contact.id}><td>{contact.name}</td><td>{contact.role ?? '—'}</td><td>{contact.phone ?? '—'}</td><td>{contact.email ?? '—'}</td></tr>)}</tbody></table></div> : <p className="shop-supplier-muted">No additional contacts.</p>}
            <h3>Products supplied</h3>
            <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Product</th><th>SKU</th><th>Brand / generic</th><th>Selling price</th></tr></thead><tbody>{selected.products?.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.sku}</td><td>{[product.brandName, product.genericName].filter(Boolean).join(' / ') || '—'}</td><td>{product.sellingPrice == null ? '—' : formatMoney(product.sellingPrice)}</td></tr>) ?? <tr><td colSpan={4}>No products supplied.</td></tr>}</tbody></table></div>
            <h3>Purchase history</h3>
            <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Purchase</th><th>Date</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{selected.purchases?.map((purchase) => <tr key={purchase.id}><td>{purchase.purchaseNumber}</td><td>{formatDate(purchase.createdAt)}</td><td>{purchase.status.replaceAll('_', ' ')}</td><td>{formatMoney(purchase.total)}</td><td>{formatMoney(purchase.amountPaid)}</td><td>{formatMoney(purchase.balance)}</td></tr>) ?? <tr><td colSpan={6}>No purchase history.</td></tr>}</tbody></table></div>
            <h3>Payments</h3>
            <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr></thead><tbody>{selected.payments?.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paidAt)}</td><td>{formatMoney(payment.amount)}</td><td>{payment.method}</td><td>{payment.reference ?? '—'}</td><td>{payment.notes ?? '—'}</td></tr>) ?? <tr><td colSpan={5}>No supplier payments.</td></tr>}</tbody></table></div>
            <h3>Supplier returns</h3>
            <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Return #</th><th>Date</th><th>Reason</th><th>Value</th></tr></thead><tbody>{selected.returns?.map((item) => <tr key={item.id}><td>{item.returnNumber}</td><td>{formatDate(item.createdAt)}</td><td>{item.reason}</td><td>{item.total == null ? '—' : formatMoney(item.total)}</td></tr>) ?? <tr><td colSpan={4}>No supplier returns.</td></tr>}</tbody></table></div>
            <h3>Price history</h3>
            <div className="shop-supplier-table-wrap"><table className="shop-supplier-table compact"><thead><tr><th>Product</th><th>Cost price</th><th>Effective date</th><th>Notes</th></tr></thead><tbody>{selected.productPrices?.map((price) => <tr key={price.id}><td>{price.product.name}</td><td>{formatMoney(price.costPrice)}</td><td>{formatDate(price.effectiveDate)}</td><td>{price.notes ?? '—'}</td></tr>) ?? <tr><td colSpan={4}>No supplier price history.</td></tr>}</tbody></table></div>
            {statement && <><h3>Statement</h3><pre className="shop-supplier-statement">{JSON.stringify(statement, null, 2)}</pre></>}
          </section>
        </div>
      )}

      {formOpen && (
        <div className="shop-supplier-backdrop shop-supplier-modal-backdrop">
          <form className="shop-supplier-modal" onSubmit={(event) => void saveSupplier(event)}>
            <header><h2>{editing ? 'Edit supplier' : 'Add supplier'}</h2><button aria-label="Close" onClick={() => setFormOpen(false)} type="button">×</button></header>
            <div className="shop-supplier-form-grid">
              <label>Supplier name<input required maxLength={200} value={form.name} onChange={(event) => updateForm('name', event.target.value)} /></label>
              <label>Contact person<input value={form.contactName} onChange={(event) => updateForm('contactName', event.target.value)} /></label>
              <label>Phone<input type="tel" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} /></label>
              <label>Email<input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} /></label>
              <label>Payment terms<input placeholder="e.g. Net 30" value={form.paymentTerms} onChange={(event) => updateForm('paymentTerms', event.target.value)} /></label>
              <label>Credit limit<input min="0" step="0.01" type="number" value={form.creditLimit} onChange={(event) => updateForm('creditLimit', event.target.value)} /></label>
              <label className="shop-supplier-wide">Physical address<textarea rows={2} value={form.physicalAddress} onChange={(event) => updateForm('physicalAddress', event.target.value)} /></label>
              <label>Bank details<textarea rows={2} value={form.bankDetails} onChange={(event) => updateForm('bankDetails', event.target.value)} /></label>
              <label>KRA PIN<input value={form.kraPin} onChange={(event) => updateForm('kraPin', event.target.value)} /></label>
              <label>Status<select value={form.status} onChange={(event) => updateForm('status', event.target.value as SupplierStatus)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="BLACKLISTED">Blacklisted</option></select></label>
              <label className="shop-supplier-wide">Notes<textarea rows={3} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></label>
            </div>
            {error && <div className="shop-supplier-alert is-error" role="alert">{error}</div>}
            <footer><button className="shop-btn secondary" disabled={saving} onClick={() => setFormOpen(false)} type="button">Cancel</button><button className="shop-btn primary" disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create supplier'}</button></footer>
          </form>
        </div>
      )}

      {paymentOpen && selected && (
        <div className="shop-supplier-backdrop shop-supplier-modal-backdrop">
          <form className="shop-supplier-modal shop-supplier-compact-modal" onSubmit={(event) => void submitPayment(event)}>
            <header><h2>Record payment · {selected.name}</h2><button aria-label="Close" onClick={() => setPaymentOpen(false)} type="button">×</button></header>
            <label>Amount<input required min="0.01" step="0.01" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
            <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{['CASH', 'BANK_TRANSFER', 'MPESA', 'CARD', 'CHEQUE', 'OTHER'].map((method) => <option key={method}>{method}</option>)}</select></label>
            <label>Reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
            <label>Notes<textarea rows={2} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /></label>
            {error && <div className="shop-supplier-alert is-error" role="alert">{error}</div>}
            <footer><button className="shop-btn secondary" disabled={saving} onClick={() => setPaymentOpen(false)} type="button">Cancel</button><button className="shop-btn primary" disabled={saving} type="submit">Record payment</button></footer>
          </form>
        </div>
      )}

      {importOpen && (
        <div className="shop-supplier-backdrop shop-supplier-modal-backdrop">
          <form className="shop-supplier-modal shop-supplier-compact-modal" onSubmit={(event) => void importSuppliers(event)}>
            <header><h2>Import suppliers</h2><button aria-label="Close" onClick={() => setImportOpen(false)} type="button">×</button></header>
            <p>Choose a CSV or Excel file containing supplier records.</p>
            <label>Supplier file<input required type="file" accept=".csv,.xlsx" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label>
            {error && <div className="shop-supplier-alert is-error" role="alert">{error}</div>}
            <footer><button className="shop-btn secondary" disabled={saving} onClick={() => setImportOpen(false)} type="button">Cancel</button><button className="shop-btn primary" disabled={saving} type="submit">{saving ? 'Importing…' : 'Import file'}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}
