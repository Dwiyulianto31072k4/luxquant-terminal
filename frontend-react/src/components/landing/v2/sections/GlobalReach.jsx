import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import countriesTopo from "world-atlas/countries-110m.json";

// ════════════════════════════════════════════════════════════════
// GLOBAL REACH — LuxQuant (v3)
// Canvas globe, no three.js / no react-globe.gl
//
// Choropleth = intensitas warna per negara mengikuti LEVEL REACH
// (blend DNS reach + Likes). 59 negara total: 57 diwarnai sebagai
// poligon, Hong Kong & Singapore tidak punya poligon di dataset
// countries-110m → ditonjolkan lewat node hub.
//
// Aturan khusus:
// - Indonesia sengaja ditaruh di tier terendah (walau reach-nya tinggi).
// - Hong Kong dipromosikan jadi salah satu top-3 hub (node primary).
// - Tidak ada angka query yang ditampilkan.
// ════════════════════════════════════════════════════════════════

const COLORS = {
  gold: "240,216,144",
  goldStrong: "251,243,218",
  goldMuted: "212,168,83",
  whiteSoft: "255,248,232",
};

// Intensitas warna per negara (ISO numeric) = level reach.
// Indonesia (360) dipaksa ke tier terendah. HK & SG tidak ada poligon.
const COUNTRY_INTENSITY = {
  "012": 0.097,
  "031": 0.06,
  "032": 0.06,
  "036": 0.152,
  "040": 0.077,
  "050": 0.114,
  "056": 0.126,
  "076": 0.141,
  100: 0.082,
  124: 0.13,
  152: 0.062,
  158: 0.096,
  203: 0.096,
  218: 0.053,
  233: 0.053,
  246: 0.07,
  250: 0.173,
  276: 0.209,
  288: 0.068,
  300: 0.076,
  348: 0.083,
  356: 0.439,
  360: 0.055,
  368: 0.068,
  380: 0.28,
  392: 0.32,
  410: 0.111,
  417: 0.066,
  434: 0.085,
  458: 0.147,
  484: 0.077,
  498: 0.128,
  504: 0.077,
  512: 0.06,
  528: 0.247,
  566: 0.155,
  586: 0.306,
  608: 0.101,
  616: 0.077,
  642: 0.08,
  643: 0.067,
  682: 0.289,
  686: 0.068,
  704: 0.114,
  705: 0.068,
  710: 0.085,
  724: 0.137,
  752: 0.113,
  756: 0.217,
  764: 0.086,
  784: 0.085,
  792: 0.266,
  804: 0.091,
  818: 0.101,
  826: 0.229,
  840: 0.409,
  887: 0.068,
};

