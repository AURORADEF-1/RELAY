"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { normalizeMachineNumber, type MachineRegistryRecord } from "@/lib/machine-registry";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import type { RicoProduct } from "@/lib/integrations/rico/types";

type LookupMode = "machine" | "part" | "crossref" | "list";
type SearchMethod = "MACHINE" | "RICO_REFERENCE" | "CROSS_REFERENCE" | "CATALOGUE";
type ListItem = { product: RicoProduct; quantity: number; method: SearchMethod; checkedAt: string };
type OpenTicket = {
  id: string;
  job_number: string | null;
  machine_reference: string | null;
  request_summary: string | null;
  status: string | null;
};

const tabs: Array<{ id: LookupMode; label: string }> = [
  { id: "machine", label: "Machine Search" },
  { id: "part", label: "Part Number" },
  { id: "crossref", label: "Cross-Reference" },
  { id: "list", label: "Filter List" },
];

export function FilterLookupWorkspace() {
  const [mode, setMode] = useState<LookupMode>("machine");
  const [machineQuery, setMachineQuery] = useState("");
  const [machines, setMachines] = useState<MachineRegistryRecord[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<MachineRegistryRecord | null>(null);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [partQuery, setPartQuery] = useState("");
  const [products, setProducts] = useState<RicoProduct[]>([]);
  const [matchLabel, setMatchLabel] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [list, setList] = useState<ListItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<RicoProduct | null>(null);
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [ticketId, setTicketId] = useState("");
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [ticketNote, setTicketNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void apiRequest<string[]>("/api/integrations/rico/manufacturers")
      .then(setManufacturers)
      .catch(() => {
        // The page remains usable for manually entered manufacturers.
      });
  }, []);

  useEffect(() => {
    const query = machineQuery.trim();
    if (query.length < 2) {
      setMachines([]);
      return;
    }
    const timeout = window.setTimeout(async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const clean = query.replace(/[%(),]/g, " ");
      const compact = normalizeMachineNumber(query);
      const { data } = await supabase
        .from("machines")
        .select("id,machine_number,machine_number_normalized,fleet_type,item_description,make,model,serial_number,status,quantity,buying_price,selling_price,source_sheet,source_row,created_at,updated_at")
        .or(`machine_number.ilike.*${clean}*,machine_number_normalized.ilike.*${compact}*,make.ilike.*${clean}*,model.ilike.*${clean}*,serial_number.ilike.*${clean}*,item_description.ilike.*${clean}*`)
        .limit(12);
      setMachines((data ?? []) as MachineRegistryRecord[]);
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [machineQuery]);

  useEffect(() => {
    if (!selectedProduct) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .from("tickets")
      .select("id,job_number,machine_reference,request_summary,status")
      .in("status", [...activeTicketStatuses])
      .order("updated_at", { ascending: false })
      .limit(150)
      .then(({ data }) => setTickets((data ?? []) as OpenTicket[]));
  }, [selectedProduct]);

  const listTotal = useMemo(
    () => list.reduce((total, item) => total + item.product.price * item.quantity, 0),
    [list],
  );

  function chooseMachine(machine: MachineRegistryRecord) {
    setSelectedMachine(machine);
    setMachineQuery(machine.machine_number);
    setMachines([]);
    setManufacturer(machine.make?.trim() ?? "");
    setModel(machine.model?.trim() ?? "");
    setProducts([]);
    setNotice("");
  }

  async function searchMachine() {
    if (!manufacturer.trim()) {
      setError("Select or enter a manufacturer.");
      return;
    }
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams({ manufacturer: manufacturer.trim() });
      if (model.trim()) params.set("q", model.trim());
      const data = await apiRequest<{ machines: Array<{ kits: RicoProduct[] }>; checkedAt: string }>(
        `/api/integrations/rico/machines?${params}`,
      );
      setProducts(data.machines.flatMap((machine) => machine.kits));
      setCheckedAt(data.checkedAt);
      setMatchLabel("Direct machine match");
    } catch (searchError) {
      setError(messageFor(searchError));
    } finally {
      setIsLoading(false);
    }
  }

  async function searchReference(searchMode: "part" | "crossref") {
    if (partQuery.trim().length < 2) {
      setError("Enter a RICO, OEM or competitor reference.");
      return;
    }
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest<{
        products: RicoProduct[];
        checkedAt: string;
        enteredReference: string;
        matchedQuery: string;
      }>(`/api/integrations/rico/cross-reference?q=${encodeURIComponent(partQuery.trim())}`);
      setProducts(data.products);
      setCheckedAt(data.checkedAt);
      setMatchLabel(searchMode === "part" ? "Exact or cross-reference match" : "Cross-reference match");
      if (data.matchedQuery !== data.enteredReference.toUpperCase()) {
        setNotice(`Matched using normalized reference ${data.matchedQuery}.`);
      }
    } catch (searchError) {
      setError(messageFor(searchError));
    } finally {
      setIsLoading(false);
    }
  }

  function addToList(product: RicoProduct) {
    const method: SearchMethod =
      mode === "machine" ? "MACHINE" : mode === "crossref" ? "CROSS_REFERENCE" : "RICO_REFERENCE";
    setList((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1, method, checkedAt: checkedAt || new Date().toISOString() }];
    });
    setNotice(`${product.reference} added to the Filter List.`);
  }

  async function addToTicket() {
    const listItem = list.find((item) => item.product.id === selectedProduct?.id);
    if (!selectedProduct || !ticketId || !confirmed) {
      setError("Select a ticket and confirm the compatibility check.");
      return;
    }
    const selectedTicket = tickets.find((ticket) => ticket.id === ticketId);
    const machineReference =
      selectedMachine?.machine_number || selectedTicket?.machine_reference?.trim() || "";
    if (!machineReference) {
      setError("Select a registered machine or a ticket with a machine reference.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await apiRequest("/api/integrations/rico/ticket-parts", {
        method: "POST",
        body: JSON.stringify({
          ticketId,
          machineId: selectedMachine?.id ?? null,
          machineReference,
          machineMake: selectedMachine?.make ?? null,
          machineModel: selectedMachine?.model ?? null,
          machineSerialNumber: selectedMachine?.serial_number ?? null,
          searchMethod: listItem?.method ?? (mode === "machine" ? "MACHINE" : "CROSS_REFERENCE"),
          productId: selectedProduct.id,
          partNumber: selectedProduct.reference,
          description: selectedProduct.name || selectedProduct.descriptionShort || selectedProduct.reference,
          quantity: ticketQuantity,
          unitPrice: selectedProduct.price,
          currency: "GBP",
          stockQuantity: selectedProduct.quantity,
          internalDescription: ticketNote || null,
          checkedAt: listItem?.checkedAt ?? checkedAt ?? new Date().toISOString(),
          confirmed: true,
        }),
      });
      setSelectedProduct(null);
      setTicketId("");
      setConfirmed(false);
      setTicketNote("");
      setNotice(`${selectedProduct.reference} added to the ticket as a proposed part.`);
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rico-workspace">
      <header className="rico-header">
        <div>
          <p className="rico-kicker"><span /> RICO Europe live catalogue</p>
          <h1>Filter Lookup</h1>
          <p>Find live service kits and filters, compare references, then attach a confirmed proposal to a RELAY ticket.</p>
        </div>
        <div className="rico-live-note">
          <strong>Read-only integration</strong>
          <span>Pricing and stock are checked live. No order is created.</span>
        </div>
      </header>

      <div className="rico-tabs" role="tablist" aria-label="Filter lookup mode">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => {
              setMode(tab.id);
              setError("");
              setNotice("");
            }}
          >
            {tab.label}
            {tab.id === "list" && list.length ? <span>{list.length}</span> : null}
          </button>
        ))}
      </div>

      {mode === "machine" ? (
        <div className="rico-search-panel">
          <div className="rico-machine-search">
            <label>
              <span>RELAY machine</span>
              <input value={machineQuery} onChange={(event) => setMachineQuery(event.target.value)} placeholder="Plant reference, make, model or serial" />
            </label>
            {machines.length ? (
              <div className="rico-machine-results">
                {machines.map((machine) => (
                  <button key={machine.id ?? machine.machine_number} type="button" onClick={() => chooseMachine(machine)}>
                    <strong>{machine.machine_number}</strong>
                    <span>{[machine.make, machine.model, machine.serial_number].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <label>
            <span>Manufacturer</span>
            <input list="rico-manufacturers" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} placeholder="e.g. JCB" />
            <datalist id="rico-manufacturers">{manufacturers.map((value) => <option key={value} value={value} />)}</datalist>
          </label>
          <label>
            <span>Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. 8018" />
          </label>
          <button type="button" className="console-primary-action" onClick={searchMachine} disabled={isLoading}>
            <ConsoleIcon name="search" className="h-4 w-4" /> Search RICO
          </button>
          {selectedMachine ? (
            <div className="rico-selected-machine">
              <strong>{selectedMachine.machine_number} verified in RELAY</strong>
              <span>{selectedMachine.item_description}</span>
              <span>Serial: {selectedMachine.serial_number || "not recorded"}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "part" || mode === "crossref" ? (
        <div className="rico-reference-search">
          <label>
            <span>{mode === "part" ? "RICO or OEM part number" : "OEM or competitor part number"}</span>
            <input value={partQuery} onChange={(event) => setPartQuery(event.target.value)} placeholder={mode === "part" ? "Enter product reference" : "Enter cross-reference"} />
          </label>
          <button type="button" className="console-primary-action" onClick={() => searchReference(mode)} disabled={isLoading}>
            Search Knowledge
          </button>
          <p>Exact input is tried first; a separator-free retry is used only when the exact search returns no results.</p>
        </div>
      ) : null}

      {error ? <div className="rico-alert rico-alert-error" role="alert">{error}</div> : null}
      {notice ? <div className="rico-alert" role="status">{notice}</div> : null}
      {isLoading ? <div className="rico-loading">Checking the live RICO catalogue...</div> : null}

      {mode !== "list" && !isLoading ? (
        <div className="rico-results">
          <div className="rico-results-heading">
            <div><h2>Results</h2><span>{products.length} products</span></div>
            {checkedAt ? <p>Checked {formatDateTime(checkedAt)}</p> : null}
          </div>
          {products.length ? products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              matchLabel={matchLabel}
              onAdd={() => addToList(product)}
              onTicket={() => setSelectedProduct(product)}
            />
          )) : <div className="rico-empty"><h3>No products to display</h3><p>Choose a machine or enter a part reference to search the approved RICO catalogue.</p></div>}
        </div>
      ) : null}

      {mode === "list" ? (
        <div className="rico-list-panel">
          <div className="rico-results-heading">
            <div><h2>Filter List</h2><span>{list.length} selected products</span></div>
            <strong>{formatMoney(listTotal)} live snapshot</strong>
          </div>
          {list.length ? list.map((item) => (
            <div className="rico-list-row" key={item.product.id}>
              <div><strong>{item.product.reference}</strong><span>{item.product.name}</span></div>
              <label><span>Qty</span><input type="number" min={1} value={item.quantity} onChange={(event) => setList((current) => current.map((entry) => entry.product.id === item.product.id ? { ...entry, quantity: Math.max(1, Number(event.target.value)) } : entry))} /></label>
              <span>{formatMoney(item.product.price * item.quantity)}</span>
              <button type="button" onClick={() => setSelectedProduct(item.product)}>Add to ticket</button>
              <button type="button" aria-label={`Remove ${item.product.reference}`} onClick={() => setList((current) => current.filter((entry) => entry.product.id !== item.product.id))}>×</button>
            </div>
          )) : <div className="rico-empty"><h3>Your Filter List is empty</h3><p>Add live RICO results here before attaching them to a ticket.</p></div>}
          <p className="rico-disclaimer">Prices and availability are snapshots from the displayed check time and must be refreshed before ordering.</p>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="rico-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedProduct(null);
        }}>
          <section className="rico-dialog" role="dialog" aria-modal="true" aria-labelledby="rico-ticket-dialog-title">
            <header>
              <div><span>PROPOSED RICO PART</span><h2 id="rico-ticket-dialog-title">Add to RELAY ticket</h2></div>
              <button type="button" aria-label="Close" onClick={() => setSelectedProduct(null)}>×</button>
            </header>
            <div className="rico-dialog-product"><strong>{selectedProduct.reference}</strong><span>{selectedProduct.name}</span><em>{formatMoney(selectedProduct.price)} · {stockLabel(selectedProduct.quantity)}</em></div>
            <label><span>Open ticket</span><select value={ticketId} onChange={(event) => setTicketId(event.target.value)}><option value="">Select a ticket</option>{tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.job_number || "No job"} · {ticket.machine_reference || "No machine"} · {ticket.request_summary || "Request"}</option>)}</select></label>
            <div className="rico-dialog-grid">
              <label><span>Quantity</span><input type="number" min={1} max={999} value={ticketQuantity} onChange={(event) => setTicketQuantity(Math.max(1, Number(event.target.value)))} /></label>
              <label><span>Internal description</span><input value={ticketNote} onChange={(event) => setTicketNote(event.target.value)} placeholder="Optional note" /></label>
            </div>
            <label className="rico-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I have checked the selected product against the machine details and available application data.</span></label>
            <p className="rico-disclaimer">This adds a proposed part only. It does not create a purchase order or submit an order to RICO.</p>
            <footer><button type="button" onClick={() => setSelectedProduct(null)}>Cancel</button><button type="button" className="console-primary-action" onClick={addToTicket} disabled={!ticketId || !confirmed || isLoading}>Add proposed part</button></footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ProductRow({ product, matchLabel, onAdd, onTicket }: { product: RicoProduct; matchLabel: string; onAdd: () => void; onTicket: () => void }) {
  const image = product.images.find((item) => item.cover) ?? product.images[0];
  return (
    <article className="rico-product-row">
      <div className="rico-product-image">{image ? <Image src={image.url} alt="" width={72} height={72} sizes="72px" /> : <ConsoleIcon name="parts" className="h-7 w-7" />}</div>
      <div className="rico-product-main"><div><span className="rico-source-badge">RICO Live</span><span className="rico-match-badge">{matchLabel}</span></div><h3>{product.reference}</h3><strong>{product.name}</strong><p>{product.descriptionShort || product.features.slice(0, 3).map((feature) => `${feature.name}: ${feature.value}`).join(" · ") || "No additional description supplied."}</p></div>
      <div className="rico-product-commercial"><strong>{formatMoney(product.price)}</strong><span>Net account price, ex VAT</span><em data-stock={product.quantity > 0 ? "available" : "backorder"}>{stockLabel(product.quantity)}</em><small>Updated {formatDate(product.dateUpdated)}</small></div>
      <div className="rico-product-actions"><button type="button" onClick={onAdd}>Add to list</button><button type="button" className="console-primary-action" onClick={onTicket}>Add to ticket</button></div>
    </article>
  );
}

async function apiRequest<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Sign in to use Filter Lookup.");
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error || "RICO request failed.");
  return payload.data as T;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"))) : "unknown";
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function stockLabel(quantity: number) {
  return quantity > 0 ? `${quantity} in stock` : "Available to back-order";
}
function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the RICO request.";
}
