"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ConsoleIcon } from "@/components/console/console-icon";
import { useNotifications } from "@/components/notification-provider";
import { normalizeMachineNumber, type MachineRegistryRecord } from "@/lib/machine-registry";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";
import {
  extractRicoMachineModel,
  getRicoServiceIntervalHours,
} from "@/lib/integrations/rico/normalizers";
import type {
  RicoFleetFilter,
  RicoFleetMachineDetail,
  RicoFleetMachinePage,
  RicoFleetMachineSummary,
  RicoFleetOil,
  RicoFleetPartsPage,
} from "@/lib/integrations/rico/fleet-types";
import type { RicoProduct } from "@/lib/integrations/rico/types";

type LookupMode = "machine" | "part" | "crossref" | "list";
type CatalogueSource = "retail" | "fleet";
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
  const { isAdmin } = useNotifications();
  const [mode, setMode] = useState<LookupMode>("machine");
  const [catalogueSource, setCatalogueSource] = useState<CatalogueSource>("retail");
  const [machineQuery, setMachineQuery] = useState("");
  const [machines, setMachines] = useState<MachineRegistryRecord[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<MachineRegistryRecord | null>(null);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [partQuery, setPartQuery] = useState("");
  const [products, setProducts] = useState<RicoProduct[]>([]);
  const [fleetDetail, setFleetDetail] = useState<RicoFleetMachineDetail | null>(null);
  const [fleetPartResults, setFleetPartResults] = useState<RicoFleetFilter[]>([]);
  const [fleetOilResults, setFleetOilResults] = useState<RicoFleetOil[]>([]);
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
    if (!isAdmin || !selectedProduct) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .from("tickets")
      .select("id,job_number,machine_reference,request_summary,status")
      .in("status", [...activeTicketStatuses])
      .order("updated_at", { ascending: false })
      .limit(150)
      .then(({ data }) => setTickets((data ?? []) as OpenTicket[]));
  }, [isAdmin, selectedProduct]);

  const listTotal = useMemo(
    () => list.reduce((total, item) => total + item.product.price * item.quantity, 0),
    [list],
  );

  function resetLookupResults() {
    setProducts([]);
    setFleetDetail(null);
    setFleetPartResults([]);
    setFleetOilResults([]);
    setError("");
    setNotice("");
    setCheckedAt("");
  }

  function chooseMachine(machine: MachineRegistryRecord) {
    const searchableModel = extractRicoMachineModel(
      machine.model || machine.item_description,
      machine.make,
    );
    setSelectedMachine(machine);
    setMachineQuery(machine.machine_number);
    setMachines([]);
    setManufacturer(machine.make?.trim() ?? "");
    setModel(searchableModel);
    setProducts([]);
    setFleetDetail(null);
    setFleetPartResults([]);
    setFleetOilResults([]);
    setNotice("");
  }

  async function searchMachine() {
    if (catalogueSource === "fleet") {
      await searchFleetMachine();
      return;
    }
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
      setFleetDetail(null);
      setFleetPartResults([]);
      setFleetOilResults([]);
      setProducts(data.machines.flatMap((machine) => machine.kits));
      setCheckedAt(data.checkedAt);
      setMatchLabel("Direct machine match");
    } catch (searchError) {
      setError(messageFor(searchError));
    } finally {
      setIsLoading(false);
    }
  }

  async function searchFleetMachine() {
    const lookup = selectedMachine?.machine_number || machineQuery.trim() || model.trim();
    if (!lookup) {
      setError("Select a RELAY machine or enter a fleet number, serial or model.");
      return;
    }
    setIsLoading(true);
    setError("");
    setNotice("");
    setProducts([]);
    setFleetDetail(null);
    setFleetPartResults([]);
    setFleetOilResults([]);
    try {
      const fleetPage = await findFleetMachine({
        lookup,
        serial: selectedMachine?.serial_number ?? null,
        manufacturer: selectedMachine?.make || manufacturer,
        model: selectedMachine
          ? extractRicoMachineModel(
              selectedMachine.model || selectedMachine.item_description,
              selectedMachine.make,
            )
          : model,
      });
      const match = chooseFleetMatch(fleetPage.machines, lookup, selectedMachine?.serial_number);
      if (!match) {
        setCheckedAt(fleetPage.checkedAt);
        setMatchLabel("Our Fleet");
        setNotice("No matching machine was found in RICO Fleet Manager.");
        return;
      }
      const detail = await apiRequest<RicoFleetMachineDetail>(
        `/api/integrations/rico/fleet/${encodeURIComponent(match.machineRef || match.id)}`,
      );
      setFleetDetail(detail);
      setCheckedAt(detail.checkedAt);
      setMatchLabel("Verified fleet fitment");
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
      if (catalogueSource === "fleet") {
        const data = await apiRequest<RicoFleetPartsPage>(
          "/api/integrations/rico/fleet-parts?includeOils=1",
        );
        const query = normalizeFleetSearchValue(partQuery);
        const exactParts = data.parts.filter((part) =>
          compactFleetSearchValue(part.partNumber) === compactFleetSearchValue(partQuery)
        );
        const matchingParts = exactParts.length
          ? exactParts
          : data.parts.filter((part) =>
              normalizeFleetSearchValue([
                part.partNumber,
                part.description,
                part.catalogueDescription,
                part.filterType,
              ].filter(Boolean).join(" ")).includes(query)
            );
        const matchingOils = data.oils.filter((oil) =>
          normalizeFleetSearchValue([
            oil.partNumber,
            oil.applicationArea,
            oil.grade,
            oil.oilType,
          ].filter(Boolean).join(" ")).includes(query)
        );
        setProducts([]);
        setFleetDetail(null);
        setFleetPartResults(matchingParts.slice(0, 100));
        setFleetOilResults(matchingOils.slice(0, 100));
        setCheckedAt(data.checkedAt);
        setMatchLabel(exactParts.length ? "Exact fleet part match" : "Our Fleet match");
        if (searchMode === "crossref") {
          setNotice("Our Fleet searches fitted part numbers and descriptions; it does not infer a cross-reference.");
        }
        return;
      }
      const data = await apiRequest<{
        products: RicoProduct[];
        checkedAt: string;
        enteredReference: string;
        matchedQuery: string;
      }>(`/api/integrations/rico/cross-reference?q=${encodeURIComponent(partQuery.trim())}`);
      setFleetDetail(null);
      setFleetPartResults([]);
      setFleetOilResults([]);
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
          <p className="rico-kicker"><span /> RICO Europe live data</p>
          <h1>Filter Lookup</h1>
          <p>Choose reseller catalogue results or verified parts fitted across our own fleet.</p>
        </div>
        <div className="rico-live-note">
          <strong>Read-only integration</strong>
          <span>Pricing and stock are checked live. No order is created.</span>
        </div>
      </header>

      <div className="rico-source-switch" role="group" aria-label="RICO result source">
        <button
          type="button"
          aria-pressed={catalogueSource === "retail"}
          onClick={() => {
            setCatalogueSource("retail");
            resetLookupResults();
          }}
        >
          <span>RETAIL</span>
          <strong>Retail prices and results</strong>
          <small>Dropshipper catalogue and reseller pricing</small>
        </button>
        <button
          type="button"
          aria-pressed={catalogueSource === "fleet"}
          onClick={() => {
            setCatalogueSource("fleet");
            resetLookupResults();
          }}
        >
          <span>OUR FLEET</span>
          <strong>Verified fleet fitment</strong>
          <small>Filters, oils and custom kits for registered machines</small>
        </button>
      </div>

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
                    <span>{[
                      machine.make,
                      extractRicoMachineModel(machine.model || machine.item_description, machine.make),
                      machine.serial_number,
                    ].filter(Boolean).join(" · ")}</span>
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
            <ConsoleIcon name="search" className="h-4 w-4" />
            {catalogueSource === "fleet" ? "Search Our Fleet" : "Search Retail"}
          </button>
          {selectedMachine ? (
            <div className="rico-selected-machine">
              <strong>{selectedMachine.machine_number} verified in RELAY</strong>
              <span>{[
                selectedMachine.make,
                extractRicoMachineModel(
                  selectedMachine.model || selectedMachine.item_description,
                  selectedMachine.make,
                ),
              ].filter(Boolean).join(" ")}</span>
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
      {isLoading ? (
        <div className="rico-loading">
          {catalogueSource === "fleet"
            ? "Checking RICO Fleet Manager..."
            : "Checking the live RICO retail catalogue..."}
        </div>
      ) : null}

      {mode !== "list" && !isLoading ? (
        <div className="rico-results">
          <div className="rico-results-heading">
            <div>
              <h2>{catalogueSource === "fleet" ? "Our Fleet results" : "Retail results"}</h2>
              <span>
                {catalogueSource === "fleet"
                  ? fleetDetail
                    ? `${fleetDetail.filters.length} filters · ${fleetDetail.oils.length} oils · ${fleetDetail.kits.length} kits`
                    : `${fleetPartResults.length + fleetOilResults.length} parts`
                  : `${products.length} products`}
              </span>
            </div>
            {checkedAt ? <p>Checked {formatDateTime(checkedAt)}</p> : null}
          </div>
          {catalogueSource === "fleet" ? (
            fleetDetail ? (
              <FleetMachineResult detail={fleetDetail} />
            ) : fleetPartResults.length || fleetOilResults.length ? (
              <FleetPartResults parts={fleetPartResults} oils={fleetOilResults} />
            ) : (
              <div className="rico-empty">
                <h3>No fleet parts to display</h3>
                <p>Select a registered machine or search a fitted part number or description.</p>
              </div>
            )
          ) : products.length ? products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                matchLabel={matchLabel}
                onAdd={() => addToList(product)}
                onTicket={isAdmin ? () => setSelectedProduct(product) : undefined}
              />
            )) : (
              <div className="rico-empty">
                <h3>No products to display</h3>
                <p>Choose a machine or enter a part reference to search the approved retail catalogue.</p>
              </div>
            )}
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
              {isAdmin ? <button type="button" onClick={() => setSelectedProduct(item.product)}>Add to ticket</button> : null}
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

async function findFleetMachine(options: {
  lookup: string;
  serial: string | null;
  manufacturer: string;
  model: string;
}) {
  const searches: URLSearchParams[] = [];
  searches.push(new URLSearchParams({ fleetNumber: options.lookup, limit: "25" }));
  if (options.serial?.trim()) {
    searches.push(new URLSearchParams({ serial: options.serial.trim(), limit: "25" }));
  }
  searches.push(new URLSearchParams({ q: options.lookup, limit: "25" }));
  if (options.model.trim()) {
    searches.push(new URLSearchParams({
      q: options.model.trim(),
      manufacturer: options.manufacturer.trim(),
      limit: "25",
    }));
  }

  let latest: RicoFleetMachinePage | null = null;
  for (const params of searches) {
    latest = await apiRequest<RicoFleetMachinePage>(
      `/api/integrations/rico/fleet?${params}`,
    );
    if (latest.machines.length) return latest;
  }
  return latest ?? {
    customer: "",
    total: 0,
    count: 0,
    offset: 0,
    machines: [],
    checkedAt: new Date().toISOString(),
  };
}

function chooseFleetMatch(
  machines: RicoFleetMachineSummary[],
  lookup: string,
  serial?: string | null,
) {
  const normalizedLookup = normalizeMachineNumber(lookup);
  const normalizedSerial = normalizeMachineNumber(serial ?? "");
  return machines.find((machine) => {
    const references = [
      machine.machineRef,
      machine.fleetNumber,
      machine.serialNumber,
      ...machine.units.flatMap((unit) => [unit.fleetNumber, unit.serialNumber]),
    ].filter(Boolean).map((value) => normalizeMachineNumber(value ?? ""));
    return references.includes(normalizedLookup)
      || Boolean(normalizedSerial && references.includes(normalizedSerial));
  }) ?? machines[0] ?? null;
}

function FleetMachineResult({ detail }: { detail: RicoFleetMachineDetail }) {
  const machine = detail.machine;
  return (
    <div className="rico-fleet-detail">
      <section className="rico-fleet-machine-summary">
        <FleetImage url={machine.imageUrl} alt={machine.label} />
        <div>
          <span className="rico-source-badge">Our Fleet</span>
          <span className="rico-kit-badge">Verified fitment</span>
          <h3>{machine.machineRef}</h3>
          <strong>{machine.label || [machine.manufacturer, machine.model].filter(Boolean).join(" ")}</strong>
          <p>{[
            machine.type,
            machine.engine,
            machine.year,
          ].filter(Boolean).join(" · ") || "No additional machine details supplied."}</p>
        </div>
        <dl>
          <div><dt>Fleet number</dt><dd>{machine.fleetNumber || fleetUnitValues(detail, "fleetNumber") || "Not recorded"}</dd></div>
          <div><dt>Serial</dt><dd>{machine.serialNumber || fleetUnitValues(detail, "serialNumber") || "Not recorded"}</dd></div>
          <div><dt>Fleet owner</dt><dd>{detail.customer || "Our Fleet"}</dd></div>
        </dl>
      </section>

      <FleetKits kits={detail.kits} />

      <section className="rico-fleet-section">
        <header>
          <div><h3>Individual filters and parts</h3><span>{detail.filters.length} fitted items</span></div>
          <p>Verified fitment and live fleet-account terms</p>
        </header>
        <FleetFilterTable parts={detail.filters} />
      </section>

      <section className="rico-fleet-section">
        <header>
          <div><h3>Oils</h3><span>{detail.oils.length} applications</span></div>
          <p>Quantities and grades from Fleet Manager</p>
        </header>
        <FleetOilTable oils={detail.oils} />
      </section>
    </div>
  );
}

function FleetKits({ kits }: { kits: RicoFleetMachineDetail["kits"] }) {
  return (
    <section className="rico-fleet-section">
      <header>
        <div><h3>Service kits</h3><span>{kits.length} configured kits</span></div>
        <p>Each kit is broken down into its individual filter part numbers</p>
      </header>
      {kits.length ? (
        <div className="rico-fleet-kits">
          {kits.map((kit) => (
            <article key={`${kit.kitPartNumber}-${kit.serviceInterval ?? ""}`}>
              <header>
                <div>
                  <span>{kit.serviceInterval || "Service kit"}</span>
                  <h4>{kit.kitPartNumber}</h4>
                  <small>{kit.source === "customer" ? "Custom fleet kit" : "RICO service kit"}</small>
                </div>
                <div>
                  <strong>{formatNullableMoney(kit.price)}</strong>
                  <em>{fleetStockLabel(kit.freeStock)}</em>
                </div>
              </header>
              <div className="rico-fleet-kit-components">
                {kit.filters.length ? kit.filters.map((filter) => (
                  <div key={`${kit.kitPartNumber}-${filter.partNumber}`}>
                    <strong>{filter.partNumber}</strong>
                    <span>{filter.description || "Filter component"}</span>
                  </div>
                )) : <p>No component breakdown supplied for this kit.</p>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="rico-fleet-subempty">No service kits configured for this machine.</div>}
    </section>
  );
}

function FleetPartResults({ parts, oils }: { parts: RicoFleetFilter[]; oils: RicoFleetOil[] }) {
  return (
    <div className="rico-fleet-detail">
      <section className="rico-fleet-section">
        <header>
          <div><h3>Fleet parts</h3><span>{parts.length} matches</span></div>
          <p>Parts fitted across machines in our Fleet Manager account</p>
        </header>
        <FleetFilterTable parts={parts} />
      </section>
      {oils.length ? (
        <section className="rico-fleet-section">
          <header>
            <div><h3>Fleet oils</h3><span>{oils.length} matches</span></div>
          </header>
          <FleetOilTable oils={oils} />
        </section>
      ) : null}
    </div>
  );
}

function FleetFilterTable({ parts }: { parts: RicoFleetFilter[] }) {
  if (!parts.length) return <div className="rico-fleet-subempty">No individual filters recorded.</div>;
  return (
    <div className="rico-fleet-table-wrap">
      <table className="rico-fleet-table">
        <thead><tr><th>Part</th><th>Description</th><th>Type</th><th>Fitment</th><th>Bin</th><th>Price</th><th>Stock</th></tr></thead>
        <tbody>
          {parts.map((part) => (
            <tr key={`${part.partNumber}-${part.filterType ?? ""}`}>
              <td><div className="rico-fleet-part-ref"><FleetImage url={part.imageUrl} alt={part.description} /><strong>{part.partNumber}</strong></div></td>
              <td>{part.catalogueDescription || part.description || "No description"}</td>
              <td>{part.filterType || part.category || "Part"}</td>
              <td><span className={part.verified ? "rico-verified-badge" : "rico-unverified-badge"}>{part.verified ? "Verified" : "Recorded"}</span></td>
              <td>{part.bin || "—"}</td>
              <td>{formatNullableMoney(part.price)}</td>
              <td>{fleetStockLabel(part.freeStock)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FleetOilTable({ oils }: { oils: RicoFleetOil[] }) {
  if (!oils.length) return <div className="rico-fleet-subempty">No oils recorded.</div>;
  return (
    <div className="rico-fleet-table-wrap">
      <table className="rico-fleet-table">
        <thead><tr><th>Part</th><th>Application</th><th>Grade</th><th>Quantity</th><th>Price</th><th>Stock</th></tr></thead>
        <tbody>
          {oils.map((oil) => (
            <tr key={`${oil.partNumber}-${oil.applicationArea ?? ""}`}>
              <td><strong>{oil.partNumber}</strong></td>
              <td>{oil.applicationArea || oil.oilType || "Oil"}</td>
              <td>{oil.grade || "—"}</td>
              <td>{[oil.quantity, oil.unit].filter(Boolean).join(" ") || "—"}</td>
              <td>{formatNullableMoney(oil.price)}</td>
              <td>{fleetStockLabel(oil.freeStock)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FleetImage({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="rico-fleet-image">
      {url && !failed ? (
        <Image
          src={url}
          alt={alt}
          width={56}
          height={56}
          sizes="56px"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : <ConsoleIcon name="parts" className="h-5 w-5" />}
    </span>
  );
}

function fleetUnitValues(
  detail: RicoFleetMachineDetail,
  field: "fleetNumber" | "serialNumber",
) {
  return Array.from(new Set(detail.units.map((unit) => unit[field]).filter(Boolean))).join(", ");
}

function normalizeFleetSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compactFleetSearchValue(value: string) {
  return normalizeFleetSearchValue(value).replace(/[\s\-_/\\.]+/g, "");
}

function ProductRow({ product, matchLabel, onAdd, onTicket }: { product: RicoProduct; matchLabel: string; onAdd: () => void; onTicket?: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = product.images.find((item) => item.cover) ?? product.images[0];
  const kitType = product.features.find((feature) =>
    feature.name.trim().toLowerCase() === "kit type"
  )?.value;
  const serviceIntervalHours = getRicoServiceIntervalHours(kitType);
  const isServiceKit = Boolean(kitType || /service kit/i.test(product.name));
  const summary = product.descriptionShort
    || product.features.slice(0, 3).map((feature) => `${feature.name}: ${feature.value}`).join(" · ")
    || "No additional description supplied.";
  return (
    <article className="rico-product-row">
      <div className="rico-product-image">
        {image && !imageFailed ? (
          <Image
            src={image.url}
            alt={`${product.name} product`}
            width={72}
            height={72}
            sizes="72px"
            unoptimized
            onError={() => setImageFailed(true)}
          />
        ) : (
          <ConsoleIcon name="parts" className="h-7 w-7" />
        )}
      </div>
      <div className="rico-product-main">
        <div>
          <span className="rico-source-badge">Retail catalogue</span>
          <span className="rico-match-badge">{matchLabel}</span>
          {kitType ? <span className="rico-kit-badge">{kitType}</span> : null}
        </div>
        <h3>{product.reference}</h3>
        <strong>{product.name}</strong>
        <p>{summary}</p>
        {isServiceKit ? (
          <div className="rico-kit-facts">
            <span>Kit coverage: {kitType || "Not specified"}</span>
            <span>
              Service interval: {serviceIntervalHours ? `${serviceIntervalHours}h` : "Not specified"}
            </span>
          </div>
        ) : null}
        {isServiceKit && product.descriptionItems.length > 1 ? (
          <div className="rico-kit-contents">
            <span>Kit contents</span>
            <ul>
              {product.descriptionItems.map((item, index) => (
                <li key={`${product.id}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="rico-product-commercial"><strong>{formatMoney(product.price)}</strong><span>Net account price, ex VAT</span><em data-stock={product.quantity > 0 ? "available" : "backorder"}>{stockLabel(product.quantity)}</em><small>Updated {formatDate(product.dateUpdated)}</small></div>
      <div className="rico-product-actions"><button type="button" onClick={onAdd}>Add to list</button>{onTicket ? <button type="button" className="console-primary-action" onClick={onTicket}>Add to ticket</button> : null}</div>
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
function formatNullableMoney(value: number | null) {
  return value === null ? "Ask RICO" : formatMoney(value);
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
function fleetStockLabel(quantity: number | null) {
  if (quantity === null) return "Ask RICO";
  return quantity > 0 ? `${quantity} available` : "Out of stock";
}
function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the RICO request.";
}