// Cloudflare data centers (real). value dipakai hanya untuk ranking/seleksi hub, tidak ditampilkan.
const HUBS = [
  {
    code: "SIN",
    city: "Singapore",
    country: "Singapore",
    lat: 1.35,
    lng: 103.994,
    value: 14930,
    rank: 1,
  },
  {
    code: "CGK",
    city: "Jakarta",
    country: "Indonesia",
    lat: -6.126,
    lng: 106.656,
    value: 7600,
    rank: 2,
  },
  { code: "NRT", city: "Tokyo", country: "Japan", lat: 35.765, lng: 140.386, value: 7050, rank: 3 },
  {
    code: "RUH",
    city: "Riyadh",
    country: "Saudi Arabia",
    lat: 24.958,
    lng: 46.699,
    value: 4110,
    rank: 4,
  },
  {
    code: "KHI",
    city: "Karachi",
    country: "Pakistan",
    lat: 24.907,
    lng: 67.161,
    value: 2700,
    rank: 5,
  },
  {
    code: "AMS",
    city: "Amsterdam",
    country: "Netherlands",
    lat: 52.309,
    lng: 4.764,
    value: 1270,
    rank: 6,
  },
  {
    code: "HKG",
    city: "Hong Kong",
    country: "Hong Kong",
    lat: 22.309,
    lng: 113.915,
    value: 1110,
    rank: 7,
  },
  {
    code: "IAD",
    city: "Washington",
    country: "United States",
    lat: 38.947,
    lng: -77.46,
    value: 1030,
    rank: 8,
  },
  {
    code: "KIV",
    city: "Chisinau",
    country: "Moldova",
    lat: 46.928,
    lng: 28.931,
    value: 980,
    rank: 9,
  },
  {
    code: "DPS",
    city: "Denpasar",
    country: "Indonesia",
    lat: -8.748,
    lng: 115.167,
    value: 930,
    rank: 10,
  },
  {
    code: "LAX",
    city: "Los Angeles",
    country: "United States",
    lat: 33.942,
    lng: -118.408,
    value: 860,
    rank: 11,
  },
  {
    code: "LHR",
    city: "London",
    country: "United Kingdom",
    lat: 51.471,
    lng: -0.462,
    value: 740,
    rank: 12,
  },
  {
    code: "ZRH",
    city: "Zurich",
    country: "Switzerland",
    lat: 47.465,
    lng: 8.549,
    value: 740,
    rank: 13,
  },
  {
    code: "ORD",
    city: "Chicago",
    country: "United States",
    lat: 41.977,
    lng: -87.908,
    value: 740,
    rank: 14,
  },
  {
    code: "LHE",
    city: "Lahore",
    country: "Pakistan",
    lat: 31.522,
    lng: 74.404,
    value: 560,
    rank: 15,
  },
  {
    code: "KUL",
    city: "Kuala Lumpur",
    country: "Malaysia",
    lat: 2.746,
    lng: 101.71,
    value: 560,
    rank: 16,
  },
  {
    code: "SEA",
    city: "Seattle",
    country: "United States",
    lat: 47.45,
    lng: -122.312,
    value: 470,
    rank: 17,
  },
  {
    code: "DFW",
    city: "Dallas-Fort Worth",
    country: "United States",
    lat: 32.897,
    lng: -97.038,
    value: 420,
    rank: 18,
  },
  {
    code: "MEL",
    city: "Melbourne",
    country: "Australia",
    lat: -37.673,
    lng: 144.843,
    value: 410,
    rank: 19,
  },
  { code: "MXP", city: "Milano", country: "Italy", lat: 45.631, lng: 8.728, value: 400, rank: 20 },
  {
    code: "TPE",
    city: "Taipei",
    country: "Taiwan",
    lat: 25.078,
    lng: 121.233,
    value: 370,
    rank: 21,
  },
  {
    code: "FRA",
    city: "Frankfurt",
    country: "Germany",
    lat: 50.026,
    lng: 8.543,
    value: 360,
    rank: 22,
  },
  {
    code: "TXL",
    city: "Berlin",
    country: "Germany",
    lat: 52.56,
    lng: 13.288,
    value: 290,
    rank: 23,
  },
  { code: "MAA", city: "Chennai", country: "India", lat: 12.99, lng: 80.169, value: 270, rank: 24 },
  {
    code: "JED",
    city: "Jeddah",
    country: "Saudi Arabia",
    lat: 21.68,
    lng: 39.157,
    value: 260,
    rank: 25,
  },
  {
    code: "MRS",
    city: "Marseille",
    country: "France",
    lat: 43.439,
    lng: 5.221,
    value: 230,
    rank: 26,
  },
  {
    code: "BUD",
    city: "Budapest",
    country: "Hungary",
    lat: 47.437,
    lng: 19.256,
    value: 210,
    rank: 27,
  },
  {
    code: "YYZ",
    city: "Toronto",
    country: "Canada",
    lat: 43.677,
    lng: -79.631,
    value: 190,
    rank: 28,
  },
  {
    code: "EWR",
    city: "Newark",
    country: "United States",
    lat: 40.692,
    lng: -74.169,
    value: 180,
    rank: 29,
  },
  { code: "MAD", city: "Madrid", country: "Spain", lat: 40.494, lng: -3.567, value: 170, rank: 30 },
  {
    code: "MIA",
    city: "Miami",
    country: "United States",
    lat: 25.795,
    lng: -80.29,
    value: 150,
    rank: 31,
  },
  {
    code: "ATL",
    city: "Atlanta",
    country: "United States",
    lat: 33.637,
    lng: -84.428,
    value: 130,
    rank: 32,
  },
  {
    code: "ADL",
    city: "Adelaide",
    country: "Australia",
    lat: -34.945,
    lng: 138.531,
    value: 130,
    rank: 33,
  },
  { code: "BOM", city: "Mumbai", country: "India", lat: 19.089, lng: 72.868, value: 120, rank: 34 },
  {
    code: "SJC",
    city: "San Jose",
    country: "United States",
    lat: 37.363,
    lng: -121.929,
    value: 120,
    rank: 35,
  },
  {
    code: "PDX",
    city: "Portland",
    country: "United States",
    lat: 45.589,
    lng: -122.597,
    value: 110,
    rank: 36,
  },
  {
    code: "IST",
    city: "Istanbul",
    country: "Turkey",
    lat: 41.275,
    lng: 28.752,
    value: 100,
    rank: 37,
  },
  { code: "CDG", city: "Paris", country: "France", lat: 49.013, lng: 2.55, value: 100, rank: 38 },
  {
    code: "YUL",
    city: "Montreal",
    country: "Canada",
    lat: 45.471,
    lng: -73.741,
    value: 100,
    rank: 39,
  },
  { code: "KIX", city: "Osaka", country: "Japan", lat: 34.427, lng: 135.244, value: 90, rank: 40 },
  {
    code: "HEL",
    city: "Helsinki",
    country: "Finland",
    lat: 60.317,
    lng: 24.963,
    value: 90,
    rank: 41,
  },
  {
    code: "BCN",
    city: "Barcelona",
    country: "Spain",
    lat: 41.297,
    lng: 2.078,
    value: 70,
    rank: 42,
  },
  { code: "DME", city: "Moscow", country: "Russia", lat: 55.409, lng: 37.906, value: 70, rank: 43 },
  {
    code: "ARN",
    city: "Stockholm",
    country: "Sweden",
    lat: 59.652,
    lng: 17.919,
    value: 70,
    rank: 44,
  },
  { code: "DEL", city: "Delhi", country: "India", lat: 28.567, lng: 77.103, value: 60, rank: 45 },
  {
    code: "FRU",
    city: "Bishkek",
    country: "Kyrgyzstan",
    lat: 43.061,
    lng: 74.478,
    value: 60,
    rank: 46,
  },
  {
    code: "ICN",
    city: "Seoul",
    country: "South Korea",
    lat: 37.469,
    lng: 126.451,
    value: 60,
    rank: 47,
  },
  {
    code: "PHX",
    city: "Phoenix",
    country: "United States",
    lat: 33.434,
    lng: -112.012,
    value: 40,
    rank: 48,
  },
  {
    code: "FOR",
    city: "Fortaleza",
    country: "Brazil",
    lat: -3.776,
    lng: -38.533,
    value: 40,
    rank: 49,
  },
  { code: "CCU", city: "Kolkata", country: "India", lat: 22.655, lng: 88.447, value: 40, rank: 50 },
  {
    code: "SCL",
    city: "Santiago",
    country: "Chile",
    lat: -33.393,
    lng: -70.786,
    value: 40,
    rank: 51,
  },
  {
    code: "GRU",
    city: "Sao Paulo",
    country: "Brazil",
    lat: -23.436,
    lng: -46.473,
    value: 40,
    rank: 52,
  },
  {
    code: "JDO",
    city: "Juazeiro Do Norte",
    country: "Brazil",
    lat: -7.219,
    lng: -39.27,
    value: 40,
    rank: 53,
  },
  {
    code: "PIT",
    city: "Pittsburgh",
    country: "United States",
    lat: 40.491,
    lng: -80.233,
    value: 40,
    rank: 54,
  },
  {
    code: "LLK",
    city: "Lankaran",
    country: "Azerbaijan",
    lat: 38.746,
    lng: 48.818,
    value: 30,
    rank: 55,
  },
  {
    code: "SOF",
    city: "Sofia",
    country: "Bulgaria",
    lat: 42.697,
    lng: 23.411,
    value: 30,
    rank: 56,
  },
  { code: "MCT", city: "Muscat", country: "Oman", lat: 23.593, lng: 58.284, value: 30, rank: 57 },
  {
    code: "CLT",
    city: "Charlotte",
    country: "United States",
    lat: 35.213,
    lng: -80.951,
    value: 20,
    rank: 58,
  },
  {
    code: "DEN",
    city: "Denver",
    country: "United States",
    lat: 39.862,
    lng: -104.673,
    value: 20,
    rank: 59,
  },
  { code: "HAM", city: "Hamburg", country: "Germany", lat: 53.63, lng: 9.988, value: 20, rank: 60 },
  {
    code: "DTW",
    city: "Detroit",
    country: "United States",
    lat: 42.212,
    lng: -83.353,
    value: 20,
    rank: 61,
  },
  {
    code: "GIG",
    city: "Rio De Janeiro",
    country: "Brazil",
    lat: -22.81,
    lng: -43.251,
    value: 20,
    rank: 62,
  },
  {
    code: "EZE",
    city: "Buenos Aires",
    country: "Argentina",
    lat: -34.822,
    lng: -58.536,
    value: 20,
    rank: 63,
  },
  { code: "AAE", city: "Annaba", country: "Algeria", lat: 36.822, lng: 7.809, value: 20, rank: 64 },
  {
    code: "OTP",
    city: "Bucharest",
    country: "Romania",
    lat: 44.572,
    lng: 26.102,
    value: 20,
    rank: 65,
  },
  {
    code: "BRU",
    city: "Brussels",
    country: "Belgium",
    lat: 50.541,
    lng: 4.29,
    value: 20,
    rank: 66,
  },
  {
    code: "TLL",
    city: "Tallinn-ulemiste International",
    country: "Estonia",
    lat: 59.413,
    lng: 24.833,
    value: 10,
    rank: 67,
  },
  {
    code: "DUS",
    city: "Duesseldorf",
    country: "Germany",
    lat: 51.289,
    lng: 6.767,
    value: 10,
    rank: 68,
  },
  {
    code: "NQN",
    city: "Neuquen",
    country: "Argentina",
    lat: -38.949,
    lng: -68.156,
    value: 10,
    rank: 69,
  },
  {
    code: "BLR",
    city: "Bangalore",
    country: "India",
    lat: 13.198,
    lng: 77.706,
    value: 10,
    rank: 70,
  },
  {
    code: "BKK",
    city: "Bangkok",
    country: "Thailand",
    lat: 13.681,
    lng: 100.747,
    value: 10,
    rank: 71,
  },
  {
    code: "MSP",
    city: "Minneapolis",
    country: "United States",
    lat: 44.882,
    lng: -93.222,
    value: 10,
    rank: 72,
  },
  {
    code: "GYE",
    city: "Guayaquil",
    country: "Ecuador",
    lat: -2.157,
    lng: -79.884,
    value: 10,
    rank: 73,
  },
  { code: "ATH", city: "Athens", country: "Greece", lat: 37.936, lng: 23.945, value: 10, rank: 74 },
  {
    code: "PHL",
    city: "Philadelphia",
    country: "United States",
    lat: 39.872,
    lng: -75.241,
    value: 10,
    rank: 75,
  },
];

