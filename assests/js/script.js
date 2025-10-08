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

// Convert unix seconds to local time string using timezone offset (seconds)
function isoTimeToLocalHour(ts, tzOffsetSeconds = 0) {
  const date = new Date((ts + tzOffsetSeconds) * 1000);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
}

function buildCurrentCard(current, timezone_offset, placeName = '') {
  const weather = current.weather && current.weather[0];
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
        <p class="mb-1"><strong>Temperature:</strong> ${current.temp} °C (feels like ${current.feels_like} °C)</p>
        <p class="mb-1"><strong>Humidity:</strong> ${current.humidity}%</p>
        <p class="mb-1"><strong>Pressure:</strong> ${current.pressure} hPa</p>
        <p class="mb-1"><strong>Wind:</strong> ${current.wind_speed} m/s ${current.wind_deg ? current.wind_deg + '°' : ''}</p>
        <p class="mb-1"><strong>Observed:</strong> ${isoTimeToLocalHour(current.dt, timezone_offset)}</p>
      </div>
    </div>
  `;
}

function buildHourlyStrip(hourly, timezone_offset) {
  const slice = hourly.slice(0, 12);
  const items = slice.map(h => {
    const weather = h.weather && h.weather[0];
    const icon = weather ? `https://openweathermap.org/img/wn/${weather.icon}.png` : '';
    const time = isoTimeToLocalHour(h.dt, timezone_offset);
    return `
      <div class="text-center p-2 hourly-item" style="min-width:84px;">
        <div style="font-size:.85rem">${time}</div>
        ${icon ? `<img src="${icon}" alt="${weather.description}" style="width:48px; height:48px; object-fit:contain;">` : ''}
        <div style="font-weight:600">${Math.round(h.temp)}°</div>
      </div>
    `;
  }).join('');
  return `
    <h6 class="mt-3">Next 12 hours</h6>
    <div class="d-flex overflow-auto py-2">${items}</div>
  `;
}

async function fetchOneCall3(lat, lon) {
  const endpoint = `https://api.openweathermap.org/data/3.0/onecall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&exclude=minutely,alerts&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    let msgText = '';
    try {
      const j = await res.json();
      msgText = j.message || JSON.stringify(j);
    } catch {
      msgText = await res.text();
    }
    throw new Error(`API error ${res.status}: ${msgText}`);
  }
  return res.json();
}

async function reverseGeocode(lat, lon) {
  // Optional: returns human-friendly place name (uses OpenWeather Geocoding API)
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

  modalBodyContent.innerHTML = `<div class="text-center py-3" id="modalLoader">Loading…</div>`;
  modal.show();

  try {
    const data = await fetchOneCall3(lat, lon);
    const tzOffset = data.timezone_offset || 0;
    const placeName = await reverseGeocode(lat, lon);

    let html = '';
    if (data.current) html += buildCurrentCard(data.current, tzOffset, placeName);
    else html += `<div class="alert alert-warning">No current weather data available.</div>`;

    if (data.hourly && data.hourly.length) html += buildHourlyStrip(data.hourly, tzOffset);

    if (data.daily && data.daily.length) {
      const today = data.daily[0];
      html += `
        <hr>
        <h6>Today's summary</h6>
        <p class="mb-1"><strong>Sunrise:</strong> ${isoTimeToLocalHour(today.sunrise, tzOffset)} &nbsp; <strong>Sunset:</strong> ${isoTimeToLocalHour(today.sunset, tzOffset)}</p>
        <p class="mb-1">${today.weather && today.weather[0] ? today.weather[0].description : ''}</p>
      `;
    }

    modalBodyContent.innerHTML = html;
  } catch (err) {
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