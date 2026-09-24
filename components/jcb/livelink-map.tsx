"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import yard from "@/lib/fleet-operations/yard.json";
import "leaflet/dist/leaflet.css";
import { machineKey, machineBrand, partsRequestUrl, positionAge, type LinkedJcbMachine } from "@/lib/integrations/jcb/types";

export default function LiveLinkMap({ machines, selectedPin, onSelect, showYard=false, focusYard=false }: { showYard?:boolean; focusYard?:boolean; machines: LinkedJcbMachine[]; selectedPin: string | null; onSelect: (pin: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const select = useRef(onSelect);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { scrollWheelZoom: false }).setView([52.5, 0.9], 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    if(showYard){L.polygon(yard.geometry.coordinates[0].map(([lon,lat])=>[lat,lon] as [number,number]),{color:"#19846d",weight:2,fillOpacity:0.12}).addTo(instance).bindPopup("Garboldisham yard · inside = off hire");instance.setView([52.39159,0.95505],16);}
    map.current = instance;
    const currentMarkers = markers.current;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; currentMarkers.clear(); };
  }, [showYard]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    markers.current.forEach(marker => marker.remove()); markers.current.clear();
    const bounds = L.latLngBounds([]);
    if(showYard)yard.geometry.coordinates[0].forEach(([lon,lat])=>bounds.extend([lat,lon]));
    for (const machine of machines) {
      if (!machine.position) continue;
      const { latitude, longitude, at } = machine.position;
      const name = machine.relay?.machine_number || machine.equipmentId || machine.pin;
      const notCheckedIn = showYard && (!at || !Number.isFinite(Date.parse(at)) || Date.now() - Date.parse(at) > 24 * 3_600_000);
      const old = notCheckedIn || !at || Date.now() - Date.parse(at) > 48 * 3_600_000;
      const icon = L.divIcon({ className: "jcb-map-marker", html: `<span class="jcb-map-dot${old ? " jcb-map-dot-old" : machine.source === "takeuchi" ? " takeuchi-map-dot" : machine.source === "trackunit" ? " trackunit-map-dot" : ""}"></span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      const marker = L.marker([latitude, longitude], { icon, title: `${name} · ${machine.model} · ${notCheckedIn ? "Not checked in" : positionAge(at)}`, keyboard: true });
      const popup = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = `${name} · ${machineBrand(machine)} ${machine.model}`; popup.append(title);
      if (notCheckedIn) {
        const status = document.createElement("p"); status.textContent = "Not checked in — last known position only"; popup.append(status);
        const pinLabel = document.createElement("span"); pinLabel.textContent = `${name} · Not checked in`;
        marker.bindTooltip(pinLabel, { permanent: true, direction: "top", offset: [0, -15], className: "fo-unchecked-pin" });
      }
      const time = document.createElement("p"); time.textContent = `Last position: ${at ? new Date(at).toLocaleString() : "time unavailable"}`; popup.append(time);
      const button = document.createElement("button"); button.type = "button"; button.textContent = "View machine"; button.className = "jcb-popup-button";
      button.onclick = () => select.current(machineKey(machine)); popup.append(button);
      const href = partsRequestUrl(machine);
      if (href) { const link = document.createElement("a"); link.href = href; link.textContent = "Raise RELAY parts request"; link.className = "jcb-popup-button"; popup.append(link); }
      else { const note = document.createElement("p"); note.textContent = "An admin must link this machine to RELAY before a parts request can be prefilled."; popup.append(note); }
      marker.bindPopup(popup).on("click", () => select.current(machineKey(machine))).addTo(instance);
      markers.current.set(machineKey(machine), marker); if(!focusYard)bounds.extend([latitude, longitude]);
    }
    if (bounds.isValid()) instance.fitBounds(bounds, { padding: [40, 40], maxZoom: focusYard?17:14 });
  }, [machines,showYard,focusYard]);
  useEffect(() => {
    const marker = selectedPin ? markers.current.get(selectedPin) : null;
    if (marker) { marker.openPopup(); map.current?.panTo(marker.getLatLng()); }
  }, [selectedPin, machines]);
  return <div ref={container} className="jcb-map" aria-label="Fleet map. Select a machine marker to view it or raise a parts request." />;
}
