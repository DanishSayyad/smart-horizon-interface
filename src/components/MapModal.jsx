import { useEffect } from 'react';
import SatelliteMap from './SatelliteMap';

function MapModal({ onClose, onSelect, selectedLocation }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="map-modal-backdrop" role="presentation">
      <section className="map-modal" role="dialog" aria-modal="true" aria-label="Select Location">
        <header className="map-modal__header">
          <p>Select Location</p>
          <button className="map-modal__close" type="button" onClick={onClose} aria-label="Close map">
            ×
          </button>
        </header>
        <p className="map-modal__hint">Drag to pan, use the mouse wheel to zoom, then click to select a point.</p>
        <div className="map-modal__map">
          <SatelliteMap
            interactive
            onSelect={onSelect}
            selectedLocation={selectedLocation}
          />
        </div>
      </section>
    </div>
  );
}

export default MapModal;
