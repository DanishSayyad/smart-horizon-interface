import { useEffect, useRef } from 'react';

const DEFAULT_LOCATION = [20.5937, 78.9629];
const MAP_ZOOM = 19; // Zoomed in via code to make both 7.5m inner and 11m outer circles clearly visible

// Translucent satellite imagery layer
const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_LABELS_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIBUTION = 'Tiles &copy; Esri';

function TriangulationMap({ selectedLocation, engineOutput }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const outerCircleRef = useRef(null);
  const innerCircleRef = useRef(null);

  const activeLocation = selectedLocation
    ? [selectedLocation.lat, selectedLocation.lng]
    : DEFAULT_LOCATION;

  // Initialize Leaflet map with translucent satellite imagery & layers
  useEffect(() => {
    const leaflet = window.L;
    if (!leaflet || !mapContainerRef.current) return;

    // Create map unpannable and locked at calibrated zoom 19
    const map = leaflet.map(mapContainerRef.current, {
      attributionControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      dragging: false, // Unpannable
      keyboard: false,
      maxZoom: 20,
      minZoom: 16,
      scrollWheelZoom: false,
      touchZoom: false,
      zoomControl: false,
    }).setView(activeLocation, MAP_ZOOM);

    // Translucent satellite tile layer (auto-upscaled from native zoom 18)
    leaflet.tileLayer(SATELLITE_TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 20,
      maxNativeZoom: 18,
      className: 'translucent-satellite-tiles',
    }).addTo(map);

    // Subtle reference boundary/place labels layer
    leaflet.tileLayer(SATELLITE_LABELS_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 20,
      maxNativeZoom: 18,
      className: 'cyan-labels-layer',
    }).addTo(map);

    // Group for triangulation range rings & markers
    const ringsGroup = leaflet.layerGroup().addTo(map);

    // Centered receiver location pin marker (truth at (0, 0, 0))
    const pinIcon = leaflet.divIcon({
      className: 'gnss-pin-container',
      html: '<div class="gnss-map-pin"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = leaflet.marker(activeLocation, {
      icon: pinIcon,
      interactive: false,
      keyboard: false,
    }).addTo(map);
    centerMarkerRef.current = marker;

    // Outer ring: uncorrected raw error solve (slightly bigger red ring ~11m)
    const outerCircle = leaflet.circle(activeLocation, {
      radius: 11,
      color: '#ef4444',
      fillColor: 'rgba(239, 68, 68, 0.08)',
      fillOpacity: 0.1,
      weight: 2,
      dashArray: '5, 5',
    }).addTo(ringsGroup);
    outerCircleRef.current = outerCircle;

    // Inner ring: error-corrected solve (reverted green ring inside ~7.5m)
    const innerCircle = leaflet.circle(activeLocation, {
      radius: 7.5,
      color: '#10b981',
      fillColor: 'rgba(16, 185, 129, 0.15)',
      fillOpacity: 0.2,
      weight: 2,
      dashArray: '4, 4',
    }).addTo(ringsGroup);
    innerCircleRef.current = innerCircle;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      centerMarkerRef.current = null;
      outerCircleRef.current = null;
      innerCircleRef.current = null;
    };
  }, []);

  // Update center and circles on activeLocation or engineOutput change
  useEffect(() => {
    const leaflet = window.L;
    if (!leaflet || !mapInstanceRef.current) return;

    // Center map view on active location at calibrated zoom 19
    mapInstanceRef.current.setView(activeLocation, MAP_ZOOM, { animate: false });

    if (centerMarkerRef.current) {
      centerMarkerRef.current.setLatLng(activeLocation);
    }

    // Radius values directly from simulation engine (calibrated to ~11m outer, ~7.5m inner)
    const outerR = Math.max(1, engineOutput?.radius?.outer ?? 10.8);
    const innerR = Math.max(0.3, engineOutput?.radius?.inner ?? 7.5);

    if (outerCircleRef.current) {
      outerCircleRef.current.setLatLng(activeLocation);
      outerCircleRef.current.setRadius(outerR);
    }

    if (innerCircleRef.current) {
      innerCircleRef.current.setLatLng(activeLocation);
      innerCircleRef.current.setRadius(innerR);
    }
  }, [
    activeLocation[0],
    activeLocation[1],
    engineOutput?.radius?.outer,
    engineOutput?.radius?.inner,
  ]);

  const rawOffset = engineOutput?.rawDeviationOffset ?? 10.8;
  const corrOffset = engineOutput?.correctedDeviationOffset ?? 7.5;
  const outerR = engineOutput?.radius?.outer ?? 10.8;
  const innerR = engineOutput?.radius?.inner ?? 7.5;
  const mode = engineOutput?.mode ?? 'MEO';
  const period = engineOutput?.orbitalPeriod ?? (mode === 'GEO' ? 360 : 90);

  return (
    <div className="gnss-panel-container" aria-label="post-predicted triangulation">
      <header className="panel-header">
        <span className="panel-header__title">post-predicted triangulation</span>
      </header>

      {/* Translucent Satellite Image Map Render */}
      <div className="gnss-map-wrapper">
        <div ref={mapContainerRef} className="gnss-cyan-map" />
        {/* Subtle HUD Crosshairs reticle overlay */}
        <div className="gnss-reticle-overlay">
          <div className="gnss-reticle-ring" />
          <div className="gnss-reticle-line-h" />
          <div className="gnss-reticle-line-v" />
        </div>
      </div>

      {/* Compact space below map render for text & future graphjs additions */}
      <div className="gnss-text-space" aria-label="GNSS Triangulation telemetry and logs">
        <div className="gnss-telemetry-row">
          <span className="gnss-telemetry-lbl">MODE:</span>
          <span className="gnss-telemetry-val">{mode} ({period}s ORBIT) | 3D SOLVE</span>
        </div>
        <div className="gnss-telemetry-row">
          <span className="gnss-telemetry-lbl">PRE-CORR:</span>
          <span className="gnss-telemetry-val" style={{ color: '#ef4444' }}>
            ±{rawOffset.toFixed(2)}m (R_raw: {outerR.toFixed(1)}m)
          </span>
        </div>
        <div className="gnss-telemetry-row">
          <span className="gnss-telemetry-lbl">POST-CORR:</span>
          <span className="gnss-telemetry-val" style={{ color: '#10b981' }}>
            ±{corrOffset.toFixed(2)}m (R_corr: {innerR.toFixed(1)}m)
          </span>
        </div>
        <div className="gnss-future-slot">
          <span>[ GRAPH.JS EXTENSION AREA ]</span>
        </div>
      </div>
    </div>
  );
}

export default TriangulationMap;
