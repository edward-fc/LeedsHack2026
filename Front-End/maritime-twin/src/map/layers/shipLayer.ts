import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

export function useShipLayer(
    map: maplibregl.Map | null,
    loaded: boolean,
    shipPosition: [number, number] | null
) {
    useEffect(() => {
        if (!loaded || !map) return;

        const features = shipPosition ? [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: shipPosition },
            properties: {}
        }] : [];

        const geojson = { type: 'FeatureCollection', features };

        if (map.getSource('ship')) {
            (map.getSource('ship') as maplibregl.GeoJSONSource).setData(geojson as any);
        } else {
            map.addSource('ship', { type: 'geojson', data: geojson as any });
            map.addLayer({
                id: 'ship-layer',
                type: 'circle',
                source: 'ship',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0000ff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });
        }
    }, [loaded, map, shipPosition]);
}
