// server.mjs
/*import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pool de vídeos MP4 de raves/clubs de respaldo (si no pones PEXELS_API_KEY)
const FALLBACK_RAVE_VIDEOS = [
  'https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-nightclub-43446-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-people-dancing-at-a-nightclub-43449-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-stage-lights-at-a-concert-4169-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-crowd-cheering-and-dancing-at-a-concert-14095-large.mp4'
];


function detectElectronicSubgenre(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('schranz')) return 'Schranz';
  if (lower.includes('blackworks') || lower.includes('verknipt') || lower.includes('hard techno') || lower.includes('hardstyle')) return 'Hard Techno';
  if (lower.includes('dubstep') || lower.includes('riddim') || lower.includes('bass music') || lower.includes('brostep')) return 'Dubstep';
  if (lower.includes('tech house') || lower.includes('elrow') || lower.includes('circoloco')) return 'Tech House';
  if (lower.includes('melodic') || lower.includes('afterlife')) return 'Melodic Techno';
  if (lower.includes('drum & bass') || lower.includes('dnb') || lower.includes('jungle')) return 'Drum & Bass';
  if (lower.includes('trance') || lower.includes('psytrance')) return 'Trance';
  if (lower.includes('house') || lower.includes('defected') || lower.includes('disco')) return 'House';
  if (lower.includes('industrial') || lower.includes('acid')) return 'Industrial / Acid';
  return 'Techno / Electronic';
}

// 1. En server.mjs: Sustituye cleanupExpiredEvents() por esta versión que borra eventos de hace > 1 mes
async function cleanupExpiredEvents() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const cutoffDateStr = oneMonthAgo.toISOString().split('T')[0];

  console.log('🧹 Limpiando eventos antiguos anteriores a:', cutoffDateStr);

  const { data: expiredEvents } = await supabase
    .from('events')
    .select('id, name, media_storage_paths')
    .lt('start_date', cutoffDateStr);

  if (!expiredEvents || expiredEvents.length === 0) {
    console.log('✨ No hay eventos de hace más de 1 mes por borrar.');
    return;
  }

  const filesToDelete = expiredEvents.flatMap((ev) => ev.media_storage_paths || []);
  if (filesToDelete.length > 0) {
    await supabase.storage.from('event-media').remove(filesToDelete);
  }

  const expiredIds = expiredEvents.map((ev) => ev.id);
  await supabase.from('events').delete().in('id', expiredIds);
  console.log(`🗑️ Eliminados ${expiredIds.length} eventos de hace más de 1 mes y sus archivos asociados.`);
}

// Sustituye la función attachAndDownloadMedia en tu server.mjs por esta:
async function attachAndDownloadMedia(event, index = 0) {
  const storagePaths = [];
  let finalAudioUrl = null;
  let finalVideoUrl = FALLBACK_RAVE_VIDEOS[index % FALLBACK_RAVE_VIDEOS.length];

  try {
    // Limpiar el nombre del evento para extraer el artista o club principal
    const cleanName = event.name
      .replace(/tickets|entradas|festival|madrid|barcelona|pres\.|presents|by|vol\.|\d+/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .trim();

    const searchTerms = [
      cleanName,
      `${cleanName.split(' ')[0]} ${event.subgenre}`,
      `${event.subgenre} club mix`
    ];

    let mp3SourceUrl = null;

    // 1. Intentar con Deezer API buscando coincidencias específicas
    for (const term of searchTerms) {
      if (!term || mp3SourceUrl) break;
      const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=10`);
      const deezerData = await deezerRes.json();
      const tracksWithPreview = (deezerData?.data || []).filter((t) => t.preview);
      if (tracksWithPreview.length > 0) {
        // Seleccionamos usando el índice del evento para que nunca coincidan dos iguales
        mp3SourceUrl = tracksWithPreview[index % tracksWithPreview.length].preview;
      }
    }

    // 2. Respaldo con iTunes Search API (Gratis, alta precisión por canción/DJ)
    if (!mp3SourceUrl) {
      const itunesQuery = encodeURIComponent(`${cleanName.split(' ')[0]} ${event.subgenre}`);
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${itunesQuery}& media=music&entity=song&limit=10`);
      const itunesData = await itunesRes.json();
      const validPreviews = (itunesData?.results || []).filter((r) => r.previewUrl);
      if (validPreviews.length > 0) {
        mp3SourceUrl = validPreviews[index % validPreviews.length].previewUrl;
      }
    }

    // Descargar y subir el archivo de audio único al bucket de Supabase
    if (mp3SourceUrl) {
      const audioResp = await fetch(mp3SourceUrl);
      if (audioResp.ok) {
        const audioBuffer = await audioResp.arrayBuffer();
        const ext = mp3SourceUrl.includes('.m4a') ? 'm4a' : 'mp3';
        const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
        const audioPath = `audio/${event.external_id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('event-media')
          .upload(audioPath, audioBuffer, { contentType, upsert: true });

        if (!upErr) {
          storagePaths.push(audioPath);
          finalAudioUrl = supabase.storage.from('event-media').getPublicUrl(audioPath).data.publicUrl;
        } else {
          finalAudioUrl = mp3SourceUrl;
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Aviso multimedia en ${event.name}:`, err.message);
  }

return {
    ...event,
    duration_hours: 12, // 12h estimadas para todos los eventos recogidos de internet
    audio_url: finalAudioUrl,
    video_url: finalVideoUrl,
    media_storage_paths: storagePaths
  };
}

// 3. FUENTE 1: Ticketmaster (Toda la categoría Dance/Electronic = KZFzniwnSyZfZ7v7nJ)
async function fetchTicketmasterElectronic() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&countryCode=ES&classificationId=KZFzniwnSyZfZ7v7nJ&size=100`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const rawEvents = data._embedded?.events || [];

    return rawEvents.map((ev) => {
      const venue = ev._embedded?.venues?.[0];
      const subGenreName = ev.classifications?.[0]?.subGenre?.name || '';
      return {
        external_id: `tm_${ev.id}`,
        name: ev.name,
        description: ev.info || `Sesión de música electrónica (${subGenreName || 'Clubbing'}) en ${venue?.name || 'España'}.`,
        promoter: ev.promoter?.name || 'Ticketmaster Electronic',
        start_date: ev.dates?.start?.localDate,
        start_time: ev.dates?.start?.localTime || '23:00',
        subgenre: detectElectronicSubgenre(`${ev.name} ${subGenreName}`),
        image_url: ev.images?.find((img) => img.width > 600)?.url || ev.images?.[0]?.url,
        ticket_url: ev.url,
        venue_name: venue?.name || 'Club',
        city: venue?.city?.name || 'Madrid',
        lat: parseFloat(venue?.location?.latitude || 40.4168),
        lng: parseFloat(venue?.location?.longitude || -3.7038),
      };
    });
  } catch (err) {
    console.error('Error Ticketmaster:', err.message);
    return [];
  }
}

// 4. FUENTE 2: Resident Advisor (Madrid, Barcelona, Valencia, Ibiza, Málaga/Sur)
async function fetchResidentAdvisorArea(areaId) {
  const query = `
    query GET_POPULAR_EVENTS($filters: FilterInputDtoInput, $pageSize: Int) {
      eventListings(filters: $filters, pageSize: $pageSize, page: 1) {
        data {
          event {
            id title date startTime contentUrl
            images { filename }
            venue { name area { name } location { latitude longitude } }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://ra.co/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({
        query,
        variables: {
          pageSize: 40,
          filters: { areas: { eq: areaId }, listingDate: { gte: new Date().toISOString().split('T')[0] } }
        }
      })
    });

    const json = await res.json();
    const listings = json.data?.eventListings?.data || [];

    return listings
      .filter((item) => item.event?.venue?.location?.latitude)
      .map(({ event }) => ({
        external_id: `ra_${event.id}`,
        name: event.title,
        description: `Evento de música electrónica en ${event.venue.name}. Lineup y tickets en Resident Advisor.`,
        promoter: 'RA Electronic',
        start_date: event.date.split('T')[0],
        start_time: event.startTime ? event.startTime.split('T')[1]?.slice(0, 5) : '23:59',
        subgenre: detectElectronicSubgenre(event.title),
        image_url: event.images?.[0]?.filename || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
        ticket_url: `https://ra.co${event.contentUrl}`,
        venue_name: event.venue.name,
        city: event.venue.area?.name || 'España',
        lat: parseFloat(event.venue.location.latitude),
        lng: parseFloat(event.venue.location.longitude),
      }));
  } catch (err) {
    console.error(`Error RA área ${areaId}:`, err.message);
    return [];
  }
}

async function syncAllElectronicEvents() {
  await cleanupExpiredEvents();

  console.log('⚡ Recopilando eventos de Música Electrónica en toda España...');
  const [tm, raMad, raBcn, raVal, raIbz] = await Promise.all([
    fetchTicketmasterElectronic(),
    fetchResidentAdvisorArea(41), // Madrid
    fetchResidentAdvisorArea(20), // Barcelona
    fetchResidentAdvisorArea(54), // Valencia
    fetchResidentAdvisorArea(25), // Ibiza
  ]);

  const rawEvents = [...tm, ...raMad, ...raBcn, ...raVal, ...raIbz];
  const uniqueEvents = Array.from(new Map(rawEvents.map((ev) => [ev.external_id, ev])).values());

  console.log(`🎧 Descargando previews de audio MP3 y asignando vídeo MP4 para ${uniqueEvents.length} eventos...`);
  
  // Procesar en lotes de 10 para no saturar la red
  const enrichedEvents = [];
  for (let i = 0; i < uniqueEvents.length; i += 10) {
    const chunk = uniqueEvents.slice(i, i + 10);
    const processed = await Promise.all(chunk.map((ev, idx) => attachAndDownloadMedia(ev, i + idx)));
    enrichedEvents.push(...processed);
  }

  if (enrichedEvents.length > 0) {
    const { error } = await supabase.from('events').upsert(enrichedEvents, { onConflict: 'external_id' });
    if (error) console.error('❌ Error al insertar en Supabase:', error);
    else console.log(`🚀 ¡${enrichedEvents.length} eventos electrónicos con vídeo y música sincronizados!`);
  }
}

syncAllElectronicEvents();*/

