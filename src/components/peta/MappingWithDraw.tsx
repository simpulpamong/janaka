/**
 * MappingWithDraw — Peta reklame interaktif dengan fitur coretan.
 *
 * • Leaflet via CDN inject (window.L + leaflet.draw) — tidak butuh react-leaflet.
 * • Dark mode pakai class `.dark` pada <html> (bukan @media prefers-color-scheme).
 * • Layout kontrol persis sipedas: header bar, navigasi kiri atas, layer kanan atas,
 *   draw panel kanan bawah, legenda kiri bawah.
 * • z-index Leaflet di-cap supaya tidak menutupi AkunDropdown (z-[93]).
 */
import { useEffect, useRef, useState, useCallback } from "react"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Eraser,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Paintbrush,
  Plus,
  Route,
  Save,
} from "lucide-react"
import { cn } from "@/lib/cn"

declare const window: any

/* ─── Tipe ─────────────────────────────────────────────────────────────── */

interface ReklamePoint {
  id: string
  sumber: "PTSP" | "JANAKA"
  nama: string
  alamat: string
  lat: number
  lng: number
  status: string
  statusDetail?: string
  noSK?: string
  jenisReklame?: string
  dimensi?: string
  sudahDieksekusi: boolean
  jumlahLaporan?: number
}

interface MappingWithDrawProps {
  items: ReklamePoint[]
  /** Jumlah titik setelah filter — ditampilkan di panel legenda. */
  totalTitik?: number
  height?: number | string
  onSaveDrawings?: (geojson: object) => Promise<void>
  onClearDrawings?: () => Promise<void>
  onDetailClick?: (item: ReklamePoint) => void
  /**
   * Dipanggil saat tombol "Lihat Lokasi" di popup ditekan.
   *
   * Dulu tombol itu `<a target="_blank">` yang membuka Google Maps di tab
   * baru — satu-satunya tautan di aplikasi ini yang benar-benar melempar
   * petugas keluar dari sistem. Sekarang perambahnya lewat callback, dan
   * pemanggil menampilkannya di modal tertanam.
   */
  onLokasiClick?: (item: ReklamePoint) => void
}

/* ─── Konstanta ─────────────────────────────────────────────────────────── */

const PONOROGO_CENTER: [number, number] = [-7.876, 111.46]
const PONOROGO_ZOOM = 12

const TILE_LAYERS: Record<string, { url: string; attr: string; label: string; maxZoom: number }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "© OpenStreetMap",
    label: "OSM",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri",
    label: "Satelit",
    maxZoom: 19,
  },
  hybrid: {
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attr: "Google",
    label: "Hybrid",
    maxZoom: 20,
  },
  google_sat: {
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attr: "Google",
    label: "G.Sat",
    maxZoom: 20,
  },
}

const WARNA_PRESET = [
  { hex: "#1e6fd9", lbl: "Biru" },
  { hex: "#c0392b", lbl: "Merah" },
  { hex: "#0d9268", lbl: "Hijau" },
  { hex: "#d97706", lbl: "Kuning" },
  { hex: "#7c3aed", lbl: "Ungu" },
  { hex: "#0891b2", lbl: "Tosca" },
  { hex: "#e67e22", lbl: "Oranye" },
  { hex: "#e91e63", lbl: "Pink" },
]

const STATUS_WARNA: Record<string, string> = {
  Aktif: "#22c55e",
  "Akan Habis": "#f59e0b",
  Kadaluarsa: "#ef4444",
  "Tidak Berizin": "#a855f7",
}

/* ─── Leaflet CDN inject ────────────────────────────────────────────────── */

