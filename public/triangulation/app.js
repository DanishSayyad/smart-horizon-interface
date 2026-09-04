/* ═══════════════════════════════════════════════════════════════
   GNSS SISE Predictor — App v10
   High-performance 60 FPS direct mesh updates + persistent trilateration intersections
   ═══════════════════════════════════════════════════════════════ */

const EARTH_R_KM = 6371;
const CON_COLOR  = { GPS:'#ef4444', Galileo:'#94a3b8', BeiDou_GEO:'#eab308', BeiDou_MEO:'#94a3b8', GLONASS:'#94a3b8' };
const VALT       = { GPS:0.26, Galileo:0.32, BeiDou_M:0.28, BeiDou_G:0.48, GLONASS:0.24 };
const CLASS_STYLE = {
  clean:     { label:'● Clean',     bg:'rgba(70,130,170,0.14)', col:'#6aaad4' },
  sawtooth:  { label:'▲ Sawtooth',  bg:'rgba(190,130,50,0.14)', col:'#c8922a' },
  irregular: { label:'◆ Irregular', bg:'rgba(180,70,70,0.14)',  col:'#c06868' },
};

/* ── Ephemeris ─────────────────────────────────────────────── */
function genEph(sat) {
  const a = (sat.altKm + EARTH_R_KM) * 1000;
  return {
    sqrtA: +Math.sqrt(a).toFixed(3),
    e:     sat.orbitType==='GEO' ? +(Math.random()*3e-4).toFixed(6) : +(0.001+Math.random()*0.015).toFixed(6),
    i0:    +(sat.incl*Math.PI/180+(Math.random()-0.5)*0.002).toFixed(6),
    af0:   +((Math.random()-0.5)*4e-5).toFixed(12),
    af1:   +((Math.random()-0.5)*1e-11).toFixed(15),
    iode:  Math.floor(Math.random()*256),
    toe:   475200+Math.floor(Math.random()*604800),
    omega0:+((Math.random()*2-1)*Math.PI).toFixed(6),
  };
}

