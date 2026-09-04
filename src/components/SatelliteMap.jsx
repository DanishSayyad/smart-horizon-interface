import { useEffect, useRef } from 'react';

const initialLocation = [20.5937, 78.9629];
const imageryUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const labelsUrl = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const imageryAttribution = 'Tiles &copy; Esri';
const previewZoom = 14;
const maximumZoom = 18;
const worldBounds = [
  [-85.051129, -180],
  [85.051129, 180],
];

function SatelliteMap({ interactive = false, onActivate, onSelect, selectedLocation }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const didDragRef = useRef(false);
  const onActivateRef = useRef(onActivate);
  const onSelectRef = useRef(onSelect);

  onActivateRef.current = onActivate;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const leaflet = window.L;

    if (!leaflet) {
      return undefined;
    }

    const map = leaflet.map(containerRef.current, {
      attributionControl: interactive,
      boxZoom: false,
      doubleClickZoom: false,
      dragging: interactive,
      keyboard: false,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1,
      maxZoom: maximumZoom,
      minZoom: 2,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      worldCopyJump: false,
      zoomControl: interactive,
    }).setView(initialLocation, interactive ? 5 : previewZoom);

    leaflet.tileLayer(imageryUrl, {
      attribution: imageryAttribution,
      maxZoom: maximumZoom,
      maxNativeZoom: maximumZoom,
    }).addTo(map);

    leaflet.tileLayer(labelsUrl, {
      attribution: imageryAttribution,
      maxZoom: maximumZoom,
      maxNativeZoom: maximumZoom,
      pane: 'overlayPane',
    }).addTo(map);

    map.on('click', (event) => {
      if (interactive) {
        if (didDragRef.current) {
          return;
        }

        onSelectRef.current?.(event.latlng);
      } else {
        onActivateRef.current?.();
      }
    });

    map.on('dragstart', () => {
      didDragRef.current = true;
    });

    map.on('dragend', () => {
      window.setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    });

    mapRef.current = map;

    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const leaflet = window.L;

    if (!leaflet || !mapRef.current || !selectedLocation) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = leaflet.circleMarker(selectedLocation, {
        color: '#f6ff00',
        fillColor: '#1a985b',
        fillOpacity: 1,
        radius: 11,
        weight: 4,
      }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(selectedLocation);
    }

    markerRef.current.bringToFront();

    if (!interactive) {
      mapRef.current.setView(selectedLocation, previewZoom, { animate: false });
    }
  }, [interactive, selectedLocation]);

  return <div ref={containerRef} className="satellite-map" aria-label="Satellite map" />;
}

export default SatelliteMap;
