import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { GraphData, RouteResult } from '../../domain/types';

export function useLanesLayer(
    map: maplibregl.Map | null,
    loaded: boolean,
    graph: GraphData | null,
    route: RouteResult | null
) {
    useEffect(() => {
        if (!loaded || !map || !graph) return;

        const pathEdgeIds = new Set(route?.edges.map(e => e.lane_id) || []);

        const features = graph.edges.map((edge, i) => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: edge.geometry },
            properties: {
                id: i,
                lane_id: edge.lane_id,
                isPath: pathEdgeIds.has(edge.lane_id)
            }
        }));

        const geojson = { type: 'FeatureCollection', features };

        if (map.getSource('lanes')) {
            (map.getSource('lanes') as maplibregl.GeoJSONSource).setData(geojson as any);
        } else {
            map.addSource('lanes', { type: 'geojson', data: geojson as any });
            map.addLayer({
                id: 'lanes-layer',
                type: 'line',
                source: 'lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'case',
                        ['get', 'isPath'], '#00ff00',
                        '#004488'
                    ],
                    'line-width': [
                        'case',
                        ['get', 'isPath'], 4,
                        1
                    ],
                    'line-opacity': 0.6
                }
            });
        }
    }, [loaded, map, graph, route]);
}
