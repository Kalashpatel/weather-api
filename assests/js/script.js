const OPENWEATHERMAP_API_KEY = '27f99ba160114d014e53f5514714ffa8';

// Elements
const form = document.getElementById('coordsForm');
const latInput = document.getElementById('lat');
const lonInput = document.getElementById('lon');
const msg = document.getElementById('msg');
const modalEl = document.getElementById('weatherModal');
const modal = new bootstrap.Modal(modalEl);
const modalBodyContent = document.getElementById('modalBodyContent');
const useLocationBtn = document.getElementById('useLocationBtn');
const clearBtn = document.getElementById('clearBtn');

function showMessage(html, type = 'info') {
  msg.innerHTML = `<div class="alert alert-${type}" role="alert">${html}</div>`;
}
function clearMessage() { msg.innerHTML = ''; }

// Convert unix seconds to local time string (browser local)
function unixToLocal(ts) {
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
}

function buildCurrentCard(currentData, placeName = '') {
  const weather = currentData.weather && currentData.weather[0];
  const iconUrl = weather ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png` : '';
  const desc = weather ? weather.description : '';
  return `
    <div class="row gx-4 align-items-center mb-3">
      <div class="col-md-4 text-center">
        ${iconUrl ? `<img src="${iconUrl}" alt="${desc}" class="weather-icon mb-2" />` : ''}
        <h4 class="mt-2">${weather ? weather.main : 'Weather'}</h4>
        <p class="text-capitalize mb-0">${desc}</p>
      </div>
      <div class="col-md-8">
        <h5>${placeName || 'Coordinates'}</h5>
        <p class="mb-1"><strong>Temperature:</strong> ${currentData.main.temp} °C (feels like ${currentData.main.feels_like} °C)</p>
        <p class="mb-1"><strong>Min / Max:</strong> ${currentData.main.temp_min} °C / ${currentData.main.temp_max} °C</p>
        <p class="mb-1"><strong>Humidity:</strong> ${currentData.main.humidity}%</p>
        <p class="mb-1"><strong>Pressure:</strong> ${currentData.main.pressure} hPa</p>
        <p class="mb-1"><strong>Wind:</strong> ${currentData.wind.speed} m/s ${currentData.wind.deg ? currentData.wind.deg + '°' : ''}</p>
        <p class="mb-1"><strong>Observed (local time):</strong> ${unixToLocal(currentData.dt)}</p>
      </div>
    </div>
  `;
}

// forecastList: array of forecast entries (3-hour steps)
function buildHourlyStripFromForecast(forecastList) {
  // We'll show the next 8 entries (approx 24 hours with 3-hour steps)
  const slice = forecastList.slice(0, 8);
  const items = slice.map(f => {
    const weather = f.weather && f.weather[0];
    const icon = weather ? `https://openweathermap.org/img/wn/${weather.icon}.png` : '';
    const time = unixToLocal(f.dt);
    return `
      <div class="text-center p-2 hourly-item" style="min-width:84px;">
        <div style="font-size:.85rem">${time}</div>
        ${icon ? `<img src="${icon}" alt="${weather.description}" style="width:48px; height:48px; object-fit:contain;">` : ''}
        <div style="font-weight:600">${Math.round(f.main.temp)}°</div>
      </div>
    `;
  }).join('');
  return `
    <h6 class="mt-3">Next ~24 hours (3-hour steps)</h6>
    <div class="d-flex overflow-auto py-2">${items}</div>
  `;
}

async function fetchCurrentWeather(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    let err = '';
    try { err = (await res.json()).message || JSON.stringify(await res.json()); } catch { err = await res.text(); }
    throw new Error(`Current weather API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function fetchForecast(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    let err = '';
    try { err = (await res.json()).message || JSON.stringify(await res.json()); } catch { err = await res.text(); }
    throw new Error(`Forecast API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function reverseGeocode(lat, lon) {
  // Optional: friendly place name using OpenWeather geocoding (still free)
  try {
    const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&limit=1&appid=${OPENWEATHERMAP_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const arr = await res.json();
    if (!arr || !arr.length) return '';
    const place = arr[0];
    return [place.name, place.state, place.country].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();

  const latRaw = latInput.value.trim();
  const lonRaw = lonInput.value.trim();

  if (!latRaw || !lonRaw) {
    showMessage('Please provide both latitude and longitude.', 'warning');
    return;
  }

  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!isFinite(lat) || !isFinite(lon)) {
    showMessage('Invalid numeric coordinates.', 'warning');
    return;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showMessage('Latitude must be between -90 and 90, longitude between -180 and 180.', 'warning');
    return;
  }

  // show loader in modal
  modalBodyContent.innerHTML = `<div class="text-center py-3" id="modalLoader">Loading…</div>`;
  modal.show();

  try {
    // Parallel fetch current + forecast
    const [current, forecast] = await Promise.all([
      fetchCurrentWeather(lat, lon),
      fetchForecast(lat, lon)
    ]);

    const placeName = await reverseGeocode(lat, lon);

    let html = '';
    html += buildCurrentCard(current, placeName);

    if (forecast && forecast.list && forecast.list.length) {
      html += buildHourlyStripFromForecast(forecast.list);
    } else {
      html += `<div class="alert alert-warning">No forecast data available.</div>`;
    }

    // quick daily summary (first forecast day's date) - we can derive from forecast list
    modalBodyContent.innerHTML = html;
  } catch (err) {
    // show error message in modal
    modalBodyContent.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
  }
});

// "Use my current location" button
useLocationBtn.addEventListener('click', () => {
  clearMessage();
  if (!navigator.geolocation) {
    showMessage('Geolocation is not available in your browser.', 'warning');
    return;
  }
  showMessage('Trying to get your location…', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      clearMessage();
      latInput.value = pos.coords.latitude.toFixed(6);
      lonInput.value = pos.coords.longitude.toFixed(6);
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    },
    (err) => {
      clearMessage();
      showMessage('Unable to get location: ' + (err.message || 'permission denied'), 'danger');
    },
    { maximumAge: 60_000, timeout: 10_000 }
  );
});

// Clear inputs
clearBtn.addEventListener('click', () => {
  latInput.value = '';
  lonInput.value = '';
  clearMessage();
});