const ORIGIN_CODE = "TPE"; // Taipei — Core Operations
const MAJOR_RANK = 16; // top-16 by volume → hub yang dijangkau panah
const PRIMARY_CODES = ["SIN", "NRT", "HKG"]; // top-3 hub (Hong Kong dipromosikan)

const REGION_LABELS = [
  { name: "East Asia", lat: 33, lng: 122, size: 13 },
  { name: "Southeast Asia", lat: 8, lng: 111, size: 12 },
  { name: "South Asia", lat: 20, lng: 78, size: 12 },
  { name: "Middle East", lat: 28, lng: 48, size: 12 },
  { name: "Europe", lat: 50, lng: 12, size: 13 },
  { name: "North America", lat: 42, lng: -98, size: 13 },
  { name: "South America", lat: -20, lng: -58, size: 12 },
  { name: "Africa", lat: 2, lng: 20, size: 12 },
  { name: "Oceania", lat: -26, lng: 142, size: 12 },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const degToRad = (deg) => (deg * Math.PI) / 180;

function latLngToVector(lat, lng) {
  const latRad = degToRad(lat);
  const lngRad = degToRad(lng);

  return {
    x: Math.cos(latRad) * Math.sin(lngRad),
    y: Math.sin(latRad),
    z: Math.cos(latRad) * Math.cos(lngRad),
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function multiply(vector, scalar) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

function rotateVector(vector, yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  const yawX = cosYaw * vector.x - sinYaw * vector.z;
  const yawZ = sinYaw * vector.x + cosYaw * vector.z;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  return {
    x: yawX,
    y: cosPitch * vector.y - sinPitch * yawZ,
    z: sinPitch * vector.y + cosPitch * yawZ,
  };
}

function projectVector(vector, radius, cx, cy, yaw, pitch) {
  const rotated = rotateVector(vector, yaw, pitch);

  if (rotated.z <= 0.018) return null;

  return {
    x: cx + rotated.x * radius,
    y: cy - rotated.y * radius,
    depth: rotated.z,
  };
}

function slerp(start, end, t) {
  const dot = clamp(start.x * end.x + start.y * end.y + start.z * end.z, -1, 1);

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (sinOmega < 0.0001) {
    return normalize({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t,
    });
  }

  const startWeight = Math.sin((1 - t) * omega) / sinOmega;
  const endWeight = Math.sin(t * omega) / sinOmega;

  return normalize({
    x: start.x * startWeight + end.x * endWeight,
    y: start.y * startWeight + end.y * endWeight,
    z: start.z * startWeight + end.z * endWeight,
  });
}

function collectCountryRings(geometry, target) {
  if (!geometry) return;

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => target.push(ring));
    return;
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => {
      polygon.forEach((ring) => target.push(ring));
    });
  }
}