// server.mjs
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  namesToSlots,
  mergeSlots,
  extractLineupFromText,
  loadPlatformDjIndex,
  finalizeLineup
} from './lineup.mjs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pool de vídeos MP4 de raves/clubs de respaldo (si no pones PEXELS_API_KEY)
const FALLBACK_RAVE_VIDEOS = [
  'https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-nightclub-43446-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-people-dancing-at-a-nightclub-43449-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-stage-lights-at-a-concert-4169-large.mp4',
  'https://assets.mixkit.co/videos/preview/mixkit-crowd-cheering-and-dancing-at-a-concert-14095-large.mp4'
];

// Coordenadas de respaldo por ciudad española (para eventos cuyo local no tenga GPS exacto en la API)
const SPAIN_CITY_COORDS = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Barcelona: { lat: 41.3874, lng: 2.1686 },
  Valencia: { lat: 39.4699, lng: -0.3763 },
  Ibiza: { lat: 38.9067, lng: 1.4206 },
  Málaga: { lat: 36.7213, lng: -4.4214 },
  Marbella: { lat: 36.5101, lng: -4.8824 },
  Sevilla: { lat: 37.3891, lng: -5.9845 },
  Granada: { lat: 37.1773, lng: -3.5986 },
  Bilbao: { lat: 43.2630, lng: -2.9350 },
  'San Sebastián': { lat: 43.3183, lng: -1.9812 },
  'Palma de Mallorca': { lat: 39.5696, lng: 2.6502 },
  Tenerife: { lat: 28.2916, lng: -16.6291 },
  'Las Palmas': { lat: 28.1235, lng: -15.4363 },
  Zaragoza: { lat: 41.6488, lng: -0.8891 },
  Vigo: { lat: 42.2406, lng: -8.7207 },
  'A Coruña': { lat: 43.3623, lng: -8.4115 },
  Alicante: { lat: 38.3452, lng: -0.4810 },
  Murcia: { lat: 37.9922, lng: -1.1307 },
  Gijón: { lat: 43.5322, lng: -5.6611 },
};

