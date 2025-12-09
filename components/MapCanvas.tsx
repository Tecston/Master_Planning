import React, { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
// @ts-ignore
import mapboxgl from 'mapbox-gl';
import { GeneratedGeometry, LatLng, UserConstraint, ToolMode, SiteConfig } from '../types';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

interface MapCanvasProps {
  points: LatLng[];
  setPoints: Dispatch<SetStateAction<LatLng[]>>;
  geometry: GeneratedGeometry;
  activeTool: ToolMode;
  constraints: UserConstraint[];
  setConstraints: Dispatch<SetStateAction<UserConstraint[]>>;
  config?: SiteConfig;
  setConfig?: (c: SiteConfig) => void;
  showEntrances?: boolean;
  onGeometryOverride?: (updates: Record<string, Feature<Polygon | MultiPolygon> | null>, commit?: boolean) => void;
  onAddRoad?: (p1: LatLng, p2: LatLng) => void;
  onInteractStart?: () => void;
  mapStyle: 'light' | 'dark' | 'satellite';
}

// Mapbox Token
mapboxgl.accessToken = 'pk.eyJ1IjoiaXZhbmRlcCIsImEiOiJjbTJudjZwbHIwYW00MmtvaTRhdzYyMDgyIn0.8aLktwoo3snu8FRYYCcY2Q';

export const MapCanvas: React.FC<MapCanvasProps> = ({ 
  points, setPoints, geometry, activeTool, constraints, setConstraints, 
  config, setConfig, showEntrances, onGeometryOverride, onAddRoad, onInteractStart, mapStyle 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{[key: string]: mapboxgl.Marker}>({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isFlatView, setIsFlatView] = useState(false); // 2D vs 3D

  // Para DRAW_ROAD (dos clics)
  const roadStartRef = useRef<LatLng | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/standard', // Standard por defecto
      center: [-110.9559, 29.0730],
      zoom: 16,
      pitch: 45,
      bearing: 0,
      antialias: true,
      attributionControl: false
    });

    map.on('load', () => {
      setIsMapLoaded(true);
      map.resize();
      add3DBuildings(map);
      updateGeometryLayers();
    });

    // Listener para actualizar el estado 2D/3D según el pitch actual
    map.on('pitch', () => {
      const pitch = map.getPitch();
      setIsFlatView(pitch < 5);
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // --- INTERACTION HANDLER (Click Logic) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: any) => {
      const { lng, lat } = e.lngLat;

      if (activeTool === 'DRAW_SITE') {
        if (onInteractStart) onInteractStart();
        setPoints(prev => [...prev, { lat, lng }]);
      } 
      else if (activeTool === 'PLACE_PARK') {
        if (onInteractStart) onInteractStart();
        const newConstraint: UserConstraint = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(),
          type: 'PARK_ANCHOR',
          position: { lat, lng }
        };
        setConstraints(prev => [...prev, newConstraint]);
      } 
      else if (activeTool === 'DRAW_ROAD') {
        if (!roadStartRef.current) {
          // Primer clic
          roadStartRef.current = { lat, lng };
          new mapboxgl.Marker({ color: '#2563eb', scale: 0.8 })
            .setLngLat([lng, lat])
            .addTo(map)
            .getElement()
            .classList.add('temp-road-marker');
        } else {
          // Segundo clic
          if (onInteractStart) onInteractStart();
          if (onAddRoad) onAddRoad(roadStartRef.current, { lat, lng });

          roadStartRef.current = null;
          const temps = document.getElementsByClassName('temp-road-marker');
          while (temps.length > 0) {
            temps[0].parentNode?.removeChild(temps[0]);
          }
        }
      }
    };

    // Cursor
    const canvas = map.getCanvas();
    if (activeTool === 'SELECT') canvas.style.cursor = 'grab';
    else if (activeTool === 'EDIT_GEOMETRY') canvas.style.cursor = 'default';
    else canvas.style.cursor = 'crosshair';

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      roadStartRef.current = null;
      const temps = document.getElementsByClassName('temp-road-marker');
      while (temps.length > 0) {
        temps[0].parentNode?.removeChild(temps[0]);
      }
    };
  }, [activeTool, setPoints, setConstraints, onAddRoad, onInteractStart]);

  // --- STYLE SWITCHING: Standard Día / Noche / Satelital ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (mapStyle === 'satellite') {
      // Satélite
      map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');

      const onStyleLoad = () => {
        updateGeometryLayers();
      };

      map.on('style.load', onStyleLoad);
      return () => map.off('style.load', onStyleLoad);
    }

    // 'light' o 'dark' -> Standard con preset día/noche
    map.setStyle('mapbox://styles/mapbox/standard');

    const onStyleLoad = () => {
      (map as any).setConfig('basemap', {
        lightPreset: mapStyle === 'dark' ? 'night' : 'day', // aquí cambia día / noche
        showPointOfInterestLabels: true
      });

      add3DBuildings(map);
      updateGeometryLayers();
    };

    map.on('style.load', onStyleLoad);
    return () => map.off('style.load', onStyleLoad);
  }, [mapStyle]);

  // --- Helper: 3D buildings ---
  const add3DBuildings = (map: mapboxgl.Map) => {
    const layers = map.getStyle().layers;
    const labelLayerId = layers?.find(
      (layer: any) => layer.type === 'symbol' && layer.layout['text-field']
    )?.id;

    if (!map.getLayer('3d-buildings')) {
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.6
          }
        },
        labelLayerId
      );
    }
  };

  // --- GEOMETRY RENDERING ---
  const updateGeometryLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const updateSource = (id: string, data: any) => {
      const source = map.getSource(id) as mapboxgl.GeoJSONSource;
      const cleanData = { type: 'FeatureCollection', features: data.filter((f: any) => f !== null) };
      if (source) source.setData(cleanData as any);
      else map.addSource(id, { type: 'geojson', data: cleanData as any });
    };

    updateSource('mask-source', geometry.siteBoundary ? [geometry.siteBoundary] : []);
    if (!map.getLayer('mask-layer')) {
      map.addLayer({
        id: 'mask-layer',
        type: 'fill',
        source: 'mask-source',
        paint: { 'fill-color': '#f8fafc', 'fill-opacity': 1.0 }
      });
    }

    updateSource('site-source', geometry.siteBoundary ? [geometry.siteBoundary] : []);
    if (!map.getLayer('site-outline')) {
      map.addLayer({
        id: 'site-outline',
        type: 'line',
        source: 'site-source',
        paint: { 'line-color': '#2563eb', 'line-width': 3 }
      });
    }

    updateSource('superblocks-source', geometry.superblocks);
    if (!map.getLayer('superblocks-layer')) {
      map.addLayer({
        id: 'superblocks-layer',
        type: 'fill',
        source: 'superblocks-source',
        paint: { 'fill-color': '#cbd5e1', 'fill-opacity': 1 }
      });
    }

    updateSource('roads-source', geometry.roads);
    if (!map.getLayer('roads-layer')) {
      map.addLayer({
        id: 'roads-layer',
        type: 'fill',
        source: 'roads-source',
        paint: { 'fill-color': '#1e293b', 'fill-opacity': 1 }
      });
    }

    updateSource('parks-source', geometry.parks);
    if (!map.getLayer('parks-layer')) {
      map.addLayer({
        id: 'parks-layer',
        type: 'fill',
        source: 'parks-source',
        paint: { 'fill-color': '#4ade80', 'fill-opacity': 1 }
      });
    }

    updateSource('lots-source', geometry.lots);
    if (!map.getLayer('lots-layer')) {
      map.addLayer({
        id: 'lots-layer',
        type: 'fill',
        source: 'lots-source',
        paint: { 'fill-color': '#fde047', 'fill-opacity': 0.3, 'fill-outline-color': '#ca8a04' }
      });
    }

    updateSource('buildings-source', geometry.buildings);
    if (!map.getLayer('buildings-layer')) {
      map.addLayer({
        id: 'buildings-layer',
        type: 'fill',
        source: 'buildings-source',
        paint: { 'fill-color': '#d97706', 'fill-opacity': 1 }
      });
    }

    const orderedLayers = [
      'mask-layer',
      'superblocks-layer',
      'roads-layer',
      'lots-layer',
      'parks-layer',
      'buildings-layer',
      'site-outline'
    ];
    orderedLayers.forEach(layerId => {
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    });
  };

  useEffect(() => {
    if (isMapLoaded) updateGeometryLayers();
  }, [geometry, isMapLoaded]);

  // --- MARKERS (Vertices & Constraints) ---
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Limpia vértices obsoletos
    Object.keys(markersRef.current).forEach(key => {
      if (key.startsWith('vertex-')) {
        const idx = parseInt(key.split('-')[1]);
        if (idx >= points.length || (activeTool !== 'SELECT' && activeTool !== 'DRAW_SITE')) {
          markersRef.current[key].remove();
          delete markersRef.current[key];
        }
      }
    });

    // Vértices
    if (activeTool === 'SELECT' || activeTool === 'DRAW_SITE') {
      points.forEach((p, idx) => {
        const key = `vertex-${idx}`;
        
        if (markersRef.current[key]) {
          markersRef.current[key].setLngLat([p.lng, p.lat]);
        } else {
          const el = document.createElement('div');
          el.className =
            'w-3.5 h-3.5 bg-white rounded-full border-[3px] border-blue-500 shadow-sm cursor-grab active:cursor-grabbing hover:scale-125 transition-transform';
          
          const marker = new mapboxgl.Marker({ element: el, draggable: true })
            .setLngLat([p.lng, p.lat])
            .addTo(map);

          marker.on('dragstart', () => onInteractStart && onInteractStart());
          marker.on('drag', () => {
            const { lng, lat } = marker.getLngLat();
            setPoints(prev => {
              const next = [...prev];
              next[idx] = { lat, lng };
              return next;
            });
          });

          markersRef.current[key] = marker;
        }
      });
    }

    // Constraints (parks)
    constraints.forEach(c => {
      const key = `constraint-${c.id}`;
      if (markersRef.current[key]) {
        markersRef.current[key].setLngLat([c.position.lng, c.position.lat]);
      } else {
        const el = document.createElement('div');
        el.className =
          'flex items-center justify-center w-6 h-6 bg-green-500 rounded-full border-[3px] border-white shadow-md transition-transform hover:scale-110 cursor-grab active:cursor-grabbing';
        el.innerHTML =
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m8 11 4-9 4 9"/><path d="M14 11v5a2 2 0 0 1-4 0v-5"/><path d="M12 3v8"/><path d="M5 22h14"/><path d="m5 11 2.5-3.5"/><path d="m19 11-2.5-3.5"/></svg>`;

        const marker = new mapboxgl.Marker({ element: el, draggable: true })
          .setLngLat([c.position.lng, c.position.lat])
          .addTo(map);

        marker.on('drag', () => {
          const { lng, lat } = marker.getLngLat();
          setConstraints(prev =>
            prev.map(oc => (oc.id === c.id ? { ...oc, position: { lat, lng } } : oc))
          );
        });

        el.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          setConstraints(prev => prev.filter(oc => oc.id !== c.id));
        });

        markersRef.current[key] = marker;
      }
    });

    // Cleanup constraints borrados
    Object.keys(markersRef.current).forEach(key => {
      if (key.startsWith('constraint-')) {
        const id = key.replace('constraint-', '');
        if (!constraints.find(c => c.id === id)) {
          markersRef.current[key].remove();
          delete markersRef.current[key];
        }
      }
    });
  }, [points, activeTool, constraints, onInteractStart, setConstraints, setPoints]);

  // --- Toggle 2D / 3D ---
  const toggleView = () => {
    const map = mapRef.current;
    if (!map) return;

    if (isFlatView) {
      // Cambiar a 3D (inclinado)
      map.easeTo({
        pitch: 45,
        duration: 1000
      });
      setIsFlatView(false);
    } else {
      // Cambiar a 2D (plano y Norte arriba)
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000
      });
      setIsFlatView(true);
    }
  };

  return (
    <div className="relative w-full h-full transition-all duration-700 ease-in-out">
      <div ref={mapContainer} className="w-full h-full outline-none" />

      {/* Botón toggle 2D/3D */}
      <button 
        onClick={toggleView}
        className="absolute right-4 md:right-6 bottom-40 md:bottom-24 z-30 w-14 h-14 bg-white rounded-full shadow-xl shadow-slate-900/10 flex items-center justify-center text-slate-700 font-black text-xs hover:scale-110 active:scale-95 transition-all duration-300 border border-slate-100/50"
        title={isFlatView ? 'Vista 3D' : 'Vista 2D (Norte)'}
      >
        {isFlatView ? '3D' : '2D'}
      </button>
    </div>
  );
};
