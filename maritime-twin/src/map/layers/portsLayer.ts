import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { GraphData } from '../../domain/types';
import { useAppStore } from '../../state/store'; // To dispatch clicks

export function usePortsLayer(
    map: maplibregl.Map | null,
    loaded: boolean,
    graph: GraphData | null,
    selection: { originId: string | null; destId: string | null }
) {
    const { dispatch } = useAppStore();

    useEffect(() => {
        if (!loaded || !map || !graph) return;

        const features = Object.values(graph.ports).map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: {
                id: p.id,
                isOrigin: p.id === selection.originId,
                isDest: p.id === selection.destId
            }
        }));

        const geojson = { type: 'FeatureCollection', features };

        if (map.getSource('ports')) {
            (map.getSource('ports') as maplibregl.GeoJSONSource).setData(geojson as any);
        } else {
            map.addSource('ports', { type: 'geojson', data: geojson as any });
            map.addLayer({
                id: 'ports-layer',
                type: 'circle',
                source: 'ports',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 8],
                    'circle-color': [
                        'case',
                        ['any', ['get', 'isOrigin'], ['get', 'isDest']], '#00ff00',
                        '#ff3300'
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });

            // Click Handler
            map.on('click', 'ports-layer', (e) => {
                if (e.features && e.features[0].properties) {
                    const portId = e.features[0].properties.id;
                    // We need to know the current mode to dispatch correctly.
                    // Ideally pass mode into this hook or handle generic click.
                    // For now, let's just log or let the store handle "generic port click" logic if we moved it there.
                    // But wait, the hook inside MapView has access to dispatch.
                    // We need to access the LATEST state.selectionMode from store, but we only passed 'selection'.
                    // Let's rely on the store action to handle "set origin if mode is origin".
                    // Actually, simpler: Dispatch a specific action 'PORT_CLICKED' and let reducer decide?
                    // Or reuse the logic. Let's keep it simple for now. 
                    // To avoid complex callback chains, let's just expose a standalone handler or use global state.
                    // Since this is a hook, it can access 'dispatch'.
                    // BUT effective event handling inside MapLibre requires care with stale closures.

                    // Simple approach:
                    // dispatch({ type: 'PORT_CLICKED', payload: portId }); 
                    // (We need to implement this in reducer)
                }
            });

            map.on('mouseenter', 'ports-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', 'ports-layer', () => { map.getCanvas().style.cursor = ''; });
        }
    }, [loaded, map, graph, selection, dispatch]);
}