// Country shapes (densified rings) + intensity per negara untuk choropleth.
function createCountryShapes() {
  const feats = feature(countriesTopo, countriesTopo.objects.countries).features;

  return feats
    .map((f) => {
      const intensity = COUNTRY_INTENSITY[f.id] || 0;
      const raw = [];
      collectCountryRings(f.geometry, raw);

      const rings = [];
      raw.forEach((ring) => {
        if (ring.length < 3) return;
        const dense = [];
        for (let i = 1; i < ring.length; i += 1) {
          const [pLng, pLat] = ring[i - 1];
          const [nLngRaw, nLat] = ring[i];
          let dLng = nLngRaw - pLng;
          if (dLng > 180) dLng -= 360;
          if (dLng < -180) dLng += 360;
          const dLat = nLat - pLat;
          const dist = Math.hypot(dLng, dLat);
          const steps = clamp(Math.ceil(dist / 6), 1, 5);
          for (let s = 0; s <= steps; s += 1) {
            const r = s / steps;
            let lng = pLng + dLng * r;
            if (lng > 180) lng -= 360;
            if (lng < -180) lng += 360;
            dense.push(latLngToVector(pLat + dLat * r, lng));
          }
        }
        if (dense.length > 2) rings.push(dense);
      });

      return { intensity, rings };
    })
    .filter((c) => c.rings.length);
}

const COUNTRY_SHAPES = createCountryShapes();

// 59 country nodes — tiap negara diwakili 1 titik.
// Negara yang punya data center pakai koordinat kotanya; yang hanya
// muncul dari Likes pakai ibu kotanya. Indonesia diredupkan, Hong Kong
// dipromosikan jadi primary. tier: primary | indonesia | hub | reach | origin.
const COUNTRY_NODES = [
  {
    country: "Singapore",
    city: "Singapore",
    lat: 1.35,
    lng: 103.994,
    tier: "primary",
    arc: true,
    label: true,
  },
  {
    country: "Japan",
    city: "Tokyo",
    lat: 35.765,
    lng: 140.386,
    tier: "primary",
    arc: true,
    label: true,
  },
  {
    country: "Hong Kong",
    city: "Hong Kong",
    lat: 22.309,
    lng: 113.915,
    tier: "primary",
    arc: true,
    label: true,
  },
  {
    country: "Indonesia",
    city: "Jakarta",
    lat: -6.126,
    lng: 106.656,
    tier: "indonesia",
    arc: true,
    label: true,
  },
  {
    country: "Saudi Arabia",
    city: "Riyadh",
    lat: 24.958,
    lng: 46.699,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Pakistan",
    city: "Karachi",
    lat: 24.907,
    lng: 67.161,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Netherlands",
    city: "Amsterdam",
    lat: 52.309,
    lng: 4.764,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "United States",
    city: "Washington",
    lat: 38.947,
    lng: -77.46,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Moldova",
    city: "Chisinau",
    lat: 46.928,
    lng: 28.931,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "United Kingdom",
    city: "London",
    lat: 51.471,
    lng: -0.462,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Switzerland",
    city: "Zurich",
    lat: 47.465,
    lng: 8.549,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Malaysia",
    city: "Kuala Lumpur",
    lat: 2.746,
    lng: 101.71,
    tier: "hub",
    arc: true,
    label: true,
  },
  {
    country: "Australia",
    city: "Melbourne",
    lat: -37.673,
    lng: 144.843,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Italy",
    city: "Milano",
    lat: 45.631,
    lng: 8.728,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Taiwan",
    city: "Taipei",
    lat: 25.078,
    lng: 121.233,
    tier: "origin",
    arc: false,
    label: true,
  },
  {
    country: "Germany",
    city: "Frankfurt",
    lat: 50.026,
    lng: 8.543,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "India",
    city: "Chennai",
    lat: 12.99,
    lng: 80.169,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "France",
    city: "Marseille",
    lat: 43.439,
    lng: 5.221,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Hungary",
    city: "Budapest",
    lat: 47.437,
    lng: 19.256,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Canada",
    city: "Toronto",
    lat: 43.677,
    lng: -79.631,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Spain",
    city: "Madrid",
    lat: 40.494,
    lng: -3.567,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Turkey",
    city: "Istanbul",
    lat: 41.275,
    lng: 28.752,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Finland",
    city: "Helsinki",
    lat: 60.317,
    lng: 24.963,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Russia",
    city: "Moscow",
    lat: 55.409,
    lng: 37.906,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Sweden",
    city: "Stockholm",
    lat: 59.652,
    lng: 17.919,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Kyrgyzstan",
    city: "Bishkek",
    lat: 43.061,
    lng: 74.478,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "South Korea",
    city: "Seoul",
    lat: 37.469,
    lng: 126.451,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Brazil",
    city: "Sao Paulo",
    lat: -23.436,
    lng: -46.473,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Chile",
    city: "Santiago",
    lat: -33.393,
    lng: -70.786,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Azerbaijan",
    city: "Lankaran",
    lat: 38.746,
    lng: 48.818,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Bulgaria",
    city: "Sofia",
    lat: 42.697,
    lng: 23.411,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Oman",
    city: "Muscat",
    lat: 23.593,
    lng: 58.284,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Argentina",
    city: "Buenos Aires",
    lat: -34.822,
    lng: -58.536,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Algeria",
    city: "Annaba",
    lat: 36.822,
    lng: 7.809,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Romania",
    city: "Bucharest",
    lat: 44.572,
    lng: 26.102,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Belgium",
    city: "Brussels",
    lat: 50.541,
    lng: 4.29,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Estonia",
    city: "Tallinn",
    lat: 59.413,
    lng: 24.833,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Thailand",
    city: "Bangkok",
    lat: 13.681,
    lng: 100.747,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Ecuador",
    city: "Guayaquil",
    lat: -2.157,
    lng: -79.884,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Greece",
    city: "Athens",
    lat: 37.936,
    lng: 23.945,
    tier: "hub",
    arc: false,
    label: false,
  },
  {
    country: "Nigeria",
    city: "Abuja",
    lat: 9.08,
    lng: 7.4,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Vietnam",
    city: "Hanoi",
    lat: 21.03,
    lng: 105.85,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Bangladesh",
    city: "Dhaka",
    lat: 23.81,
    lng: 90.41,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Philippines",
    city: "Manila",
    lat: 14.6,
    lng: 120.98,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Egypt",
    city: "Cairo",
    lat: 30.04,
    lng: 31.24,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Czechia",
    city: "Prague",
    lat: 50.08,
    lng: 14.44,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Ukraine",
    city: "Kyiv",
    lat: 50.45,
    lng: 30.52,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "South Africa",
    city: "Johannesburg",
    lat: -26.2,
    lng: 28.05,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "United Arab Emirates",
    city: "Dubai",
    lat: 25.2,
    lng: 55.27,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Libya",
    city: "Tripoli",
    lat: 32.89,
    lng: 13.19,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Morocco",
    city: "Casablanca",
    lat: 33.57,
    lng: -7.59,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Poland",
    city: "Warsaw",
    lat: 52.23,
    lng: 21.01,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Mexico",
    city: "Mexico City",
    lat: 19.43,
    lng: -99.13,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Austria",
    city: "Vienna",
    lat: 48.21,
    lng: 16.37,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Iraq",
    city: "Baghdad",
    lat: 33.31,
    lng: 44.36,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Ghana",
    city: "Accra",
    lat: 5.6,
    lng: -0.19,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Senegal",
    city: "Dakar",
    lat: 14.72,
    lng: -17.47,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Yemen",
    city: "Sanaa",
    lat: 15.37,
    lng: 44.19,
    tier: "reach",
    arc: false,
    label: false,
  },
  {
    country: "Slovenia",
    city: "Ljubljana",
    lat: 46.05,
    lng: 14.51,
    tier: "reach",
    arc: false,
    label: false,
  },
];