function getCoordsWithJitter(cityName, rawLat, rawLng) {
  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);
  if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng };
  }
  const base = SPAIN_CITY_COORDS[cityName] || SPAIN_CITY_COORDS.Madrid;
  // Ligero desplazamiento aleatorio (~1-2km) para que no se solapen en el mismo punto del mapa
  const jitterLat = (Math.random() - 0.5) * 0.025;
  const jitterLng = (Math.random() - 0.5) * 0.025;
  return {
    lat: parseFloat((base.lat + jitterLat).toFixed(6)),
    lng: parseFloat((base.lng + jitterLng).toFixed(6)),
  };
}

function detectElectronicSubgenre(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('schranz')) return 'Schranz';
  if (
    lower.includes('blackworks') ||
    lower.includes('verknipt') ||
    lower.includes('hard techno') ||
    lower.includes('hardstyle') ||
    lower.includes('fatima hajji') ||
    lower.includes('nico moreno') ||
    lower.includes('code ')
  )
    return 'Hard Techno';
  if (lower.includes('dubstep') || lower.includes('riddim') || lower.includes('bass music') || lower.includes('brostep'))
    return 'Dubstep';
  if (
    lower.includes('tech house') ||
    lower.includes('elrow') ||
    lower.includes('circoloco') ||
    lower.includes('music on') ||
    lower.includes('wade') ||
    lower.includes('pacha')
  )
    return 'Tech House';
  if (lower.includes('melodic') || lower.includes('afterlife') || lower.includes('keinemusik') || lower.includes('afro house'))
    return 'Melodic Techno';
  if (lower.includes('drum & bass') || lower.includes('drum and bass') || lower.includes('dnb') || lower.includes('jungle'))
    return 'Drum & Bass';
  if (lower.includes('trance') || lower.includes('psytrance') || lower.includes('goa')) return 'Trance';
  if (lower.includes('house') || lower.includes('defected') || lower.includes('disco') || lower.includes('glitterbox'))
    return 'House';
  if (lower.includes('industrial') || lower.includes('acid') || lower.includes('ebm')) return 'Industrial / Acid';
  return 'Techno / Electronic';
}

