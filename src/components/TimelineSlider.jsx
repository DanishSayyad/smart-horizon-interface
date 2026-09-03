/**
 * Timeline Slider component embedded in the bottom panel below the 3D sphere.
 * Features:
 * - Play / Pause button
 * - Range input timeline track for scrubbing
 * - Current timestamp readout
 * - Live (X, Y, Z) error values
 * - Spacebar shortcut indicator
 */
function TimelineSlider({
  progress = 0,
  onSeek,
  isPlaying = true,
  onTogglePlay,
  currentTimestamp = '',
  currentErrors = null,
  totalPoints = 0,
  interval = '15 mins',
}) {
  return (
    <div className="timeline-container" aria-label="Simulation timeline">
      {/* Play / Pause Toggle Button */}
      <button
        type="button"
        className="timeline-play-btn"
        onClick={onTogglePlay}
        disabled={totalPoints === 0}
        aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
        title={totalPoints === 0 ? 'Upload CSV to play' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      {/* Track & Metadata */}
      <div className="timeline-track-wrapper">
        <div className="timeline-info-row">
          <div className="timeline-left-info">
            <span className="timeline-timestamp">
              {currentTimestamp || (totalPoints === 0 ? 'Waiting for CSV…' : '00:00:00')}
            </span>
            <span className="timeline-badge">{interval} ({totalPoints} pts)</span>
          </div>

          {currentErrors && (
            <div className="timeline-errors" aria-label="Current error vector">
              <span>X: {currentErrors.x >= 0 ? '+' : ''}{currentErrors.x.toFixed(2)}m</span>
              <span>Y: {currentErrors.y >= 0 ? '+' : ''}{currentErrors.y.toFixed(2)}m</span>
              <span>Z: {currentErrors.z >= 0 ? '+' : ''}{currentErrors.z.toFixed(2)}m</span>
            </div>
          )}

          <span className="timeline-hint">[Space: Play/Pause]</span>
        </div>

        {/* Scrubbable Range Slider */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.0005"
          value={progress}
          onChange={(e) => onSeek?.(parseFloat(e.target.value))}
          className="timeline-slider"
          aria-label="Simulation timeline slider"
        />
      </div>
    </div>
  );
}

export default TimelineSlider;