const NODE_RADIUS = 3.2;

const HUB_POINTS = COUNTRY_NODES.map((node, i) => {
  const isOrigin = node.tier === "origin";
  const isIndonesia = node.tier === "indonesia";
  const isPrimary = node.tier === "primary";
  const isReach = node.tier === "reach";
  const isMajor = node.arc; // hub utama: panah beranimasi + label + denyut

  return {
    ...node,
    isOrigin,
    isIndonesia,
    isPrimary,
    isReach,
    isMajor,
    hasArc: !isOrigin, // SEMUA negara dapat arc, kecuali origin (Taipei)
    vector: latLngToVector(node.lat, node.lng),
    nodeRadius: isPrimary ? NODE_RADIUS * 1.55 : isReach ? NODE_RADIUS * 0.62 : NODE_RADIUS,
    // denyut hanya untuk hub utama + origin → kurangi noise
    pulse: (isMajor || isOrigin) && !isIndonesia,
    pulseSize: isPrimary ? 15 : 11,
    pulseSpeed: 1900 + (i % 5) * 240,
    label: node.label,
  };
});

const ORIGIN_HUB = HUB_POINTS.find((h) => h.isOrigin) || HUB_POINTS[0];
const ORIGIN_VECTOR = ORIGIN_HUB.vector;

const ARCS = HUB_POINTS.filter((h) => h.hasArc).map((hub, index) => ({
  code: hub.country,
  dim: hub.isIndonesia,
  reach: hub.isReach,
  major: hub.isMajor,
  start: ORIGIN_VECTOR,
  end: hub.vector,
  duration: 2800 + (index % 5) * 280,
  offset: (index * 0.173) % 1,
}));

const REGION_POINTS = REGION_LABELS.map((region) => ({
  ...region,
  vector: latLngToVector(region.lat, region.lng),
}));

function drawVectorPath(ctx, vectors, radius, cx, cy, yaw, pitch) {
  let drawing = false;

  ctx.beginPath();

  vectors.forEach((vector) => {
    const point = projectVector(vector, radius, cx, cy, yaw, pitch);

    if (!point) {
      drawing = false;
      return;
    }

    if (!drawing) {
      ctx.moveTo(point.x, point.y);
      drawing = true;
      return;
    }

    ctx.lineTo(point.x, point.y);
  });

  ctx.stroke();
}

function drawGrid(ctx, radius, cx, cy, yaw, pitch) {
  ctx.save();
  ctx.lineWidth = 0.5;
  // Canvas 2D cannot parse CSS vars — keep concrete rgba only
  ctx.strokeStyle = "rgba(212,168,83,0.06)";

  [-60, -30, 0, 30, 60].forEach((lat) => {
    const points = [];
    for (let lng = -180; lng <= 180; lng += 3) {
      points.push(latLngToVector(lat, lng));
    }
    drawVectorPath(ctx, points, radius, cx, cy, yaw, pitch);
  });

  [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].forEach((lng) => {
    const points = [];
    for (let lat = -88; lat <= 88; lat += 3) {
      points.push(latLngToVector(lat, lng));
    }
    drawVectorPath(ctx, points, radius, cx, cy, yaw, pitch);
  });

  ctx.restore();
}

// Choropleth: isi tiap negara dengan intensitas warna (makin tinggi
// makin mencolok). Titik di sisi belakang "didrape" ke tepi bola biar
// poligon yang melewati cakrawala tetap rapi (lalu di-clip ke lingkaran).
function drawChoropleth(ctx, radius, cx, cy, yaw, pitch) {
  COUNTRY_SHAPES.forEach((country) => {
    const alpha = 0.045 + country.intensity * 0.5;

    ctx.beginPath();

    country.rings.forEach((ring) => {
      let visible = 0;
      const pts = ring.map((vec) => {
        const rot = rotateVector(vec, yaw, pitch);
        if (rot.z > 0.02) {
          visible += 1;
          return { x: cx + rot.x * radius, y: cy - rot.y * radius };
        }
        const len = Math.hypot(rot.x, rot.y) || 1;
        return {
          x: cx + (rot.x / len) * radius * 0.999,
          y: cy - (rot.y / len) * radius * 0.999,
        };
      });

      if (visible === 0) return;

      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    });

    ctx.fillStyle = `rgba(${COLORS.goldMuted},${alpha})`;
    ctx.fill();
  });
}