// 1. Limpieza de eventos antiguos (anteriores a 1 mes)
async function cleanupExpiredEvents() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const cutoffDateStr = oneMonthAgo.toISOString().split('T')[0];

  console.log('🧹 Limpiando eventos antiguos anteriores a:', cutoffDateStr);

  const { data: expiredEvents } = await supabase
    .from('events')
    .select('id, name, media_storage_paths')
    .lt('start_date', cutoffDateStr);

  if (!expiredEvents || expiredEvents.length === 0) {
    console.log('✨ No hay eventos de hace más de 1 mes por borrar.');
    return;
  }

  const filesToDelete = expiredEvents.flatMap((ev) => ev.media_storage_paths || []);
  if (filesToDelete.length > 0) {
    await supabase.storage.from('event-media').remove(filesToDelete);
  }

  const expiredIds = expiredEvents.map((ev) => ev.id);
  await supabase.from('events').delete().in('id', expiredIds);
  console.log(`🗑️ Eliminados ${expiredIds.length} eventos de hace más de 1 mes y sus archivos asociados.`);
}

// 2. Descarga y subida de audio y asignación de vídeo
async function attachAndDownloadMedia(event, index = 0) {
  const storagePaths = [];
  let finalAudioUrl = null;
  let finalVideoUrl = FALLBACK_RAVE_VIDEOS[index % FALLBACK_RAVE_VIDEOS.length];

  try {
    // Limpiar el nombre del evento para extraer el artista o club principal
    const cleanName = event.name
      .replace(/tickets|entradas|festival|madrid|barcelona|valencia|ibiza|sevilla|malaga|bilbao|pres\.|presents|by|vol\.|\d+/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .trim();

    const searchTerms = [
      cleanName,
      `${cleanName.split(' ')[0]} ${event.subgenre}`
    ];

    let mp3SourceUrl = null;

    // 1. Intentar con Deezer API buscando coincidencias específicas
  for (const term of searchTerms) {
      if (!term || mp3SourceUrl) break;
      const deezerRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=10`);
      if (deezerRes.ok) {
        try {
          const deezerData = await deezerRes.json();
          const tracksWithPreview = (deezerData?.data || []).filter((t) => t.preview);
          if (tracksWithPreview.length > 0) {
            mp3SourceUrl = tracksWithPreview[index % tracksWithPreview.length].preview;
          }
        } catch (e) { /* Ignorar si el JSON está roto */ }
      }
    }

    // 2. Respaldo con iTunes Search API
  if (!mp3SourceUrl) {
      const itunesQuery = encodeURIComponent(`${cleanName.split(' ')[0]} ${event.subgenre}`);
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${itunesQuery}&media=music&entity=song&limit=10`);
      if (itunesRes.ok) {
        try {
          const itunesData = await itunesRes.json();
          const validPreviews = (itunesData?.results || []).filter((r) => r.previewUrl);
          if (validPreviews.length > 0) {
            mp3SourceUrl = validPreviews[index % validPreviews.length].previewUrl;
          }
        } catch (e) { /* Ignorar si el JSON está roto */ }
      }
    }

    // Descargar y subir el archivo de audio único al bucket de Supabase
    if (mp3SourceUrl) {
      const audioResp = await fetch(mp3SourceUrl);
      if (audioResp.ok) {
        const audioBuffer = await audioResp.arrayBuffer();
        const ext = mp3SourceUrl.includes('.m4a') ? 'm4a' : 'mp3';
        const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
        const audioPath = `audio/${event.external_id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('event-media')
          .upload(audioPath, audioBuffer, { contentType, upsert: true });

        if (!upErr) {
          storagePaths.push(audioPath);
          finalAudioUrl = supabase.storage.from('event-media').getPublicUrl(audioPath).data.publicUrl;
        } else {
          finalAudioUrl = mp3SourceUrl;
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Aviso multimedia en ${event.name}:`, err.message);
  }

  return {
    ...event,
    duration_hours: 12,
    audio_url: finalAudioUrl,
    video_url: finalVideoUrl,
    media_storage_paths: storagePaths
  };
}

// ============================================================================
// 3. FUENTE 1: Ticketmaster España (Paginado + Búsqueda por Keywords/Clubs)
// ============================================================================
function mapTicketmasterEvent(ev) {
  const venue = ev._embedded?.venues?.[0];
  const cityName = venue?.city?.name || 'Madrid';
  const subGenreName = ev.classifications?.[0]?.subGenre?.name || '';
  const coords = getCoordsWithJitter(cityName, venue?.location?.latitude, venue?.location?.longitude);

  // Lineup: artistas de Ticketmaster ("attractions") + lo que venga escrito en la info
  const attractionNames = (ev._embedded?.attractions || []).map((a) => a?.name);
  const parsedInfo = extractLineupFromText([ev.info, ev.pleaseNote].filter(Boolean).join('\n\n'));

  return {
    external_id: `tm_${ev.id}`,
    name: ev.name,
    description: parsedInfo.text || `Sesión de música electrónica (${subGenreName || 'Clubbing'}) en ${venue?.name || cityName}.`,
    _lineup: mergeSlots(namesToSlots(attractionNames), parsedInfo.slots),
    promoter: ev.promoter?.name || 'Ticketmaster Electronic',
    start_date: ev.dates?.start?.localDate,
    start_time: ev.dates?.start?.localTime ? ev.dates.start.localTime.slice(0, 5) : '23:00',
    subgenre: detectElectronicSubgenre(`${ev.name} ${subGenreName} ${venue?.name || ''}`),
    image_url: ev.images?.find((img) => img.width > 600)?.url || ev.images?.[0]?.url,
    ticket_url: ev.url,
    venue_name: venue?.name || 'Club',
    city: cityName,
    lat: coords.lat,
    lng: coords.lng,
  };
}

async function fetchTicketmasterElectronic() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ Sin TICKETMASTER_API_KEY, saltando Ticketmaster...');
    return [];
  }

  const allEvents = [];
  const todayIso = new Date().toISOString().split('.')[0] + 'Z';

  // A) Paginación de toda la categoría Dance/Electronic (KZFzniwnSyZfZ7v7nJ) en España
  for (let page = 0; page < 5; page++) {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&countryCode=ES&classificationId=KZFzniwnSyZfZ7v7nJ&startDateTime=${todayIso}&size=200&page=${page}&sort=date,asc`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const rawEvents = data._embedded?.events || [];
      if (rawEvents.length === 0) break;

      allEvents.push(...rawEvents.map(mapTicketmasterEvent));

      const totalPages = data.page?.totalPages || 1;
      if (page + 1 >= totalPages) break;
    } catch (err) {
      console.error(`Error Ticketmaster pág ${page}:`, err.message);
      break;
    }
  }

  // B) Búsquedas extra por palabras clave (muchos promotores suben raves sin marcar "Dance/Electronic")
  const keywords = ['techno', 'rave', 'elrow', 'blackworks', 'fabrik', 'hard techno', 'drum and bass', 'house music'];
  for (const kw of keywords) {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&countryCode=ES&keyword=${encodeURIComponent(kw)}&segmentName=Music&startDateTime=${todayIso}&size=100`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const rawEvents = data._embedded?.events || [];
      allEvents.push(...rawEvents.map(mapTicketmasterEvent));
    } catch (err) {
      console.error(`Error Ticketmaster keyword "${kw}":`, err.message);
    }
  }

  console.log(`✅ Ticketmaster España: ${allEvents.length} eventos encontrados.`);
  return allEvents.filter((ev) => ev.start_date);
}