function ensureLeafletLoaded(cb: () => void) {
  if (window.L && window.L.Draw) { cb(); return }

  const injectStyle = (href: string, id: string) => {
    if (document.getElementById(id)) return
    const el = document.createElement("link")
    el.id = id; el.rel = "stylesheet"; el.href = href
    document.head.appendChild(el)
  }
  const injectScript = (src: string, onLoad: () => void) => {
    const el = document.createElement("script")
    el.src = src; el.onload = onLoad
    document.head.appendChild(el)
  }

  injectStyle("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css", "lf-css")
  injectStyle("https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css", "lf-draw-css")

  if (!window.L) {
    injectScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js", () => {
      injectScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js", cb)
    })
  } else {
    injectScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js", cb)
  }
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Buat kontras area dalam dan luar kabupaten memakai batas GeoJSON lokal. */
function buatLayerBatasPonorogo(L: any, data: any, map: any) {
  const features = data?.type === "FeatureCollection"
    ? data.features
    : data?.type === "Feature" ? [data] : [{ type: "Feature", geometry: data, properties: {} }]
  const polygons: any[] = []

  for (const feature of features ?? []) {
    const geometry = feature?.geometry
    if (geometry?.type === "Polygon") polygons.push(geometry.coordinates)
    else if (geometry?.type === "MultiPolygon") polygons.push(...geometry.coordinates)
  }

  const ringsLuar: [number, number][][] = polygons.flatMap((polygon) => {
    const ring = polygon?.[0]
    if (!Array.isArray(ring) || ring.length < 4) return []
    return [ring.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])]
  })
  if (ringsLuar.length === 0) throw new Error("Batas Kabupaten Ponorogo tidak ditemukan di GeoJSON")

  // Bingkai luas di sekitar peta menjaga area luar tetap teduh saat pengguna
  // menggeser atau memperbesar peta di sekitar Ponorogo.
  const bounds = map.getBounds().pad(20)
  const baratDaya = bounds.getSouthWest()
  const timurLaut = bounds.getNorthEast()
  const bingkai: [number, number][] = [
    [baratDaya.lat, baratDaya.lng],
    [baratDaya.lat, timurLaut.lng],
    [timurLaut.lat, timurLaut.lng],
    [timurLaut.lat, baratDaya.lng],
    [baratDaya.lat, baratDaya.lng],
  ]

  const layer = L.featureGroup()
  layer.addLayer(L.polygon([bingkai, ...ringsLuar], {
    pane: "janaka-mask-pane",
    renderer: L.canvas({ padding: 0.5, pane: "janaka-mask-pane" }),
    stroke: false,
    fill: true,
    fillColor: "#0f172a",
    fillOpacity: 0.2,
    fillRule: "evenodd",
    interactive: false,
  }))

  const renderer = L.canvas({ padding: 0.5, pane: "janaka-boundary-pane" })
  layer.addLayer(L.geoJSON(data, {
    pane: "janaka-boundary-pane",
    renderer,
    smoothFactor: 2.5,
    interactive: false,
    style: { color: "#34d399", weight: 0, fillColor: "#34d399", fillOpacity: 0.1 },
  }))
  layer.addLayer(L.geoJSON(data, {
    pane: "janaka-boundary-pane",
    renderer,
    smoothFactor: 2.5,
    interactive: false,
    style: { color: "#ffffff", weight: 5, opacity: 0.9, fill: false },
  }))
  layer.addLayer(L.geoJSON(data, {
    pane: "janaka-boundary-pane",
    renderer,
    smoothFactor: 2.5,
    interactive: false,
    style: { color: "#e11d48", weight: 2.5, opacity: 1, fill: false },
  }))

  return layer
}

/* ─── CSS global Leaflet (injected once) ────────────────────────────────── */

const LEAFLET_CSS = `
  /* ── Cap z-index Leaflet agar tidak menutup AkunDropdown (z-93) ── */
  .leaflet-pane         { z-index: 400 !important; }
  .leaflet-janaka-mask-pane { z-index: 390 !important; }
  .leaflet-janaka-boundary-pane { z-index: 410 !important; }
  .leaflet-tile-pane    { z-index: 200 !important; }
  .leaflet-overlay-pane { z-index: 400 !important; }
  .leaflet-shadow-pane  { z-index: 500 !important; }
  .leaflet-marker-pane  { z-index: 600 !important; }
  .leaflet-tooltip-pane { z-index: 650 !important; }
  .leaflet-popup-pane   { z-index: 700 !important; }

  /* ── Popup light mode ── */
  .leaflet-popup-content-wrapper {
    background: #ffffff !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 24px rgba(0,0,0,.12) !important;
    border: 1px solid #e2e8f0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
  .leaflet-popup-content {
    margin: 11px 14px !important;
    font-size: .76rem !important;
    line-height: 1.6 !important;
    color: #0f172a !important;
  }
  .leaflet-popup-tip-container { display: none !important; }
  .leaflet-popup-close-button { color: #94a3b8 !important; top: 6px !important; right: 8px !important; font-size: 16px !important; background: transparent !important; }
  .leaflet-popup-close-button:hover { color: #ef4444 !important; }

  /* ── Popup dark mode — pakai .dark pada <html> ── */
  html.dark .leaflet-popup-content-wrapper {
    background: #1e293b !important;
    border-color: #334155 !important;
    box-shadow: 0 4px 24px rgba(0,0,0,.5) !important;
  }
  html.dark .leaflet-popup-content { color: #e2e8f0 !important; }
  html.dark .leaflet-popup-close-button { color: #64748b !important; }
  html.dark .leaflet-popup-close-button:hover { color: #f87171 !important; }

  /* ── Scale control ── */
  .leaflet-control-scale-line {
    border-color: #94a3b8 !important;
    color: #64748b !important;
    font-size: .6rem !important;
  }
  html.dark .leaflet-control-scale-line {
    border-color: #475569 !important;
    color: #94a3b8 !important;
    background: #1e293b !important;
  }

  /* ── Sembunyikan toolbar draw bawaan Leaflet ── */
  .leaflet-draw { display: none !important; }

  /* ── Cursor saat mode gambar aktif ── */
  .janaka-map-drawing { cursor: crosshair !important; }

  /* ── Popup custom styles ── */
  .janaka-btn-detail {
    transition: all 0.15s ease !important;
  }
  .janaka-btn-detail:hover {
    background: #1d4ed8 !important;
  }
  .janaka-btn-maps {
    transition: all 0.15s ease !important;
  }
  .janaka-btn-maps:hover {
    background: #e2e8f0 !important;
    color: #0f172a !important;
  }
  html.dark .janaka-btn-maps {
    background: #334155 !important;
    color: #f1f5f9 !important;
    border-color: #475569 !important;
  }
  html.dark .janaka-btn-maps:hover {
    background: #475569 !important;
    color: #ffffff !important;
  }
  html.dark .popup-title {
    color: #f8fafc !important;
  }
  html.dark .popup-sub {
    color: #94a3b8 !important;
  }
  html.dark .popup-box {
    background: rgba(15, 23, 42, 0.6) !important;
    border-color: #334155 !important;
  }
`