// Garis batas negara (front-face di-cull otomatis), 1 stroke.
function drawCountryOutlines(ctx, radius, cx, cy, yaw, pitch) {
  ctx.save();
  ctx.beginPath();

  COUNTRY_SHAPES.forEach((country) => {
    country.rings.forEach((ring) => {
      let drawing = false;
      for (let i = 0; i < ring.length; i += 1) {
        const point = projectVector(ring[i], radius, cx, cy, yaw, pitch);
        if (!point) {
          drawing = false;
          continue;
        }
        if (!drawing) {
          ctx.moveTo(point.x, point.y);
          drawing = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
    });
  });

  ctx.strokeStyle = `rgba(${COLORS.goldMuted},0.16)`;
  ctx.lineWidth = 0.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawArc(
  ctx,
  arc,
  startT,
  endT,
  radius,
  cx,
  cy,
  yaw,
  pitch,
  color,
  lineWidth,
  shadowBlur = 0
) {
  let drawing = false;
  const segments = Math.max(6, Math.round((endT - startT) * 46));

  ctx.beginPath();

  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const t = startT + (endT - startT) * ratio;

    const curve = slerp(arc.start, arc.end, t);
    const elevation = 1 + Math.sin(Math.PI * t) * 0.29;

    const point = projectVector(multiply(curve, elevation), radius, cx, cy, yaw, pitch);

    if (!point) {
      drawing = false;
      continue;
    }

    if (!drawing) {
      ctx.moveTo(point.x, point.y);
      drawing = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = color;
  ctx.shadowBlur = shadowBlur;
  ctx.stroke();
  ctx.restore();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawHoverPill(ctx, x, y, text) {
  ctx.save();
  ctx.font = "600 11px Inter, ui-sans-serif, system-ui, sans-serif";

  const paddingX = 11;
  const height = 28;
  const width = ctx.measureText(text).width + paddingX * 2;

  const left = x + 16;
  const top = y - height / 2;

  ctx.shadowColor = "rgba(212,168,83,0.32)";
  ctx.shadowBlur = 20;

  roundedRectPath(ctx, left, top, width, height, 10);
  ctx.fillStyle = "rgba(15,9,10,0.92)";
  ctx.fill();

  ctx.shadowBlur = 0;

  roundedRectPath(ctx, left, top, width, height, 10);
  ctx.strokeStyle = "rgba(240,216,144,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(251,243,218,0.96)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + paddingX, top + height / 2 + 0.5);

  ctx.restore();
}

function drawRegionText(ctx, x, y, text, size = 12, alpha = 0.28) {
  ctx.save();
  ctx.font = `600 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(${COLORS.gold},${alpha})`;
  ctx.shadowColor = `rgba(${COLORS.gold},0.18)`;
  ctx.shadowBlur = 12;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCityLabel(ctx, x, y, cityText, alpha = 0.5) {
  ctx.save();
  ctx.font = "500 10px Inter, ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `rgba(${COLORS.whiteSoft},${alpha})`;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.fillText(cityText, x, y);
  ctx.restore();
}

function rectsOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function CanvasGlobe() {
  const canvasRef = useRef(null);

  const interactionRef = useRef({
    pointer: { x: 0, y: 0, inside: false },
    hoveredIndex: -1,
    dragging: false,
  });

  const sceneRef = useRef({
    radius: 0,
    cx: 0,
    cy: 0,
    yaw: 0,
    pitch: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext("2d");
    const container = canvas.parentElement;

    if (!context || !container) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;

    let yaw = -degToRad(112);
    let pitch = -0.16;

    const drag = { x: 0, y: 0 };

    const getPointerPosition = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const updateHoverTarget = (x, y) => {
      const scene = sceneRef.current;
      const state = interactionRef.current;

      if (!scene.radius) return;

      const distanceFromCenter = Math.hypot(x - scene.cx, y - scene.cy);
      const insideGlobe = distanceFromCenter <= scene.radius * 1.07;

      state.pointer = { x, y, inside: insideGlobe };

      let closestIndex = -1;
      let closestDistance = Infinity;

      HUB_POINTS.forEach((hub, index) => {
        const point = projectVector(
          hub.vector,
          scene.radius,
          scene.cx,
          scene.cy,
          scene.yaw,
          scene.pitch
        );

        if (!point) return;

        const distance = Math.hypot(point.x - x, point.y - y);
        const hitRadius = hub.isOrigin ? 24 : 16;

        if (distance < hitRadius && distance < closestDistance) {
          closestIndex = index;
          closestDistance = distance;
        }
      });

      state.hoveredIndex = closestIndex;

      if (state.dragging) {
        canvas.style.cursor = "grabbing";
      } else if (closestIndex >= 0) {
        canvas.style.cursor = "pointer";
      } else if (insideGlobe) {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = "default";
      }
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();

      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const draw = (time) => {
      try {
        context.clearRect(0, 0, width, height);

        const interaction = interactionRef.current;

        if (!interaction.dragging) {
          yaw -= interaction.pointer.inside ? 0.00045 : 0.00108;
        }

        const radius = Math.min(width * 0.46, height * 0.46);
        const cx = width / 2;
        const cy = height * 0.5;

        sceneRef.current = { radius, cx, cy, yaw, pitch };

        const hoveredHub =
          interaction.hoveredIndex >= 0 ? HUB_POINTS[interaction.hoveredIndex] : null;
        const hoveredCode = hoveredHub ? hoveredHub.country : null;

        let activeLabel = null;

        // Back ambient glow — halus
        context.save();
        const ambientGlow = context.createRadialGradient(
          cx,
          cy,
          radius * 0.12,
          cx,
          cy,
          radius * 1.85
        );
        // Warm brown halo in Luxquant; neutral grey in Dark (solid-black taste).
        const glowDark = document.documentElement.dataset.theme === "dark";
        ambientGlow.addColorStop(0, glowDark ? "rgba(42,42,46,0.10)" : "rgba(70,30,28,0.12)");
        ambientGlow.addColorStop(0.32, glowDark ? "rgba(28,28,32,0.05)" : "rgba(45,20,20,0.06)");
        ambientGlow.addColorStop(0.62, glowDark ? "rgba(15,15,17,0.02)" : "rgba(22,11,11,0.025)");
        ambientGlow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = ambientGlow;
        context.fillRect(cx - radius * 1.9, cy - radius * 1.9, radius * 3.8, radius * 3.8);
        context.restore();

        // Atmosphere rim removed — no gold halo wrapping the globe (kept dark
        // so the globe sits flat against the page's red/black theme).

        // Sphere clip
        context.save();
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.clip();

        const globeGradient = context.createRadialGradient(
          cx - radius * 0.28,
          cy - radius * 0.32,
          radius * 0.05,
          cx,
          cy,
          radius * 1.02
        );
        globeGradient.addColorStop(0, "rgba(44,17,16,0.92)");
        globeGradient.addColorStop(0.4, "rgba(25,11,12,0.8)");
        globeGradient.addColorStop(0.72, "rgba(14,7,8,0.46)");
        globeGradient.addColorStop(0.9, "rgba(10,5,6,0.16)");
        globeGradient.addColorStop(1, "rgba(10,5,6,0)");

        context.fillStyle = globeGradient;
        context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

        if (interaction.pointer.inside) {
          const pointerGlow = context.createRadialGradient(
            interaction.pointer.x,
            interaction.pointer.y,
            0,
            interaction.pointer.x,
            interaction.pointer.y,
            radius * 0.52
          );
          pointerGlow.addColorStop(0, "rgba(240,216,144,0.09)");
          pointerGlow.addColorStop(0.35, "rgba(212,168,83,0.035)");
          pointerGlow.addColorStop(1, "rgba(212,168,83,0)");

          context.save();
          context.globalCompositeOperation = "screen";
          context.fillStyle = pointerGlow;
          context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
          context.restore();
        }

        drawGrid(context, radius, cx, cy, yaw, pitch);
        drawChoropleth(context, radius, cx, cy, yaw, pitch);
        drawCountryOutlines(context, radius, cx, cy, yaw, pitch);

        // Background arcs — garis penghubung statis ke SEMUA negara (murah, no shadow)
        ARCS.forEach((arc) => {
          const isActiveArc = arc.code === hoveredCode;
          const baseAlpha = arc.dim ? 0.05 : arc.reach ? 0.09 : 0.1;
          drawArc(
            context,
            arc,
            0,
            1,
            radius,
            cx,
            cy,
            yaw,
            pitch,
            isActiveArc ? `rgba(${COLORS.gold},0.38)` : `rgba(${COLORS.gold},${baseAlpha})`,
            isActiveArc ? 1.15 : 0.55,
            isActiveArc ? 8 : 0
          );
        });

        // Animated highlight arcs — hanya hub utama yang "mengalir" (reach tetap garis statis)
        ARCS.forEach((arc, index) => {
          const isActiveArc = arc.code === hoveredCode;
          if (arc.reach && !isActiveArc) return;
          const progress = (((time / arc.duration + arc.offset) % 1) + 1) % 1;
          const tailLength = isActiveArc ? 0.42 : 0.22;
          const start = Math.max(0, progress - tailLength);

          const baseColor = arc.dim ? `rgba(${COLORS.gold},0.45)` : `rgba(${COLORS.gold},0.8)`;

          drawArc(
            context,
            arc,
            start,
            progress,
            radius,
            cx,
            cy,
            yaw,
            pitch,
            isActiveArc ? `rgba(${COLORS.goldStrong},1)` : baseColor,
            isActiveArc ? 2.2 : arc.dim ? 0.7 : 1.05,
            isActiveArc ? 16 : arc.dim ? 3 : 6
          );
        });

        const placedRects = [];

        // Region labels
        REGION_POINTS.forEach((region) => {
          const point = projectVector(region.vector, radius, cx, cy, yaw, pitch);
          if (!point || point.depth < 0.22) return;

          const labelWidth = region.name.length * 6.2;
          const rect = {
            x: point.x - labelWidth / 2,
            y: point.y - 8,
            w: labelWidth,
            h: 16,
          };

          const hasCollision = placedRects.some((r) => rectsOverlap(r, rect));
          if (hasCollision) return;

          placedRects.push(rect);
          drawRegionText(
            context,
            point.x,
            point.y,
            region.name,
            region.size,
            0.24 + point.depth * 0.08
          );
        });

        // Hub nodes
        HUB_POINTS.forEach((hub, index) => {
          const point = projectVector(hub.vector, radius, cx, cy, yaw, pitch);
          if (!point) return;

          const isHovered = interaction.hoveredIndex === index;
          const baseRadius = hub.nodeRadius * (isHovered ? 1.7 : 1);

          context.save();
          context.globalCompositeOperation = "lighter";

          if (hub.pulse) {
            const phase = (((time / hub.pulseSpeed + index * 0.07) % 1) + 1) % 1;
            const pulseRadius =
              baseRadius +
              phase * hub.pulseSize * (isHovered ? 1.8 : 1) * (0.6 + point.depth * 0.34);

            context.beginPath();
            context.arc(point.x, point.y, pulseRadius, 0, Math.PI * 2);
            context.strokeStyle = `rgba(${COLORS.gold},${(1 - phase) * (isHovered ? 0.82 : 0.26)})`;
            context.lineWidth = isHovered ? 1.45 : hub.isOrigin || hub.isPrimary ? 1.12 : 0.75;
            context.stroke();

            if (isHovered) {
              context.beginPath();
              context.arc(point.x, point.y, pulseRadius * 0.55, 0, Math.PI * 2);
              context.strokeStyle = `rgba(${COLORS.goldStrong},0.36)`;
              context.lineWidth = 0.9;
              context.stroke();
            }
          }

          context.beginPath();
          context.arc(point.x, point.y, baseRadius, 0, Math.PI * 2);

          if (isHovered) {
            context.fillStyle = `rgba(${COLORS.goldStrong},1)`;
          } else if (hub.isIndonesia) {
            context.fillStyle = `rgba(${COLORS.gold},0.3)`;
          } else if (hub.isPrimary) {
            context.fillStyle = `rgba(${COLORS.goldStrong},1)`;
          } else if (hub.isReach) {
            context.fillStyle = `rgba(${COLORS.gold},0.55)`;
          } else {
            context.fillStyle = `rgba(${COLORS.gold},0.95)`;
          }

          context.shadowColor = `rgba(${COLORS.gold},0.9)`;
          context.shadowBlur = isHovered ? 18 : hub.isPrimary || hub.isOrigin ? 12 : 0;
          context.fill();

          context.restore();

          // persistent label (origin + major only)
          if (hub.label && point.depth > 0.24 && !isHovered) {
            const text = `${hub.city}, ${hub.country}`;

            context.save();
            context.font = "500 10px Inter, ui-sans-serif, system-ui, sans-serif";
            const textWidth = context.measureText(text).width;
            context.restore();

            const labelX = point.x + 10;
            const labelY = point.y - 2;

            const rect = {
              x: labelX - 2,
              y: labelY - 7,
              w: textWidth + 4,
              h: 14,
            };

            const hasCollision = placedRects.some((r) => rectsOverlap(r, rect));

            if (!hasCollision) {
              placedRects.push(rect);
              drawCityLabel(
                context,
                labelX,
                labelY,
                text,
                hub.isIndonesia ? 0.28 : hub.isOrigin || hub.isPrimary ? 0.72 : 0.55
              );
            }
          }

          if (isHovered) {
            activeLabel = {
              x: point.x,
              y: point.y,
              text: hub.isOrigin
                ? `${hub.city}, ${hub.country} · Core Operations`
                : hub.isReach
                  ? `${hub.country}`
                  : `${hub.city}, ${hub.country}`,
            };
          }
        });

        // Edge fade — rim transparan
        const edgeFade = context.createRadialGradient(cx, cy, radius * 0.42, cx, cy, radius);
        edgeFade.addColorStop(0, "rgba(8,4,5,0)");
        edgeFade.addColorStop(0.66, "rgba(8,4,5,0)");
        edgeFade.addColorStop(0.86, "rgba(24,11,10,0.08)");
        edgeFade.addColorStop(0.96, "rgba(14,7,8,0.03)");
        edgeFade.addColorStop(1, "rgba(10,5,6,0)");

        context.fillStyle = edgeFade;
        context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

        context.restore();

        if (activeLabel) {
          drawHoverPill(context, activeLabel.x, activeLabel.y, activeLabel.text);
        }
      } catch (err) {
        // Never kill the rAF loop — invalid colors / rare canvas errors
        if (typeof console !== "undefined") console.warn("[GlobalReach] draw frame failed", err);
      }

      raf = requestAnimationFrame(draw);
    };

    const onPointerDown = (event) => {
      const point = getPointerPosition(event);
      interactionRef.current.dragging = true;
      drag.x = point.x;
      drag.y = point.y;
      updateHoverTarget(point.x, point.y);

      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event) => {
      const point = getPointerPosition(event);
      const interaction = interactionRef.current;

      if (interaction.dragging) {
        const deltaX = point.x - drag.x;
        const deltaY = point.y - drag.y;

        yaw += deltaX * 0.007;
        pitch = clamp(pitch + deltaY * 0.004, -0.82, 0.82);

        drag.x = point.x;
        drag.y = point.y;

        interaction.pointer = {
          x: point.x,
          y: point.y,
          inside: true,
        };
        interaction.hoveredIndex = -1;
        canvas.style.cursor = "grabbing";
        return;
      }

      updateHoverTarget(point.x, point.y);
    };

    const onPointerUp = (event) => {
      const point = getPointerPosition(event);
      interactionRef.current.dragging = false;
      updateHoverTarget(point.x, point.y);

      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerLeave = () => {
      if (interactionRef.current.dragging) return;

      interactionRef.current.pointer.inside = false;
      interactionRef.current.hoveredIndex = -1;
      canvas.style.cursor = "default";
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div className="relative h-full w-full select-none">
      <canvas
        ref={canvasRef}
        aria-label="Interactive LuxQuant global network map"
        className="block h-full w-full cursor-grab active:cursor-grabbing"
        style={{
          touchAction: "none",
          // fade the globe's top + bottom edges into the page canvas so
          // there's no hard rectangle / seam — only the globe itself fades,
          // the hint caption below stays fully visible.
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 9%, #000 58%, transparent 96%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 9%, #000 58%, transparent 96%)",
        }}
      />
    </div>
  );
}

export default function GlobalReach() {
  const [inView, setInView] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        observer.disconnect();
      },
      { rootMargin: "240px" }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="global-reach"
      className="relative z-10 overflow-hidden pt-20 pb-4 lg:pt-28 lg:pb-6"
    >
      {/* Subtle additive glow behind the globe only — no section-level
 background block, so it blends into the page's continuous canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[40%]"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 50% 80%, rgba(110,42,30,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted">
            <span className="h-px w-7 bg-gradient-to-r from-transparent to-accent/55" />
            Global Reach
            <span className="h-px w-7 bg-gradient-to-l from-transparent to-accent/55" />
          </span>

          <h2 className="mt-5 text-[2rem] font-bold leading-[1.08] tracking-tight text-text-primary sm:text-[2.8rem] lg:text-[3.3rem]">
            Precision Intelligence,{" "}
            <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
              Serving Globally.
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-text-primary/45 sm:text-base">
            A quantitative engine built in Taiwan, running non-stop to read what moves the market —
            and constantly evolving to deliver exactly what our users need, wherever they are.
          </p>
        </div>
      </div>

      <div
        ref={sentinelRef}
        className="relative z-10 mx-auto mb-0 mt-12 h-[560px] w-full max-w-[1600px] sm:mb-0 sm:mt-16 sm:h-[760px] lg:mt-20 lg:h-[940px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(84,28,20,0.05) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />

        <div className="absolute inset-0">{inView && <CanvasGlobe />}</div>
      </div>
    </section>
  );
}