/* ── Satellite database ────────────────────────────────────── */
function buildDB() {
  const sats = [];
  const gpsPlanes = [
    {id:'A',prns:[1,24,30,6]},{id:'B',prns:[2,5,16,25,29]},
    {id:'C',prns:[3,12,19,28]},{id:'D',prns:[4,7,8,9,10]},
    {id:'E',prns:[11,13,14,15,20]},{id:'F',prns:[17,21,22,23,26,27,31,32]},
  ];
  const gpsClk={9:'Cs',18:'H-maser',23:'H-maser',26:'H-maser',32:'H-maser'};
  const gpsBlk={1:'IIF',2:'IIR',3:'IIF',4:'III',5:'IIR-M',6:'IIF',7:'IIR-M',8:'IIF',9:'IIF',10:'IIF',11:'IIR',12:'IIR-M',13:'IIR',14:'IIR',15:'IIR-M',16:'IIR',17:'IIR-M',18:'III',19:'IIR',20:'IIR',21:'IIR',22:'IIR',23:'III',24:'IIF',25:'IIF',26:'III',27:'IIF',28:'IIR',29:'IIR-M',30:'IIF',31:'IIR-M',32:'IIF'};
  const irregPRN=new Set([21,31]), sawPRN=new Set([3,10,17]);

  gpsPlanes.forEach((plane,pi)=>{
    plane.prns.forEach((prn,si)=>{
      const n=plane.prns.length;
      const cls=irregPRN.has(prn)?'irregular':sawPRN.has(prn)?'sawtooth':'clean';
      const sat={id:'G'+String(prn).padStart(2,'0'),constellation:'GPS',orbitType:'MEO',
        clockType:gpsClk[prn]||'Rb',block:gpsBlk[prn]||'IIF',plane:plane.id,
        incl:55,altKm:20200,raan:pi*60,phase0:(si/n)*360,period:11.967,
        cls,color:CON_COLOR.GPS,
        model:cls==='clean'?'Gaussian Process':cls==='sawtooth'?'Bootstrap MC':'Student-t Process',
        sise:cls==='irregular'?+(2+Math.random()*4).toFixed(2)
            :cls==='sawtooth' ?+(1+Math.random()*2).toFixed(2)
            :                   +(0.03+Math.random()*1.5).toFixed(2),
        _lat:0,_lng:0,_alt:VALT.GPS};
      sat.eph=genEph(sat); sats.push(sat);
    });
  });

  [1,2,3,4,5,7,8,9].forEach((prn,i)=>{
    const pi=Math.floor(i/3),si=i%3;
    const sat={id:'E'+String(prn).padStart(2,'0'),constellation:'Galileo',orbitType:'MEO',
      clockType:'H-maser',block:'FOC',plane:String.fromCharCode(65+pi),
      incl:56,altKm:23222,raan:pi*120,phase0:si*120,period:14.08,
      cls:'clean',color:CON_COLOR.Galileo,model:'Gaussian Process',
      sise:+(0.1+Math.random()*0.7).toFixed(2),_lat:0,_lng:0,_alt:VALT.Galileo};
    sat.eph=genEph(sat); sats.push(sat);
  });

  [1,2,3,4,5].forEach(prn=>{
    const sat={id:'C'+String(prn).padStart(2,'0'),constellation:'BeiDou',orbitType:'GEO',
      clockType:'Rb',block:'BD-3',plane:'—',incl:0.5,altKm:35786,raan:0,phase0:0,period:24.0,
      cls:'clean',color:CON_COLOR.BeiDou_GEO,model:'Gaussian Process',
      sise:+(0.5+Math.random()*1.5).toFixed(2),_lat:0,_lng:0,_alt:VALT.BeiDou_G,
      _fixedLng:58.75+(prn-1)*20};
    sat.eph=genEph(sat); sats.push(sat);
  });

  [19,20,21,22,23].forEach((prn,i)=>{
    const pi=Math.floor(i/2),si=i%2,isSaw=prn===22;
    const sat={id:'C'+prn,constellation:'BeiDou',orbitType:'MEO',
      clockType:'H-maser',block:'BD-3',plane:String.fromCharCode(65+pi),
      incl:55,altKm:21528,raan:pi*120,phase0:si*180,period:12.88,
      cls:isSaw?'sawtooth':'clean',color:CON_COLOR.BeiDou_MEO,
      model:isSaw?'Bootstrap MC':'Gaussian Process',
      sise:+(0.2+Math.random()*1.2).toFixed(2),_lat:0,_lng:0,_alt:VALT.BeiDou_M};
    sat.eph=genEph(sat); sats.push(sat);
  });

  [1,2,3,4,5,6,7,8].forEach((prn,i)=>{
    const pi=Math.floor(i/3),si=i%3;
    const sat={id:'R'+String(prn).padStart(2,'0'),constellation:'GLONASS',orbitType:'MEO',
      clockType:'Cs',block:'GLONASS-M',plane:String.fromCharCode(65+pi),
      incl:64.8,altKm:19130,raan:pi*120,phase0:si*120,period:11.27,
      cls:'clean',color:CON_COLOR.GLONASS,model:'Gaussian Process',
      sise:+(0.3+Math.random()*2.0).toFixed(2),_lat:0,_lng:0,_alt:VALT.GLONASS};
    sat.eph=genEph(sat); sats.push(sat);
  });

  return sats;
}

const SATS = buildDB();

/* ── Orbital mechanics ─────────────────────────────────────── */
function updatePos(sat, t) {
  if (sat.orbitType==='GEO') {
    sat._lat=sat.incl*Math.sin((2*Math.PI/sat.period)*t);
    sat._lng=((sat._fixedLng||100)+t*0.04)%360;
    if(sat._lng>180) sat._lng-=360;
    return;
  }
  const u=(2*Math.PI/sat.period)*t+sat.phase0*(Math.PI/180);
  const iR=sat.incl*(Math.PI/180);
  sat._lat=Math.asin(Math.sin(iR)*Math.sin(u))*(180/Math.PI);
  const lngOrb=Math.atan2(Math.cos(iR)*Math.sin(u),Math.cos(u))*(180/Math.PI);
  sat._lng=((sat.raan+lngOrb-t*0.2)%360+540)%360-180;
}

/* ─────────────────────────────────────────────────────────────
   GLOBE STATE
   ───────────────────────────────────────────────────────────── */
let G = null, simT = 0, speed = 0.3, selSat = null;
let simPaused = false;
let trilTimers = [];
let visCon = new Set(['GPS','Galileo','BeiDou','GLONASS']);
let mouseX = 0, mouseY = 0;
let clickedSatTime = 0; // Prevent propagation/overlap from custom layer click