/* ─── Komponen utama ────────────────────────────────────────────────────── */

export function MappingWithDraw({
  items,
  totalTitik,
  height = 680,
  onSaveDrawings,
  onClearDrawings,
  onDetailClick,
  onLokasiClick,
}: MappingWithDrawProps) {
  const mapRef             = useRef<any>(null)
  const currentBaseRef     = useRef<any>(null)
  const drawnItemsRef      = useRef<any>(null)
  const markerRendererRef  = useRef<any>(null)
  const boundaryLayerRef   = useRef<any>(null)
  const drawControlRef     = useRef<any>(null)
  const activeDrawRef      = useRef<any>(null)
  const locateMarkerRef    = useRef<any>(null)
  const locateCircleRef    = useRef<any>(null)

  const [isMapReady,     setIsMapReady]     = useState(false)
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [isNavOpen,      setIsNavOpen]      = useState(false)
  const [isLayerOpen,    setIsLayerOpen]    = useState(false)
  const [isDrawOpen,     setIsDrawOpen]     = useState(false)
  const [isLegendOpen,   setIsLegendOpen]   = useState(false)
  const [activeBase,     setActiveBase]     = useState("osm")
  const [activeDrawMode, setActiveDrawMode] = useState<"polyline" | "polygon" | null>(null)
  const [drawings,       setDrawings]       = useState<any[]>([])
  const [saving,         setSaving]         = useState(false)

  /* ── Meta overlay setelah menggambar ── */
  const [showMeta,    setShowMeta]    = useState(false)
  const [pendingLayer,setPendingLayer]= useState<any>(null)
  const [pendingType, setPendingType] = useState<string>("")
  const [metaNama,    setMetaNama]    = useState("")
  const [metaKet,     setMetaKet]     = useState("")
  const [metaWarna,   setMetaWarna]   = useState("#1e6fd9")
  const [measureText, setMeasureText] = useState("")

  /* ── Inject CSS global sekali ── */
  useEffect(() => {
    const id = "janaka-leaflet-global-css"
    if (document.getElementById(id)) return
    const style = document.createElement("style")
    style.id = id
    style.textContent = LEAFLET_CSS
    document.head.appendChild(style)
  }, [])

  /* ── Listener tombol dari Leaflet Popup ──
   *
   * Isi popup disusun sebagai HTML string, jadi tombolnya tidak bisa
   * menangkap `onClick` React. Jembatan lewat `window` adalah satu-satunya
   * jalan; polanya sama untuk Detail dan Lokasi.
   */
  useEffect(() => {
    ;(window as any).__janakaDetail = (id: string) => {
      const found = items.find((it) => it.id === id)
      if (found && onDetailClick) {
        onDetailClick(found)
      }
    }
    ;(window as any).__janakaLokasi = (id: string) => {
      const found = items.find((it) => it.id === id)
      if (found && onLokasiClick) {
        onLokasiClick(found)
      }
    }
    return () => {
      try {
        delete (window as any).__janakaDetail
        delete (window as any).__janakaLokasi
      } catch {
        /* ignore */
      }
    }
  }, [items, onDetailClick])

  /* ── Init Leaflet ── */
  useEffect(() => {
    ensureLeafletLoaded(() => {
      const L = window.L
      const container = document.getElementById("janaka-map-div")
      if (!container) return

      if (mapRef.current) {
        try { mapRef.current.off(); mapRef.current.remove() } catch { /* ignore */ }
        mapRef.current = null
      }

      const map = L.map("janaka-map-div", {
        center: PONOROGO_CENTER,
        zoom: PONOROGO_ZOOM,
        zoomControl: false,
        attributionControl: true,
        zoomAnimation: true,
        markerZoomAnimation: true,
        fadeAnimation: true,
      })
      mapRef.current = map

      const boundaryPane = map.createPane("janaka-boundary-pane")
      boundaryPane.style.zIndex = "410"
      boundaryPane.style.pointerEvents = "none"
      const maskPane = map.createPane("janaka-mask-pane")
      maskPane.style.zIndex = "405"
      maskPane.style.pointerEvents = "none"
      markerRendererRef.current = L.canvas({ padding: 0.5, pane: "markerPane" })

      /* Basemap awal */
      const tile = TILE_LAYERS.osm
      currentBaseRef.current = L.tileLayer(tile.url, {
        attribution: tile.attr,
        maxZoom: tile.maxZoom,
        crossOrigin: true,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 2,
      }).addTo(map)

      /* Skala */
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map)

      /* Feature group untuk coretan */
      const drawnItems = new L.FeatureGroup().addTo(map)
      drawnItemsRef.current = drawnItems

      /* Kontrol draw (toolbar bawaan disembunyikan via CSS) */
      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polyline: { shapeOptions: { color: "#1e6fd9", weight: 3, opacity: 0.9, dashArray: "6 4" } },
          polygon: {
            allowIntersection: false, showArea: false,
            shapeOptions: { color: "#7c3aed", weight: 2.5, opacity: 1, fillColor: "#7c3aed", fillOpacity: 0.12 },
          },
          rectangle: false, circle: false, marker: false, circlemarker: false,
        },
        edit: { featureGroup: drawnItems, remove: true },
      })
      drawControlRef.current = drawControl
      drawControl.addTo(map)

      /* Event: shape selesai digambar */
      map.on(L.Draw.Event.CREATED, (e: any) => {
        const layer = e.layer
        map.addLayer(layer)
        setPendingLayer(layer)
        setPendingType(e.layerType)
        setMetaNama(""); setMetaKet(""); setMetaWarna("#1e6fd9")

        try {
          if (e.layerType === "polyline") {
            const latlngs = layer.getLatLngs()
            let dist = 0
            for (let i = 0; i < latlngs.length - 1; i++) dist += latlngs[i].distanceTo(latlngs[i + 1])
            setMeasureText(`Panjang Rute: ${Math.round(dist)} meter`)
          } else {
            const area = L.GeometryUtil?.geodesicArea?.(layer.getLatLngs()[0]) ?? 0
            setMeasureText(`Luas Area: ${Math.round(area)} m²`)
          }
        } catch { setMeasureText("") }

        if (activeDrawRef.current) {
          try { activeDrawRef.current.disable() } catch { /* ignore */ }
          activeDrawRef.current = null
        }
        setActiveDrawMode(null)
        document.getElementById("janaka-map-div")?.classList.remove("janaka-map-drawing")
        setShowMeta(true)
      })

      renderMarkers(map, L, items, markerRendererRef.current)

      setTimeout(() => {
        mapRef.current?.invalidateSize({ animate: false })
        setIsMapReady(true)
      }, 100)
    })

    return () => {
      setIsMapReady(false)
      if (mapRef.current) {
        try { mapRef.current.off(); mapRef.current.remove() } catch { /* ignore */ }
        mapRef.current = null
      }
      locateMarkerRef.current = null; locateCircleRef.current = null
      drawnItemsRef.current = null; drawControlRef.current = null
      activeDrawRef.current = null; currentBaseRef.current = null
      markerRendererRef.current = null; boundaryLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Batas kabupaten dibaca dari GeoJSON lokal dan dirender sekali saja. */
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.L || boundaryLayerRef.current) return
    const map = mapRef.current
    const L = window.L
    let aktif = true

    void fetch("/assets/ponorogo.geojson", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((dataGeojson) => {
        if (!aktif || mapRef.current !== map) return
        boundaryLayerRef.current = buatLayerBatasPonorogo(L, dataGeojson, map).addTo(map)
      })
      .catch((error) => console.warn("[Mapping] Gagal memuat batas Ponorogo:", error))

    return () => {
      aktif = false
      if (boundaryLayerRef.current && mapRef.current === map) {
        map.removeLayer(boundaryLayerRef.current)
        boundaryLayerRef.current = null
      }
    }
  }, [isMapReady])

  /* ── Re-render markers saat items berubah ── */
  useEffect(() => {
    if (!mapRef.current || !window.L || !isMapReady) return
    const L = window.L; const map = mapRef.current
    map.eachLayer((layer: any) => {
      if (layer instanceof L.CircleMarker && layer !== locateMarkerRef.current
        && (!drawnItemsRef.current || !drawnItemsRef.current.hasLayer(layer)))
        map.removeLayer(layer)
    })
    renderMarkers(map, L, items, markerRendererRef.current)
  }, [items, isMapReady])

  /* ── Ganti basemap ── */
  const gantiBasemap = useCallback((id: string) => {
    if (!mapRef.current || !window.L) return
    const L = window.L; const conf = TILE_LAYERS[id]; if (!conf) return
    if (currentBaseRef.current) mapRef.current.removeLayer(currentBaseRef.current)
    currentBaseRef.current = L.tileLayer(conf.url, {
      attribution: conf.attr,
      maxZoom: conf.maxZoom,
      crossOrigin: true,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(mapRef.current)
    setActiveBase(id)
    setIsLayerOpen(false)
  }, [])

  /* ── Mulai gambar ── */
  const mulaiGambar = useCallback((type: "polyline" | "polygon") => {
    const L = window.L; if (!L || !mapRef.current) return
    const mapDiv = document.getElementById("janaka-map-div")

    if (activeDrawMode === type) {
      if (activeDrawRef.current) { try { activeDrawRef.current.disable() } catch { /* ignore */ } activeDrawRef.current = null }
      setActiveDrawMode(null)
      mapDiv?.classList.remove("janaka-map-drawing")
      return
    }

    if (activeDrawRef.current) { try { activeDrawRef.current.disable() } catch { /* ignore */ } activeDrawRef.current = null }

    const handler = type === "polyline"
      ? new L.Draw.Polyline(mapRef.current, { shapeOptions: { color: metaWarna, weight: 3, opacity: 0.9, dashArray: "6 4" } })
      : new L.Draw.Polygon(mapRef.current, {
          allowIntersection: false, showArea: false,
          shapeOptions: { color: "#7c3aed", weight: 2.5, opacity: 1, fillColor: "#7c3aed", fillOpacity: 0.12 },
        })

    activeDrawRef.current = handler
    handler.enable()
    setActiveDrawMode(type)
    mapDiv?.classList.add("janaka-map-drawing")
  }, [activeDrawMode, metaWarna])

  /* ── Simpan meta gambar ── */
  const simpanMeta = useCallback(() => {
    if (!pendingLayer || !metaNama.trim()) return
    const col = metaWarna
    ;(pendingLayer as any)._janakaMeta = { nama: metaNama.trim(), ket: metaKet.trim(), warna: col, tipe: pendingType, ukuran: measureText }
    if (pendingType === "polyline") pendingLayer.setStyle?.({ color: col, weight: 3, opacity: 0.9, dashArray: "6 4" })
    else pendingLayer.setStyle?.({ color: col, fillColor: col, fillOpacity: 0.12, weight: 2.5 })
    pendingLayer.bindPopup(`
      <div style="min-width:160px">
        <strong style="font-size:.8rem">${esc(metaNama.trim())}</strong><br>
        <span style="font-size:.65rem;color:#64748b">${pendingType === "polyline" ? "Garis / Rute" : "Area / Zona"}</span>
        ${measureText ? `<br><span style="font-size:.68rem;font-weight:700;color:${col}">${esc(measureText)}</span>` : ""}
        ${metaKet ? `<br><span style="font-size:.68rem">${esc(metaKet)}</span>` : ""}
      </div>
    `)
    if (drawnItemsRef.current) drawnItemsRef.current.addLayer(pendingLayer)
    setDrawings(prev => [...prev, pendingLayer])
    setShowMeta(false); setPendingLayer(null); setMeasureText("")
  }, [pendingLayer, metaNama, metaKet, metaWarna, pendingType, measureText])

  const batalMeta = useCallback(() => {
    if (pendingLayer && mapRef.current) { try { mapRef.current.removeLayer(pendingLayer) } catch { /* ignore */ } }
    setShowMeta(false); setPendingLayer(null); setMeasureText("")
  }, [pendingLayer])

  /* ── Simpan ke server ── */
  const simpanSemua = useCallback(async () => {
    if (!drawnItemsRef.current || !onSaveDrawings) return
    setSaving(true)
    try { await onSaveDrawings(drawnItemsRef.current.toGeoJSON()) } finally { setSaving(false) }
  }, [onSaveDrawings])

  const hapusSemua = useCallback(async () => {
    if (!drawnItemsRef.current) return
    drawnItemsRef.current.clearLayers(); setDrawings([])
    if (onClearDrawings) await onClearDrawings()
  }, [onClearDrawings])

  /* ── GPS locate ── */
  const handleLocate = useCallback(() => {
    if (!mapRef.current || !window.L) return
    const L = window.L; const map = mapRef.current
    map.locate({ setView: true, maxZoom: 16 })
    map.once("locationfound", (e: any) => {
      if (locateMarkerRef.current) map.removeLayer(locateMarkerRef.current)
      if (locateCircleRef.current) map.removeLayer(locateCircleRef.current)
      locateMarkerRef.current = L.marker(e.latlng, {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#1e6fd9;border:3px solid white;box-shadow:0 0 0 2px #1e6fd9"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        }),
      }).addTo(map)
      locateCircleRef.current = L.circle(e.latlng, e.accuracy / 2, {
        color: "#1e6fd9", fillColor: "#1e6fd9", fillOpacity: 0.15, weight: 1.5,
      }).addTo(map)
    })
  }, [])

  /* ── Fullscreen ── */
  const toggleFullscreen = useCallback(() => {
    const wrap = document.getElementById("janaka-map-wrap"); if (!wrap) return
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().catch(() => { wrap.classList.add("janaka-fs-active"); setIsFullscreen(true) })
    } else { document.exitFullscreen?.() }
  }, [])

  useEffect(() => {
    const onFs = () => {
      const isFs = !!document.fullscreenElement; setIsFullscreen(isFs)
      setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 120)
    }
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  /* ── Tutup panel layer saat klik peta ── */
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return
    const handler = () => { setIsLayerOpen(false); setIsNavOpen(false) }
    mapRef.current.on("click", handler)
    return () => { mapRef.current?.off("click", handler) }
  }, [isMapReady])

  /* ─────────────────────────── Render ──────────────────────────────────── */
  return (
    <div
      id="janaka-map-wrap"
      className="relative w-full overflow-hidden rounded-xl [isolation:isolate] z-0"
      style={{ height, minHeight: 450 }}
    >
      <style>{`
        #janaka-map-wrap.janaka-fs-active {
          position: fixed; inset: 0; z-index: 9950;
          height: 100vh !important; border-radius: 0 !important;
        }
      `}</style>

      {/* ── Map canvas ── */}
      <div id="janaka-map-div" className="absolute inset-0 bg-slate-100 dark:bg-slate-900">
        {!isMapReady && (
          <div className="absolute inset-0 z-[800] flex flex-col items-center justify-center bg-white dark:bg-slate-900">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Memuat peta…</span>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          KIRI ATAS — Tombol navigasi (Compass toggle + panel)
      ════════════════════════════════════════════════════════════ */}
      <div className="absolute left-[10px] top-[10px] z-[800] flex flex-col items-center gap-[3px]">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => { setIsNavOpen(v => !v); setIsLayerOpen(false) }}
          title="Navigasi peta"
          className={cn(
            "flex h-[30px] w-[30px] items-center justify-center rounded-md border shadow-md backdrop-blur-sm transition-all duration-150",
            isNavOpen
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white",
          )}
        >
          <Compass className="h-4 w-4" />
        </button>

        {/* Panel nav */}
        <div className={cn(
          "flex flex-col items-center gap-[3px] overflow-hidden transition-all duration-200",
          isNavOpen ? "max-h-[260px] opacity-100" : "max-h-0 opacity-0 pointer-events-none",
        )}>
          <MapBtn title="Zoom in"   onClick={() => mapRef.current?.zoomIn()}><Plus    className="h-3.5 w-3.5" /></MapBtn>
          <MapBtn title="Zoom out"  onClick={() => mapRef.current?.zoomOut()}><Minus   className="h-3.5 w-3.5" /></MapBtn>
          <div className="h-px w-6 bg-slate-200 dark:bg-slate-700 my-[1px]" />
          <MapBtn title="Geser atas"   onClick={() => mapRef.current?.panBy([0, -80])}><ChevronUp    className="h-3.5 w-3.5" /></MapBtn>
          <div className="flex gap-[3px]">
            <MapBtn title="Geser kiri"  onClick={() => mapRef.current?.panBy([-80, 0])}><ChevronLeft  className="h-3.5 w-3.5" /></MapBtn>
            <MapBtn title="Geser kanan" onClick={() => mapRef.current?.panBy([80, 0])}><ChevronRight className="h-3.5 w-3.5" /></MapBtn>
          </div>
          <MapBtn title="Geser bawah"  onClick={() => mapRef.current?.panBy([0, 80])}><ChevronDown  className="h-3.5 w-3.5" /></MapBtn>
          <div className="h-px w-6 bg-slate-200 dark:bg-slate-700 my-[1px]" />
          <MapBtn title="Lokasi saya (GPS)" onClick={handleLocate} className="text-blue-600 dark:text-blue-400">
            <Navigation className="h-3.5 w-3.5" />
          </MapBtn>
          <MapBtn title="Reset tampilan" onClick={() => mapRef.current?.flyTo(PONOROGO_CENTER, PONOROGO_ZOOM, { duration: 1 })} className="text-amber-500">
            <Crosshair className="h-3.5 w-3.5" />
          </MapBtn>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          KANAN ATAS — Tombol layer switcher + fullscreen berdampingan
      ════════════════════════════════════════════════════════════ */}
      <div className="absolute right-[10px] top-[10px] z-[800] flex flex-row items-center gap-[6px]">
        {/* Layer toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setIsLayerOpen(v => !v); setIsNavOpen(false) }}
            title="Ganti layer peta"
            className={cn(
              "flex h-[30px] w-[30px] items-center justify-center rounded-md border shadow-md backdrop-blur-sm transition-all duration-150",
              isLayerOpen
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white",
            )}
          >
            <Layers className="h-4 w-4" />
          </button>

          {/* Dropdown layer */}
          {isLayerOpen && (
            <div className="absolute right-0 top-[36px] z-[810] min-w-[140px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-xl">
              <p className="px-3 pb-1 pt-1.5 text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                Layer Peta
              </p>
              {Object.entries(TILE_LAYERS).map(([id, conf]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => gantiBasemap(id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[.7rem] font-semibold transition",
                    activeBase === id
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full flex-shrink-0",
                      activeBase === id ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600",
                    )}
                  />
                  {conf.label}
                  {activeBase === id && (
                    <span className="ml-auto text-[9px] font-bold text-blue-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Keluar layar penuh" : "Layar penuh"}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 shadow-md backdrop-blur-sm transition hover:border-blue-400 hover:bg-blue-600 hover:text-white"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          KANAN BAWAH — Panel coretan / gambar
      ════════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-[30px] right-[10px] z-[800] flex flex-col items-end gap-[6px]">
        {/* Panel menu (tampil di atas tombol) */}
        <div className={cn(
          "flex min-w-[156px] origin-bottom-right flex-col gap-[1px] overflow-hidden rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-[5px] py-2 shadow-xl backdrop-blur-sm transition-all duration-200",
          isDrawOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-90 pointer-events-none",
        )}>
          <p className="px-2.5 pb-[5px] pt-[3px] text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Gambar</p>
          <DrawBtn
            active={activeDrawMode === "polyline"}
            onClick={() => mulaiGambar("polyline")}
            icon={<Route className="h-[15px] w-[15px] text-blue-500" />}
          >Garis / Rute</DrawBtn>
          <DrawBtn
            active={activeDrawMode === "polygon"}
            onClick={() => mulaiGambar("polygon")}
            icon={<Layers className="h-[15px] w-[15px] text-violet-500" />}
          >Area Poligon</DrawBtn>

          <div className="mx-[5px] my-[3px] h-px bg-slate-100 dark:bg-slate-700" />
          <p className="px-2.5 pb-[5px] pt-[3px] text-[9px] font-extrabold uppercase tracking-widest text-slate-400">Kelola</p>
          <DrawBtn
            onClick={simpanSemua}
            icon={<Save className="h-[15px] w-[15px] text-emerald-500" />}
            disabled={saving || drawings.length === 0}
          >{saving ? "Menyimpan…" : "Simpan"}</DrawBtn>
          <div className="mx-[5px] my-[3px] h-px bg-slate-100 dark:bg-slate-700" />
          <DrawBtn
            onClick={hapusSemua}
            icon={<Eraser className="h-[15px] w-[15px] text-rose-500" />}
            danger disabled={drawings.length === 0}
          >Hapus Semua</DrawBtn>
        </div>

        {/* Toggle draw */}
        <button
          type="button"
          onClick={() => setIsDrawOpen(v => !v)}
          title="Menu gambar / coretan"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border shadow-md transition-all duration-150 hover:scale-[1.06]",
            isDrawOpen
              ? "border-blue-500 bg-blue-600 text-white ring-2 ring-blue-600/40 ring-offset-1"
              : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white",
          )}
        >
          <Paintbrush className="h-4 w-4" />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          KIRI BAWAH — Tombol & Panel Legenda Status
      ════════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-[30px] left-[10px] z-[800] flex flex-col items-start gap-[6px]">
        {/* Panel legenda saat terbuka */}
        {isLegendOpen && (
          <div className="flex min-w-[145px] flex-col gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 p-3 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1 dark:border-slate-700/80">
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                Legenda Status
              </p>
              {typeof totalTitik === "number" ? (
                <p className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                  {totalTitik} titik
                </p>
              ) : null}
            </div>
            {Object.entries(STATUS_WARNA).map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white/60 dark:border-slate-700/60 shadow-sm"
                  style={{ background: color }}
                />
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  {label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-1 dark:border-slate-700/60">
              <span className="h-0 w-4 shrink-0 border-t-2 border-rose-600" />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                Batas Kabupaten Ponorogo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-emerald-500/50 bg-emerald-400/25" />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Wilayah dalam Ponorogo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-slate-500/30 bg-slate-700/20" />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Wilayah luar Ponorogo</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white/60 dark:border-slate-700/60 opacity-60 shadow-sm"
                style={{ background: "#22c55e" }}
              />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Sudah Ditindak
              </span>
            </div>
          </div>
        )}

        {/* Tombol Legenda */}
        <button
          type="button"
          onClick={() => setIsLegendOpen((v) => !v)}
          title={isLegendOpen ? "Tutup legenda status" : "Buka legenda status"}
          className={cn(
            "flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 shadow-md backdrop-blur-sm transition text-xs font-semibold",
            isLegendOpen
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-600 hover:text-white",
          )}
        >
          <Info className="h-3.5 w-3.5" />
          <span>Legenda</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          OVERLAY — Form metadata gambar
      ════════════════════════════════════════════════════════════ */}
      {showMeta && (
        <div className="absolute inset-x-3 bottom-3 z-[900] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-2xl">
          <p className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">
            Simpan Gambar — <span className="text-blue-600 dark:text-blue-400">{pendingType === "polyline" ? "Garis / Rute" : "Area / Zona"}</span>
          </p>
          {measureText && (
            <p className="mb-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {measureText}
            </p>
          )}
          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                Nama <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={metaNama}
                onChange={e => setMetaNama(e.target.value)}
                placeholder="cth. Rute patroli barat"
                autoFocus
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Keterangan</label>
              <textarea
                value={metaKet}
                onChange={e => setMetaKet(e.target.value)}
                placeholder="Keterangan opsional…"
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">Warna</label>
              <div className="flex flex-wrap gap-2">
                {WARNA_PRESET.map(w => (
                  <button
                    key={w.hex} type="button" title={w.lbl}
                    onClick={() => setMetaWarna(w.hex)}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition",
                      metaWarna === w.hex ? "border-white ring-2 ring-offset-1 scale-110" : "border-transparent hover:scale-110",
                    )}
                    style={{ background: w.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2">
            <button
              type="button" onClick={batalMeta}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-700"
            >Batal</button>
            <button
              type="button" onClick={simpanMeta} disabled={!metaNama.trim()}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white transition",
                metaNama.trim() ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-blue-300 dark:bg-blue-900/40",
              )}
            >Simpan Gambar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Render marker reklame ─────────────────────────────────────────────── */

function renderMarkers(map: any, L: any, items: ReklamePoint[], renderer?: any) {
  items.forEach(item => {
    const color = item.sudahDieksekusi
      ? "#22c55e"
      : STATUS_WARNA[item.status] ?? (item.sumber === "JANAKA" ? "#a855f7" : "#3b82f6")

    const circle = L.circleMarker([item.lat, item.lng], {
      radius: item.sudahDieksekusi ? 6 : 9,
      color,
      fillColor: color,
      fillOpacity: item.sudahDieksekusi ? 0.35 : 0.8,
      weight: item.sumber === "JANAKA" ? 3 : 2,
      dashArray: item.sumber === "JANAKA" ? "4 2" : undefined,
      renderer,
    })

    const badge = (text: string, bg: string) =>
      `<span style="display:inline-block;padding:2px 7px;border-radius:5px;font-size:.62rem;font-weight:700;background:${bg};color:#fff;border:1px solid ${bg}80">${text}</span>`

    const iconEye = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
    const iconMaps = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`

    circle.bindPopup(`
      <div style="min-width:220px;max-width:280px;padding:2px">
        <div style="margin-bottom:6px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">
          ${badge(item.sumber === "JANAKA" ? "Input JANAKA" : "Data PTSP", item.sumber === "JANAKA" ? "#7c3aed" : "#1e6fd9")}
          ${badge(item.status, color)}
          ${item.sudahDieksekusi ? badge("✓ Ditindak", "#16a34a") : ""}
        </div>
        <div style="font-size:.85rem;font-weight:700;line-height:1.3;margin-bottom:2px" class="popup-title">${esc(item.nama)}</div>
        <div style="font-size:.7rem;color:#64748b;line-height:1.35;margin-bottom:6px" class="popup-sub">📍 ${esc(item.alamat)}</div>

        <div style="font-size:.68rem;padding:6px 8px;border-radius:8px;background:rgba(100,116,139,0.08);margin-bottom:8px;display:flex;flex-direction:column;gap:2px" class="popup-box">
          ${item.jenisReklame ? `<div><span style="opacity:0.7">Jenis:</span> <b>${esc(item.jenisReklame)}</b></div>` : ""}
          ${item.dimensi && item.dimensi !== "-" ? `<div><span style="opacity:0.7">Dimensi:</span> <b>${esc(item.dimensi)}</b></div>` : ""}
          ${item.noSK && item.noSK !== "-" ? `<div><span style="opacity:0.7">No. SK:</span> <span style="font-family:monospace">${esc(item.noSK)}</span></div>` : ""}
          ${(item.jumlahLaporan ?? 0) > 0 ? `<div style="font-weight:700;color:#0d9268">⚡ ${item.jumlahLaporan}× laporan penindakan</div>` : ""}
        </div>

        <div style="display:flex;gap:6px;margin-top:6px">
          <button
            type="button"
            onclick="window.__janakaDetail('${esc(item.id)}')"
            class="janaka-btn-detail"
            style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;border-radius:7px;background:#2563eb;color:#ffffff;font-size:.7rem;font-weight:700;border:none;cursor:pointer;"
            title="Lihat Detail Reklame"
          >
            ${iconEye} Detail
          </button>
          <button
            type="button"
            onclick="window.__janakaLokasi('${esc(item.id)}')"
            class="janaka-btn-maps"
            style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:6px 8px;border-radius:7px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;font-size:.7rem;font-weight:700;cursor:pointer;"
            title="Lihat Lokasi"
          >
            ${iconMaps} Lihat Lokasi
          </button>
        </div>
      </div>
    `, { maxWidth: 290 })
    circle.addTo(map)
  })
}

/* ─── Sub-komponen tombol peta ──────────────────────────────────────────── */

function MapBtn({
  children, onClick, title, className,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[5px] border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-700/90 text-slate-600 dark:text-slate-300 shadow-sm backdrop-blur-sm transition hover:bg-slate-50 dark:hover:bg-slate-600",
        className,
      )}
    >
      {children}
    </button>
  )
}

function DrawBtn({
  children, onClick, icon, active, danger, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  icon?: React.ReactNode
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={cn(
        "flex w-full items-center gap-[7px] rounded-lg px-2.5 py-[7px] text-left text-[.68rem] font-bold transition",
        active   && "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
        danger   && !active && "text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400",
        !active  && !danger && "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