// ============================================================================
// 4. FUENTE 2: Resident Advisor (10 Regiones de España + Paginación profunda)
// ============================================================================
const RA_SPAIN_AREAS = [
  { id: 41, name: 'Madrid' },
  { id: 20, name: 'Barcelona' },
  { id: 25, name: 'Ibiza' },
  { id: 54, name: 'Valencia' },
  { id: 229, name: 'Málaga' },       // Andalucía / Sur (Málaga, Marbella, Sevilla, Granada)
  { id: 231, name: 'Bilbao' },       // País Vasco / Norte (Bilbao, San Sebastián, Vitoria)
  { id: 168, name: 'Palma de Mallorca' }, // Mallorca / Baleares
  { id: 230, name: 'Tenerife' },     // Islas Canarias (Tenerife, Gran Canaria)
  { id: 391, name: 'Vigo' },         // Galicia (Vigo, A Coruña, Santiago)
  { id: 392, name: 'Zaragoza' },     // Aragón / Zaragoza
];

async function fetchResidentAdvisorArea(area, maxPages = 5) {
  const query = `
    query GET_POPULAR_EVENTS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
      eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
        data {
          event {
            id
            title
            date
            startTime
            contentUrl
            images { filename }
            artists { name }
            venue {
              name
              area { name }
              location { latitude longitude }
            }
          }
        }
      }
    }
  `;

  const collected = [];
  const todayStr = new Date().toISOString().split('T')[0];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch('https://ra.co/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://ra.co/events/es/madrid',
        },
        body: JSON.stringify({
          query,
          variables: {
            pageSize: 100,
            page,
            filters: {
              areas: { eq: area.id },
              listingDate: { gte: todayStr },
            },
          },
        }),
      });

      const json = await res.json();
      const listings = json.data?.eventListings?.data || [];
      if (listings.length === 0) break;

      const mapped = listings
        .filter((item) => item?.event?.id && item?.event?.title && item?.event?.date)
        .map(({ event }) => {
          const cityName = event.venue?.area?.name || area.name;
          const coords = getCoordsWithJitter(
            cityName,
            event.venue?.location?.latitude,
            event.venue?.location?.longitude
          );
          const artistNames = (event.artists || []).map((a) => a.name).join(', ');
          const fullTextForGenre = `${event.title} ${artistNames} ${event.venue?.name || ''}`;

          return {
            external_id: `ra_${event.id}`,
            name: event.title,
            // El lineup ya no va en la descripción: va en su campo, como en la app
            description: `Evento de música electrónica en ${event.venue?.name || cityName}. Entradas en Resident Advisor.`,
            _lineup: namesToSlots((event.artists || []).map((a) => a?.name)),
            promoter: 'RA Electronic',
            start_date: event.date.split('T')[0],
            start_time: event.startTime ? event.startTime.split('T')[1]?.slice(0, 5) : '23:59',
            subgenre: detectElectronicSubgenre(fullTextForGenre),
            image_url:
              event.images?.[0]?.filename ||
              'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
            ticket_url: `https://ra.co${event.contentUrl}`,
            venue_name: event.venue?.name || `Club ${cityName}`,
            city: cityName,
            lat: coords.lat,
            lng: coords.lng,
          };
        });

      collected.push(...mapped);

      // Si devolvió menos de 100, ya no hay más páginas en esta región
      if (listings.length < 100) break;
    } catch (err) {
      console.error(`Error RA área ${area.name} (pág ${page}):`, err.message);
      break;
    }
  }

  console.log(`✅ Resident Advisor (${area.name}): ${collected.length} eventos recopilados.`);
  return collected;
}