// Trilateration visual tracking state
let trilStep = 0, trilChosen = [], trilTarget = null;

// (Removed getSatData as Globe.gl passes the data object directly)

const _plate = document.createElement('div');
_plate.style.cssText = [
  'position:fixed','z-index:900','pointer-events:none','display:none',
  'padding:8px 12px','border-radius:8px',
  'background:rgba(9,13,24,0.97)',
  'border:1px solid rgba(255,255,255,0.09)',
  'min-width:115px','font-family:Inter,sans-serif',
].join(';');
document.body.appendChild(_plate);

let _pHide = null;
function _showPlate(sat) {
  if (!sat) return;
  clearTimeout(_pHide);
  const cs = CLASS_STYLE[sat.cls] || CLASS_STYLE.clean;
  _plate.innerHTML =
    `<div style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:700;color:${sat.color};margin-bottom:2px">${sat.id}</div>`+
    `<div style="font-size:.58rem;color:#4a6070;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${sat.constellation} · ${sat.orbitType}</div>`+
    `<div style="font-size:.68rem;color:${cs.col};font-weight:600">${cs.label}</div>`+
    `<div style="font-size:.63rem;color:#7a9ab0;margin-top:4px;border-top:1px solid rgba(255,255,255,.06);padding-top:4px;font-family:'JetBrains Mono',monospace">SISE: ${sat.sise.toFixed(2)} ns</div>`+
    `<div style="font-size:.6rem;color:#4a5e70;margin-top:2px;font-family:'JetBrains Mono',monospace">${sat.clockType} · ${sat.block}</div>`;
  _plate.style.display = 'block';
  _movePlate();
}
function _hidePlate() { _pHide = setTimeout(()=>{ _plate.style.display='none'; }, 150); }
function _movePlate() {
  const pw=_plate.offsetWidth||130, ph=_plate.offsetHeight||90;
  _plate.style.left = Math.min(mouseX+14, window.innerWidth-pw-10)+'px';
  _plate.style.top  = Math.max(mouseY-ph-10, 10)+'px';
}
window.addEventListener('mousemove', e=>{ mouseX=e.clientX; mouseY=e.clientY; if(_plate.style.display!=='none') _movePlate(); });

/* ─────────────────────────────────────────────────────────────
   GLOBE INIT
   ───────────────────────────────────────────────────────────── */
