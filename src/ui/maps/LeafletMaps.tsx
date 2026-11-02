import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Region } from '../../catalog/types';
import { areaSearchable, tidySiteName, type DirectorySite, type MapArea } from '../../lib/diveSiteDirectory';
import { Icon } from '../icons/Icon';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const pinIcon = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [28, 28], iconAnchor: [14, 28] });
const directoryIcon = L.divIcon({ className: '', html: '<div class="pin-dir"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
  }, [map, bounds]);
  return null;
}

/** Distribution map: all catalog regions, the ones where the species occurs filled. */
export function RegionMap({ regions, activeIds }: { regions: Region[]; activeIds: string[] }) {
  const features = useMemo(
    () =>
      regions
        .filter((r) => r.geometry)
        .map((r) => ({
          type: 'Feature' as const,
          properties: { id: r.id, active: activeIds.includes(r.id) },
          geometry: r.geometry!,
        })),
    [regions, activeIds],
  );
  const data = useMemo(() => ({ type: 'FeatureCollection' as const, features }), [features]);
  return (
    <MapContainer className="map" center={[10, 80]} zoom={1} scrollWheelZoom={false} worldCopyJump attributionControl>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <GeoJSON
        key={activeIds.join(',')}
        data={data}
        style={(f) => ({
          color: f?.properties.active ? '#0b5f66' : '#7a8b91',
          weight: f?.properties.active ? 2 : 1,
          fillColor: f?.properties.active ? '#0e9aa3' : '#7a8b91',
          fillOpacity: f?.properties.active ? 0.45 : 0.06,
          dashArray: f?.properties.active ? undefined : '4 4',
        })}
      />
      <FitBounds bounds={[[-38, -8], [47, 240]]} />
    </MapContainer>
  );
}

export interface MapSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  subtitle?: string;
}

/** All dive sites as pins; tapping a popup link opens the site. */
export function SitesMap({ sites, onSelect }: { sites: MapSite[]; onSelect?: (id: string) => void }) {
  const bounds = useMemo<L.LatLngBoundsExpression | null>(
    () => (sites.length ? L.latLngBounds(sites.map((s) => [s.lat, s.lng] as [number, number])) : null),
    [sites],
  );
  return (
    <MapContainer className="map tall" center={[25, 35]} zoom={2} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {sites.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon} title={s.name}>
          <Popup>
            <strong>{s.name}</strong>
            {s.subtitle && <div>{s.subtitle}</div>}
            {onSelect && (
              <button className="btn small primary" style={{ marginTop: 6 }} onClick={() => onSelect(s.id)}>
                ›
              </button>
            )}
          </Popup>
        </Marker>
      ))}
      <FitBounds bounds={bounds} />
    </MapContainer>
  );
}

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 10));
  }, [map, lat, lng]);
  return null;
}

const toArea = (b: L.LatLngBounds): MapArea => ({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });

/** "Search this area" button on top of the map; enabled once the view is small enough. */
function AreaSearchButton({ onSearch, busy }: { onSearch: (area: MapArea) => void; busy: boolean }) {
  const { t } = useTranslation();
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState(() => toArea(map.getBounds()));
  // Hidden while a site's popup is open, so it never covers the popup.
  const [popupOpen, setPopupOpen] = useState(false);
  useMapEvents({
    moveend: () => setArea(toArea(map.getBounds())),
    popupopen: () => setPopupOpen(true),
    popupclose: () => setPopupOpen(false),
  });
  useEffect(() => {
    // Taps on the button must not reach the map (that would move the pin).
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  const ok = areaSearchable(area);
  return (
    <div className="map-overlay" ref={ref} hidden={popupOpen}>
      <button type="button" className={`btn small ${ok ? 'primary' : ''}`} disabled={!ok || busy} onClick={() => onSearch(area)}>
        <Icon name="search" />
        {busy ? t('sites.directoryLoading') : ok ? t('sites.searchArea') : t('sites.zoomInToSearch')}
      </button>
    </div>
  );
}

/** Draggable pin to place or correct a dive site; tap on the map moves it too. *//** Draggable pin to place or correct a dive site; tap on the map moves it too. */
export function LocationPicker({
  lat,
  lng,
  onChange,
  directorySites,
  describeSite,
  onPickSite,
  onSearchArea,
  searching = false,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Dive sites from the directory, shown as small rings; the popup offers to take one over. */
  directorySites?: DirectorySite[];
  describeSite?: (s: DirectorySite) => string;
  onPickSite?: (s: DirectorySite) => void;
  /** Shows the "search this area" button. */
  onSearchArea?: (area: MapArea) => void;
  searching?: boolean;
}) {
  const { t } = useTranslation();
  const has = lat != null && lng != null;
  return (
    <MapContainer className="map" center={has ? [lat, lng] : [25, 35]} zoom={has ? 11 : 2} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <ClickToMove onMove={onChange} />
      {onSearchArea && <AreaSearchButton onSearch={onSearchArea} busy={searching} />}
      {directorySites?.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={directoryIcon} title={tidySiteName(s.name)}>
          <Popup>
            <strong>{tidySiteName(s.name)}</strong>
            {describeSite && <div className="small">{describeSite(s)}</div>}
            {onPickSite && (
              <button type="button" className="btn small primary" style={{ marginTop: 8 }} onClick={() => onPickSite(s)}>
                <Icon name="check" />
                {t('sites.pickSite')}
              </button>
            )}
          </Popup>
        </Marker>
      ))}
      {has && (
        <>
          <Recenter lat={lat} lng={lng} />
          <Marker
            position={[lat, lng]}
            icon={pinIcon}
            title={t('sites.pinTitle')}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          />
        </>
      )}
    </MapContainer>
  );
}
