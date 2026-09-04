import { useEffect, useRef } from 'react';

/**
 * CsvUploadModal Component:
 * Pop-up window providing two distinct upload buttons:
 * 1. "Input 7 Days Training CSV" -> Sent to backend for model inference
 * 2. "Input 8th Day Testing CSV" -> Ground truth actual data for trajectory & clock error
 */
function CsvUploadModal({
  isOpen,
  onClose,
  onUploadTrain,
  onUploadTest,
  trainFileName = 'No CSV selected',
  testFileName = 'No CSV selected',
  isPredicting = false,
  inferenceStatus = '',
  testRowCount = 0,
}) {
  const trainInputRef = useRef(null);
  const testInputRef = useRef(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleTrainFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      onUploadTrain(file);
      event.target.value = '';
    }
  }

  function handleTestFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          onUploadTest(file.name, text);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }
  }

  const hasTrainFile = trainFileName && trainFileName !== 'No CSV selected';
  const hasTestFile = testFileName && testFileName !== 'No CSV selected';

  return (
    <div
      className="csv-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="csv-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Input CSV Telemetry Data"
      >
        <header className="csv-modal__header">
          <div className="csv-modal__header-title">
            <span>📡</span>
            <span>Input Telemetry Data</span>
          </div>
          <button
            className="csv-modal__close"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>

        <div className="csv-modal__body">
          <p className="csv-modal__description">
            Upload the 7-day training telemetry for AI model orbit/clock error prediction, and the 8th-day testing telemetry for actual ground-truth trajectory comparison.
          </p>

          <div className="csv-modal__grid">
            {/* 1. 7 Days Training CSV Upload Card */}
            <div className={`csv-modal__card ${hasTrainFile ? 'csv-modal__card--active' : ''}`}>
              <div className="csv-modal__card-tag csv-modal__card-tag--train">
                AI Inference
              </div>
              <h3 className="csv-modal__card-title">7 Days Training CSV</h3>
              <p className="csv-modal__description">
                Sent to the backend prediction service for 24-hour error forecasting.
              </p>

              <input
                ref={trainInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleTrainFileChange}
              />

              <button
                type="button"
                className="csv-modal__btn"
                onClick={() => trainInputRef.current?.click()}
                disabled={isPredicting}
              >
                <span>📂</span>
                <span>{hasTrainFile ? 'Replace 7 Days CSV' : 'Input 7 Days Training CSV'}</span>
              </button>

              <div className="csv-modal__file-info">
                <span className="csv-modal__file-name" title={trainFileName}>
                  File: {trainFileName}
                </span>
                {isPredicting && (
                  <span className="csv-modal__file-status csv-modal__file-status--loading">
                    ⟳ {inferenceStatus || 'Predicting on server…'}
                  </span>
                )}
                {!isPredicting && hasTrainFile && (
                  <span className="csv-modal__file-status csv-modal__file-status--success">
                    ✓ {inferenceStatus || 'Inference complete'}
                  </span>
                )}
                {!hasTrainFile && !isPredicting && (
                  <span className="csv-modal__file-status">Awaiting training CSV</span>
                )}
              </div>
            </div>

            {/* 2. 8th Day Testing CSV Upload Card */}
            <div className={`csv-modal__card ${hasTestFile ? 'csv-modal__card--active' : ''}`}>
              <div className="csv-modal__card-tag csv-modal__card-tag--test">
                Ground Truth
              </div>
              <h3 className="csv-modal__card-title">8th Day Testing CSV</h3>
              <p className="csv-modal__description">
                Plots the actual green satellite orbit trajectory and drives the clock phasor.
              </p>

              <input
                ref={testInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleTestFileChange}
              />

              <button
                type="button"
                className="csv-modal__btn"
                onClick={() => testInputRef.current?.click()}
              >
                <span>📂</span>
                <span>{hasTestFile ? 'Replace 8th Day CSV' : 'Input 8th Day Testing CSV'}</span>
              </button>

              <div className="csv-modal__file-info">
                <span className="csv-modal__file-name" title={testFileName}>
                  File: {testFileName}
                </span>
                {hasTestFile ? (
                  <span className="csv-modal__file-status csv-modal__file-status--success">
                    ✓ Ground truth loaded ({testRowCount} points)
                  </span>
                ) : (
                  <span className="csv-modal__file-status">Awaiting 8th-day CSV</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="csv-modal__footer">
          <button
            type="button"
            className="csv-modal__footer-btn"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default CsvUploadModal;