function init() {
  SATS.forEach(s => updatePos(s, 0));

  // Instantiate G first so it is available in callbacks immediately
  G = Globe()(document.getElementById('globe-container'));

  G.globeImageUrl('textures/earth-night.jpg')
    .bumpImageUrl('textures/earth-topology.png')
    .backgroundImageUrl('textures/night-sky.png')
    .atmosphereColor('#3b82f6').atmosphereAltitude(0.2).showAtmosphere(true);

  // Brighten up the globe model and lighting
  const scene = G.scene();
  if (scene) {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(5, 4, 6);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x90c0ff, 1.0);
    dirLight2.position.set(-6, -3, -5);
    scene.add(dirLight2);
  }

  // Adjust globe material for a lighter, clearer look
  const globeMat = G.globeMaterial();
  if (globeMat) {
    globeMat.bumpScale = 0.04;
    if (globeMat.emissive) {
      globeMat.emissive.setHex(0x24384d);
      globeMat.emissiveIntensity = 0.4;
    }
  }

  G
    // Custom 3D Layer for Satellites
    .customLayerData(visSats())
    .customThreeObject(d => {
      const group = new THREE.Group();
      
      // Core satellite sphere in wireframe mode (vertices and edges)
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: d.color, wireframe: true })
      );
      group.add(sphere);
      
      // Outer communication ring representing telemetry/broadcast
      const ringGeom = new THREE.RingGeometry(1.5, 1.8, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: d.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      group.add(ring);
      
      // Save links for direct high-performance animation
      group.__data = d;
      group._sphere = sphere;
      group._ring = ring;
      
      d._mesh = group; // Store direct reference on the raw data object
      
      return group;
    })
    .customThreeObjectUpdate(() => {
      // Direct updates are done in animation loop for 60 FPS performance
    })
    
    // WebGL-based points for GPS markers (avoids CSS2DRenderer crash)
    .pointsData([])
    .pointLat('lat')
    .pointLng('lng')
    .pointColor('color')
    .pointAltitude(0.005)
    .pointRadius(0.18)
    .pointResolution(24)
    
    // Paths for signal beams and 3D space triangle
    .pathsData([])
    .pathPoints(d => d.coords)
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathPointAlt(p => p[2])
    .pathColor(d => d.color)
    .pathStroke(d => d.stroke || 1.5)
    .pathDashLength(d => d.isBeam ? 0.08 : 0)
    .pathDashGap(0.04)
    .pathDashAnimateTime(1200)
    
    // Rings for uncertainty circles
    .ringsData([])
    .ringLat('lat').ringLng('lng').ringMaxRadius('maxR')
    .ringPropagationSpeed('spd').ringRepeatPeriod('period')
    .ringColor('color').ringAltitude(0.001)
    
    .onGlobeClick(onGlobeClick);

  // Configure native hover and click on custom layer (satellites)
  G.onCustomLayerClick((sat) => {
    if (sat && sat.id) {
      clickedSatTime = Date.now(); // Record click time to prevent propagation
      onSatClick(sat);
    }
  });

  G.onCustomLayerHover((sat, prevSat) => {
    const container = document.getElementById('globe-container');
    if (sat && sat.id) {
      container.style.cursor = 'pointer';
      if (sat._mesh) sat._mesh.scale.set(1.5, 1.5, 1.5);
      _showPlate(sat);
    } else {
      container.style.cursor = 'default';
    }
    if (prevSat && prevSat.id && prevSat !== sat) {
      if (prevSat._mesh) prevSat._mesh.scale.set(1, 1, 1);
      _hidePlate();
    }
  });

  G.pointOfView({lat:22,lng:80,altitude:3.0});
  
  const controls = G.controls();
  if (controls) {
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.3;
    controls.enableDamping   = true;
  }
}

/* ─────────────────────────────────────────────────────────────
   ANIMATION LOOP
   ───────────────────────────────────────────────────────────── */
function loop() {
  try {
    if (!simPaused) {
      simT += speed * 0.016;
    }
    _frame++;
    
    // Direct in-place Three.js updates (near-zero CPU overhead, runs at 60 FPS!)
    if (G) {
      SATS.forEach(s => {
        if (!simPaused) {
          updatePos(s, simT);
        }
        if (visCon.has(s.constellation) && s._mesh) {
          const coords = G.getCoords(s._lat, s._lng, s._alt);
          if (coords) {
            s._mesh.position.set(coords.x, coords.y, coords.z);
          }
          if (s._mesh._ring) {
            s._mesh._ring.rotation.z += 0.04;
          }
        }
      });
    }

    if (selSat) updateBroadcast(selSat);
    
  } catch (err) {
    console.error("Error in loop execution:", err);
  } finally {
    requestAnimationFrame(loop);
  }
}

let _frame = 0;
function visSats() { return SATS.filter(s => visCon.has(s.constellation)); }

/* ─────────────────────────────────────────────────────────────
   SATELLITE DETAILS PANEL
   ───────────────────────────────────────────────────────────── */
function onSatClick(sat) {
  try {
    if (!sat) return;
    clearTril(); closeGPS();
    selSat = sat;
    showSatPanel(sat);
    
    if (G) {
      const controls = G.controls();
      if (controls) {
        controls.autoRotate = false;
      }
      // Transition prevents jump crash
      G.pointOfView({lat:sat._lat, lng:sat._lng, altitude:1.6}, 1000);
    }
  } catch (err) {
    console.error("Error in onSatClick:", err);
  }
}

function onGlobeClick({lat, lng}) {
  if (Date.now() - clickedSatTime < 100) return; // Prevent double-trigger from custom layer click
  if (selSat) { closeSat(); return; }
  startTrilDemo(lat, lng);
}