// ============================================================================
// 5. FUENTE 3: Xceed API (Plataforma líder de clubs en España - Sin API Key)
// ============================================================================
const XCEED_SPAIN_CITIES = [
  'barcelona',
  'madrid',
  'valencia',
  'sevilla',
  'ibiza',
  'malaga',
  'granada',
  'bilbao',
  'alicante',
  'zaragoza',
  'palma-de-mallorca',
  'marbella',
];

async function fetchXceedCityEvents(citySlug) {
  const collected = [];
  const startTimeUnix = Math.floor(Date.now() / 1000);

  // Recopilamos hasta 3 páginas por ciudad en Xceed
  for (let offset = 0; offset < 150; offset += 50) {
    const url = `https://events.xceed.me/v1/events?city=${citySlug}&startTime=${startTimeUnix}&limit=50&offset=${offset}&sort=startTime`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });
      if (!res.ok) break;

      const json = await res.json();
      const events = json.data || [];
      if (!Array.isArray(events) || events.length === 0) break;

      const mapped = events
        .filter((ev) => ev.id && ev.name && ev.startingTime)
        .map((ev) => {
          const startDateObj = new Date(ev.startingTime * 1000);
          const startDateStr = startDateObj.toISOString().split('T')[0];
          const startTimeStr = startDateObj.toISOString().split('T')[1].slice(0, 5);

          const venue = ev.venue || {};
          const cityName = venue.city?.name || citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
          const coords = getCoordsWithJitter(
            cityName,
            venue.coordinates?.latitude || venue.latitude,
            venue.coordinates?.longitude || venue.longitude
          );

          const tagsText = (ev.musicGenres || []).map((g) => g.name || g).join(' ');
          const subgenre = detectElectronicSubgenre(`${ev.name} ${tagsText} ${venue.name || ''}`);

          // Lineup: si Xceed lo da separado se usa; si no, se busca en la descripción
          const xceedArtists = [ev.lineup, ev.artists, ev.performers, ev.djs]
            .flatMap((arr) => (Array.isArray(arr) ? arr : []))
            .map((a) => (typeof a === 'string' ? a : a?.name || a?.title));
          const parsedDesc = extractLineupFromText(ev.description || ev.about || '');

          return {
            external_id: `xc_${ev.id}`,
            name: ev.name,
            description:
              parsedDesc.text ||
              `Sesión de clubbing (${subgenre}) en ${venue.name || cityName}. Entradas y lista en Xceed.`,
            _lineup: mergeSlots(namesToSlots(xceedArtists), parsedDesc.slots),
            promoter: venue.name || 'Xceed Spain Clubbing',
            start_date: startDateStr,
            start_time: startTimeStr || '23:59',
            subgenre,
            image_url:
              ev.coverUrl ||
              ev.cover?.url ||
              'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7',
            ticket_url: ev.url || `https://xceed.me/es/${citySlug}/event/${ev.slug || ev.id}`,
            venue_name: venue.name || `Club ${cityName}`,
            city: cityName,
            lat: coords.lat,
            lng: coords.lng,
          };
        });

      collected.push(...mapped);
      if (events.length < 50) break;
    } catch (err) {
      // Silencioso si una ciudad no responde en Xceed
      break;
    }
  }

  if (collected.length > 0) {
    console.log(`✅ Xceed (${citySlug}): ${collected.length} eventos recopilados.`);
  }
  return collected;
}

