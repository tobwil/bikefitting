export function CalibrationPanel() {
  return (
    <section className="module-slot" data-module="calibration">
      <header>
        <p className="kicker">Calibration · B / S / G</p>
        <h2>No marks yet</h2>
      </header>
      <p>
        Mark bottom bracket, saddle, and grip contact. Transform origin is B, x
        forward, y up. Knee flexion is numeric only — no traffic-light scoring.
      </p>
      <dl className="readout">
        <div>
          <dt>Knee flexion</dt>
          <dd>—</dd>
        </div>
      </dl>
    </section>
  )
}