function showSatPanel(sat) {
  try {
    if (!sat) return;
    const c = sat.color;
    document.getElementById('sat-id').textContent = sat.id;
    document.getElementById('sat-id').style.color  = c;
    const badge = document.getElementById('sat-constellation');
    badge.textContent   = sat.constellation;
    badge.style.background  = c + '18';
    badge.style.color        = c;
    badge.style.borderColor  = c + '40';
    document.getElementById('sat-orbit').textContent       = sat.orbitType;
    document.getElementById('sat-clock').textContent       = sat.clockType;
    document.getElementById('sat-block').textContent       = sat.block;
    document.getElementById('sat-period').textContent      = fmtPeriod(sat.period);
    document.getElementById('sat-altitude-val').textContent = sat.altKm.toLocaleString() + ' km';
    
    const cs = CLASS_STYLE[sat.cls] || CLASS_STYLE.clean;
    const ce = document.getElementById('sat-class');
    ce.textContent = cs.label;
    ce.style.cssText = `background:${cs.bg};color:${cs.col};padding:2px 9px;border-radius:5px;font-size:.68rem;font-weight:600`;
    
    document.getElementById('sat-model').textContent = sat.model;
    document.getElementById('sat-sise').textContent  = sat.sise.toFixed(2) + ' ns';
    
    const e = sat.eph;
    document.getElementById('eph-sqrtA').textContent  = e.sqrtA + ' √m';
    document.getElementById('eph-ecc').textContent    = e.e;
    document.getElementById('eph-i0').textContent     = e.i0.toFixed(5) + ' rad';
    document.getElementById('eph-af0').textContent    = e.af0.toExponential(4) + ' s';
    document.getElementById('eph-af1').textContent    = e.af1.toExponential(4) + ' s/s';
    document.getElementById('eph-iode').textContent   = e.iode;
    document.getElementById('eph-toe').textContent    = e.toe + ' s';
    document.getElementById('eph-omega0').textContent = e.omega0.toFixed(4) + ' rad';
    
    updateBroadcast(sat);
    document.getElementById('sat-panel').classList.remove('hidden');
  } catch (err) {
    console.error("Error in showSatPanel:", err);
  }
}

function updateBroadcast(sat) {
  try {
    if (!sat) return;
    const r  = EARTH_R_KM + sat.altKm;
    const lR = sat._lat * Math.PI/180, gR = sat._lng * Math.PI/180;
    const p  = document.getElementById('sat-pos');
    if (p) p.textContent = `${(r*Math.cos(lR)*Math.cos(gR)).toFixed(0)}, ${(r*Math.cos(lR)*Math.sin(gR)).toFixed(0)}, ${(r*Math.sin(lR)).toFixed(0)} km`;
    const b  = document.getElementById('sat-clockbias');
    if (b) { const bias = sat.sise + Math.sin(simT*0.6)*0.35; b.textContent = (bias>=0?'+':'')+bias.toFixed(3)+' ns'; }
  } catch (err) {
    console.error("Error in updateBroadcast:", err);
  }
}

function closeSat() {
  try {
    document.getElementById('sat-panel').classList.add('hidden');
    selSat = null;
    if (G) {
      const controls = G.controls();
      if (controls) {
        controls.autoRotate = true;
      }
    }
  } catch (err) {
    console.error("Error in closeSat:", err);
  }
}

/* ─────────────────────────────────────────────────────────────
   TRILATERATION DEMO
   ───────────────────────────────────────────────────────────── */
const STEP_MSGS = [
  '— click anywhere on Earth to start the positioning demo —',
  '<b>Satellite 1</b> fires a timed signal. Travel time → distance. You lie on a circle centered under it.',
  '<b>Satellite 2</b> joins. Two distance spheres intersect along a circle in space, narrowing position to an arc on Earth.',
  '<b>Satellite 3</b> completes the fix. Three spheres intersect at two points, one of which is on the surface. Receiver position found.',
  '<b>Satellite 4</b> resolves the clock error (4 unknowns: x, y, z, Δt). <b>Unique position locked.</b>',
];

