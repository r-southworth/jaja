import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl' 

export const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json', // stylesheet location
    center: [-74.5, 40], // starting position [lng, lat]
    zoom: 9 // starting zoom
    });