// ============================================================================
// 6. SINCRONIZACIÓN MASIVA Y DEDUPLICACIÓN
// ============================================================================
async function syncAllElectronicEvents() {
  await cleanupExpiredEvents();

  console.log('⚡ Recopilando MASIVAMENTE eventos de Música Electrónica en toda España...');

  // 1. Ejecutar Ticketmaster
  const tmEvents = await fetchTicketmasterElectronic();

  // 2. Ejecutar todas las áreas de España en Resident Advisor (en lotes para evitar bloqueos rate-limit)
  const raEvents = [];
  for (let i = 0; i < RA_SPAIN_AREAS.length; i += 3) {
    const batch = RA_SPAIN_AREAS.slice(i, i + 3);
    const results = await Promise.all(batch.map((area) => fetchResidentAdvisorArea(area, 5)));
    raEvents.push(...results.flat());
  }

  // 3. Ejecutar todas las ciudades de España en Xceed
  const xceedEvents = [];
  for (let i = 0; i < XCEED_SPAIN_CITIES.length; i += 4) {
    const batch = XCEED_SPAIN_CITIES.slice(i, i + 4);
    const results = await Promise.all(batch.map((city) => fetchXceedCityEvents(city)));
    xceedEvents.push(...results.flat());
  }

  const rawEvents = [...raEvents, ...tmEvents, ...xceedEvents];
  console.log(`📦 Total bruto recopilado en España: ${rawEvents.length} eventos.`);

  // Deduplicación doble: por external_id y por clave normalizada (nombre + fecha + ciudad)
  const seenIds = new Set();
  const seenFingerprints = new Set();
  const uniqueEvents = [];

  for (const ev of rawEvents) {
    if (!ev.external_id || !ev.name || !ev.start_date) continue;

    const normalizedName = ev.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
    const fingerprint = `${normalizedName}_${ev.start_date}_${(ev.city || '').toLowerCase()}`;

    if (seenIds.has(ev.external_id) || seenFingerprints.has(fingerprint)) {
      continue;
    }

    seenIds.add(ev.external_id);
    seenFingerprints.add(fingerprint);
    uniqueEvents.push(ev);
  }

  // Lineup con el formato de la app; los DJs registrados en RAVEXRADAR quedan enlazados a su perfil
  const djIndex = await loadPlatformDjIndex(supabase);
  let withLineup = 0;
  let linkedDjs = 0;
  for (const ev of uniqueEvents) {
    ev.lineup = finalizeLineup(ev._lineup || [], djIndex, ev.external_id);
    delete ev._lineup;
    if (ev.lineup.length) withLineup += 1;
    linkedDjs += ev.lineup.filter((s) => s.dj_id).length;
  }
  console.log(`🎛️ Lineup detectado en ${withLineup}/${uniqueEvents.length} eventos (${linkedDjs} DJs de RAVEXRADAR enlazados).`);

  console.log(`🎧 Procesando multimedia (audio MP3/M4A + vídeo) para ${uniqueEvents.length} eventos únicos...`);

  // Procesar multimedia en lotes de 15 y hacer upsert progresivo a Supabase cada 60 eventos
  // (Así, si hay +1.000 eventos, se van guardando en la base de datos de forma segura sin perder progreso)
  const MEDIA_BATCH_SIZE = 15;
  const UPSERT_BATCH_SIZE = 60;
  let bufferToUpsert = [];
  let totalSynced = 0;
  const allProcessed = [];

  for (let i = 0; i < uniqueEvents.length; i += MEDIA_BATCH_SIZE) {
    const chunk = uniqueEvents.slice(i, i + MEDIA_BATCH_SIZE);
    const processed = await Promise.all(
      chunk.map((ev, idx) => attachAndDownloadMedia(ev, i + idx))
    );
    allProcessed.push(...processed);
    bufferToUpsert.push(...processed);

    if (bufferToUpsert.length >= UPSERT_BATCH_SIZE || i + MEDIA_BATCH_SIZE >= uniqueEvents.length) {
      const { error } = await supabase
        .from('events')
        .upsert(bufferToUpsert, { onConflict: 'external_id' });

      if (error) {
        console.error('❌ Error al insertar lote en Supabase:', error.message);
      } else {
        totalSynced += bufferToUpsert.length;
        console.log(`💾 Progreso guardado en Supabase: ${totalSynced}/${uniqueEvents.length} eventos...`);
      }
      bufferToUpsert = [];
    }
  }

    // ---- FASE 2: los eventos sin audio propio reciben el de otro evento al azar ----
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const withAudio = allProcessed.filter((ev) => ev.audio_url && ev.media_storage_paths?.length > 0);
  const withoutAudio = allProcessed.filter((ev) => !ev.audio_url);
  console.log(`🎲 ${withoutAudio.length} eventos sin audio propio; repartiendo entre ${withAudio.length} encontrados...`);

  if (withAudio.length > 0 && withoutAudio.length > 0) {
    const bySubgenre = {};
    for (const ev of withAudio) (bySubgenre[ev.subgenre] ||= []).push(ev);

    // Barajas: se saca una canción distinta cada vez y no se repite hasta agotar la baraja
    const decks = {};
    const draw = (key, source) => {
      if (!decks[key] || decks[key].length === 0) decks[key] = shuffle(source);
      return decks[key].pop();
    };

    const bucket = supabase.storage.from('event-media');
    const filled = [];

    for (const ev of withoutAudio) {
      // Mismo subgénero si hay al menos 3 candidatas; si no, de cualquiera
      const sameGenre = bySubgenre[ev.subgenre];
      const donor = sameGenre?.length >= 3 ? draw(ev.subgenre, sameGenre) : draw('__all__', withAudio);

      const fromPath = donor.media_storage_paths[0];
      const toPath = `audio/${ev.external_id}.${fromPath.split('.').pop()}`;

      await bucket.remove([toPath]); // por si existe de una sincronización anterior
      const { error } = await bucket.copy(fromPath, toPath);

      if (!error) {
        ev.media_storage_paths = [toPath];
        ev.audio_url = bucket.getPublicUrl(toPath).data.publicUrl;
      } else {
        ev.audio_url = donor.audio_url; // sin copia propia, apunta al archivo del otro
      }
      filled.push(ev);
    }

    for (let i = 0; i < filled.length; i += UPSERT_BATCH_SIZE) {
      const { error } = await supabase
        .from('events')
        .upsert(filled.slice(i, i + UPSERT_BATCH_SIZE), { onConflict: 'external_id' });
      if (error) console.error('❌ Error guardando audios asignados:', error.message);
    }
  }

  console.log(`🚀 ¡Sincronización completada! ${totalSynced} eventos electrónicos de toda España listos.`);
}

syncAllElectronicEvents();