function startTrilDemo(lat, lng) {
  clearTril();

  document.getElementById('tril-panel').classList.remove('hidden');

  // Filter 4 closest GPS satellites currently above the horizon (angSep < 88)
  const chosen = pickGeom(
    SATS.filter(s=>s.constellation==='GPS')
        .filter(s=>angSep(s._lat,s._lng,lat,lng)<88)
        .sort((a,b)=>angSep(a._lat,a._lng,lat,lng)-angSep(b._lat,b._lng,lat,lng)),
    4
  );
  if (chosen.length < 4) { setTrilMsg(0); return; } // Guarantee 4 satellites for clock error resolution

  simPaused = true;

  if (G) {
    const controls = G.controls();
    if (controls) {
      controls.autoRotate = false;
    }
  }
  setTrilMsg(0);

  // Initialize trilateration visual tracking variables
  trilTarget = { lat, lng };
  trilChosen = chosen;
  trilStep = 0;

  function step(ms, fn) { trilTimers.push(setTimeout(fn, ms)); }

  // Step 1: Satellite 1 Beam & Ring
  step(1500, () => {
    trilStep = 1;
    setTrilMsg(1);
    updateTrilVisuals();
  });

  // Step 2: Satellite 2 Beams & Rings
  step(3500, () => {
    trilStep = 2;
    setTrilMsg(2);
    updateTrilVisuals();
  });

  // Step 3: Satellite 3 Beams & 3D space triangle
  step(5500, () => {
    trilStep = 3;
    setTrilMsg(3);
    updateTrilVisuals();
  });

  // Step 4: Clock fix (Satellite 4) -> Show GPS error markers
  step(7500, () => {
    trilStep = 4;
    setTrilMsg(4);
    updateTrilVisuals();
    
    // Display error markers (Green true pos)
    if (G) {
      G.pointsData([
        { lat: lat, lng: lng, color: '#00ff88', type: 'true' }
      ]);
      // Zoom in to see the ground intersection
      G.pointOfView({lat, lng, altitude:0.8}, 3000);
    }
  });
}

function updateTrilVisuals() {
  try {
    if (!trilTarget || !trilChosen.length) return;
    const { lat, lng } = trilTarget;
    
    // Calculate angular separations
    const r0 = angSep(trilChosen[0]._lat, trilChosen[0]._lng, lat, lng);
    const r1 = trilChosen[1] ? angSep(trilChosen[1]._lat, trilChosen[1]._lng, lat, lng) : 0;
    const r2 = trilChosen[2] ? angSep(trilChosen[2]._lat, trilChosen[2]._lng, lat, lng) : 0;

    // Active ring pulses every 1.5s and travels exactly to the target within that time
    const activeRing = (cLat, cLng, r, c) => ({
      lat: cLat, lng: cLng, 
      maxR: r + 0.5, 
      spd: (r + 0.5) / 1.5, 
      period: 1500, 
      color: c
    });

    const NEUTRAL_LINE_COLOR = 'rgba(180, 200, 220, 0.6)';

    const beamPath = (s) => ({
      coords: [
        [s._lat, s._lng, s._alt],
        [lat, lng, 0]
      ],
      color: NEUTRAL_LINE_COLOR,
      stroke: 2.0,
      isBeam: true
    });
    
    const triPath = (s0, s1, s2) => ({
      coords: [
        [s0._lat, s0._lng, s0._alt],
        [s1._lat, s1._lng, s1._alt],
        [s2._lat, s2._lng, s2._alt],
        [s0._lat, s0._lng, s0._alt]
      ],
      color: 'rgba(255, 255, 255, 0.5)',
      stroke: 2.0,
      isBeam: false
    });

    let paths = [];
    let rings = [];

    if (trilStep === 1) {
      paths = [beamPath(trilChosen[0])];
      rings = [activeRing(trilChosen[0]._lat, trilChosen[0]._lng, r0, 'rgba(200,168,74,0.6)')];
    } else if (trilStep === 2) {
      paths = [
        beamPath(trilChosen[0]),
        beamPath(trilChosen[1])
      ];
      rings = [
        activeRing(trilChosen[0]._lat, trilChosen[0]._lng, r0, 'rgba(200,168,74,0.4)'),
        activeRing(trilChosen[1]._lat, trilChosen[1]._lng, r1, 'rgba(74,136,184,0.6)'),
      ];
    } else if (trilStep === 3) {
      paths = [
        beamPath(trilChosen[0]),
        beamPath(trilChosen[1]),
        beamPath(trilChosen[2]),
        triPath(trilChosen[0], trilChosen[1], trilChosen[2]) // Triangle in space
      ];
      rings = [
        activeRing(trilChosen[0]._lat, trilChosen[0]._lng, r0, 'rgba(200,168,74,0.3)'),
        activeRing(trilChosen[1]._lat, trilChosen[1]._lng, r1, 'rgba(74,136,184,0.3)'),
        activeRing(trilChosen[2]._lat, trilChosen[2]._lng, r2, 'rgba(184,90,90,0.6)'),
      ];
    } else if (trilStep === 4) {
      const p = [
        beamPath(trilChosen[0]),
        beamPath(trilChosen[1]),
        beamPath(trilChosen[2])
      ];
      if (trilChosen[3]) {
        p.push(beamPath(trilChosen[3]));
      }
      p.push(triPath(trilChosen[0], trilChosen[1], trilChosen[2]));
      paths = p;
      
      rings = [
        activeRing(trilChosen[0]._lat, trilChosen[0]._lng, r0, 'rgba(200,168,74,0.20)'),
        activeRing(trilChosen[1]._lat, trilChosen[1]._lng, r1, 'rgba(74,136,184,0.20)'),
        activeRing(trilChosen[2]._lat, trilChosen[2]._lng, r2, 'rgba(184,90,90,0.20)'),
        {
          lat: lat,
          lng: lng,
          maxR: 1.2,
          spd: 1.2,
          period: 1000,
          color: 'rgba(0,255,136,0.5)'
        }
      ];
    }

    if (G) {
      G.pathsData(paths);
      G.ringsData(rings);
    }
  } catch (err) {
    console.error("Error in updateTrilVisuals:", err);
  }
}

