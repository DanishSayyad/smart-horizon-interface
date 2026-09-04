# GNSS SISE Predictor 🛰️

A high-performance, physics-informed 3D GNSS satellite visualization web application built with Globe.gl and Three.js. This application demonstrates the orbital mechanics, Signal-In-Space Errors (SISE), and triangulation techniques of major GNSS constellations (GPS, Galileo, BeiDou, GLONASS) in real-time.

## Features
- **Live 3D Globe Visualization**: 60 FPS rendering of Earth with orbiting GNSS satellites.
- **Realistic Orbital Mechanics**: Satellites follow mathematically accurate MEO and GEO orbits based on their specific constellation parameters (inclination, altitude, orbital period, RAAN).
- **Interactive Metadata**: Click on any satellite to pause its orbit and instantly view a detailed glassmorphism dashboard containing its specific hardware metrics (clock type, block, orbit type) and simulated Ephemeris.
- **Trilateration Demo**: Click anywhere on the Earth to run a visual step-by-step demonstration of how GPS triangulation mathematically pinpoints a receiver's location in 3D space using 4 satellites.
- **Constellation Filters**: Toggle visibility of GPS, GAL, BDS, and GLO constellations.

## How to Run Locally

You only need a basic local web server to run this application since it relies purely on native frontend technologies (HTML/CSS/JS) and CDN imports. 

### Prerequisites
- Python 3 (pre-installed on most macOS/Linux systems)

### Steps
1. Open your terminal and navigate to the project directory:
   ```bash
   cd /path/to/gnss-demo
   ```
2. Start the local Python web server:
   ```bash
   python3 -m http.server 8080
   ```
3. Open your web browser and navigate to:
   ```text
   http://localhost:8080
   ```

## How to Host on GitHub Pages

Hosting this project on the web is incredibly easy and free via GitHub Pages.

1. **Create a GitHub Repository**: Go to GitHub and create a new public repository (e.g., `gnss-sise-predictor`).
2. **Push Your Code**:
   ```bash
   git remote add origin https://github.com/yourusername/gnss-sise-predictor.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Go to your repository's **Settings** tab on GitHub.
   - Click on **Pages** in the left sidebar.
   - Under "Build and deployment", set the **Source** to `Deploy from a branch`.
   - Select the `main` branch and the `/ (root)` folder, then click **Save**.
4. Within a few minutes, your site will be live at `https://yourusername.github.io/gnss-sise-predictor/`!

## Technologies Used
- [Globe.gl](https://globe.gl/) (Data visualization on a 3D globe)
- [Three.js](https://threejs.org/) (Underlying WebGL rendering engine)
- Vanilla JavaScript, CSS3, HTML5