function setTrilMsg(n) {
  const el = document.getElementById('tril-status');
  if (el) el.innerHTML = STEP_MSGS[n] || '';
  document.querySelectorAll('.tril-dot:not(.lock)').forEach((d, i) => {
    d.classList.remove('done','current');
    if (i < n)       d.classList.add('done');
    if (i === n - 1) d.classList.add('current');
  });
  document.querySelectorAll('.tril-line').forEach((l, i) => {
    l.classList.toggle('done', i < n - 1);
  });
}

function clearTril() {
  trilTimers.forEach(clearTimeout); trilTimers = [];
  trilStep = 0;
  trilChosen = [];
  trilTarget = null;
  simPaused = false;
  if (G) {
    try { G.pathsData([]); } catch(e) {}
    try { G.ringsData([]); } catch(e) {}
  }
  document.getElementById('tril-panel').classList.add('hidden');
  setTrilMsg(0);
}

function closeGPS() {
  try {
    clearTril(); 
    if (G) {
      G.pointsData([]); // Clear GPS markers
      const controls = G.controls();
      if (controls) {
        controls.autoRotate = true;
      }
    }
  } catch (err) {
    console.error("Error in closeGPS:", err);
  }
}

/* ── Geometry ──────────────────────────────────────────────── */
function angSep(a,b,c,d) {
  const r=x=>x*Math.PI/180;
  const x=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;
  return 2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))*180/Math.PI;
}

function pickGeom(sats, n) {
  if (!sats.length) return [];
  const ch = [sats[0]];
  while (ch.length < n && ch.length < sats.length) {
    let best=null, bd=-1;
    for (const s of sats) {
      if (ch.includes(s)) continue;
      const ms = Math.min(...ch.map(c=>angSep(s._lat,s._lng,c._lat,c._lng)));
      if (ms > bd) { bd = ms; best = s; }
    }
    if (best) ch.push(best); else break;
  }
  return ch;
}

/* ── Constellation filter ──────────────────────────────────── */
function refreshVis() {
  G.customLayerData(visSats());
  document.getElementById('stat-sats').textContent = visSats().length;
}

/* ── Utils ─────────────────────────────────────────────────── */
function fmtPeriod(h) {
  return Math.floor(h) + 'h ' + String(Math.round((h % 1) * 60)).padStart(2,'0') + 'm';
}

/* ── Events ────────────────────────────────────────────────── */
document.getElementById('btn-close-sat').addEventListener('click', closeSat);
document.getElementById('btn-close-gps').addEventListener('click', closeGPS);
document.getElementById('speed-slider').addEventListener('input', e => { speed = +e.target.value / 100; });

document.querySelectorAll('.badge').forEach(b => {
  b.addEventListener('click', () => {
    const c = b.dataset.constellation;
    b.classList.toggle('active');
    visCon[b.classList.contains('active') ? 'add' : 'delete'](c);
    refreshVis();
  });
});

setTimeout(() => { 
  const t = document.getElementById('tooltip'); 
  if (t) t.classList.add('fade-out'); 
}, 5000);

/* ── Boot ──────────────────────────────────────────────────── */
init();
loop();
