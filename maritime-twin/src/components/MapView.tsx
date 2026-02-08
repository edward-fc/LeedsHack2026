import { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MaritimeGraph } from '../lib/GraphEngine';

interface MapViewProps {
    graph: MaritimeGraph;
    onPortClick: (portId: string) => void;
    onChokepointClick: (name: string) => void;
    pathEdgeIds: Set<string>;
    originId: string | null;
    destId: string | null;
    shipPosition: [number, number] | null;
}

export function MapView({ graph, onPortClick, onChokepointClick, pathEdgeIds, originId, destId, shipPosition }: MapViewProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null); // Use maplibre types
    const [loaded, setLoaded] = useState(false);

    // Refs to keep latest handlers available to MapLibre listeners without cleanup/rebind overhead
    const onPortClickRef = useRef(onPortClick);
    const onChokepointClickRef = useRef(onChokepointClick);

    useEffect(() => {
        onPortClickRef.current = onPortClick;
        onChokepointClickRef.current = onChokepointClick;
    }, [onPortClick, onChokepointClick]);

    useEffect(() => {
        if (map.current) return;
        if (!mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [0, 20],
            zoom: 1.5,
        });

        map.current.on('load', () => {
            setLoaded(true);
        });

        // Cleanup function for React Strict Mode
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
                setLoaded(false);
            }
        };
    }, []);

    // Ship Marker Update
    useEffect(() => {
        if (!loaded || !map.current) return;
        const m = map.current;

        const shipGeoJSON = {
            type: 'FeatureCollection',
            features: shipPosition ? [{
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: shipPosition
                },
                properties: {}
            }] : []
        };

        if (m.getSource('ship')) {
            (m.getSource('ship') as maplibregl.GeoJSONSource).setData(shipGeoJSON as any);
        } else {
            m.addSource('ship', { type: 'geojson', data: shipGeoJSON as any });
            m.addLayer({
                id: 'ship-layer',
                type: 'circle',
                source: 'ship',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0000ff', // Blue
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-pitch-alignment': 'map'
                }
            });
            // Pulse animation layer (optional, can add later)
        }
    }, [loaded, shipPosition]);

    // Update Data Sources
    useEffect(() => {
        if (!loaded || !map.current) return;
        const m = map.current;

        // 1. Lanes Source
        const laneFeatures = Object.values(graph.adjList).flat().map((edge, i) => ({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: edge.geometry
            },
            properties: {
                id: i,
                lane_id: edge.lane_id, // Ensure this matches ID in edge
                disabled: graph.isEdgeDisabled(edge),
                isPath: pathEdgeIds.has(edge.lane_id)
            }
        }));

        // Deduplicate edges?
        // Using Map as unique set by geometry string might be heavy. Just render.

        const lanesGeoJSON = { type: 'FeatureCollection', features: laneFeatures };

        if (m.getSource('lanes')) {
            (m.getSource('lanes') as maplibregl.GeoJSONSource).setData(lanesGeoJSON as any);
        } else {
            m.addSource('lanes', { type: 'geojson', data: lanesGeoJSON as any });
            m.addLayer({
                id: 'lanes-layer',
                type: 'line',
                source: 'lanes',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': [
                        'case',
                        ['get', 'disabled'], '#ff0000', // Red if disabled
                        ['get', 'isPath'], '#00ff00', // Green if part of path
                        '#004488' // Default Navy Blue
                    ],
                    'line-width': [
                        'case',
                        ['get', 'isPath'], 4, // Thicker if path
                        1 // Default width
                    ],
                    'line-opacity': [
                        'case',
                        ['get', 'isPath'], 0.8,
                        ['get', 'disabled'], 0.8,
                        0.6
                    ]
                }
            });
        }

        // 2. Ports Source
        const portFeatures = Object.values(graph.ports).map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: {
                id: p.id,
                name: p.name,
                disabled: graph.disabledPorts.has(p.id),
                isOrigin: p.id === originId,
                isDest: p.id === destId
            }
        }));

        const portsGeoJSON = { type: 'FeatureCollection', features: portFeatures };

        if (m.getSource('ports')) {
            (m.getSource('ports') as maplibregl.GeoJSONSource).setData(portsGeoJSON as any);
        } else {
            m.addSource('ports', { type: 'geojson', data: portsGeoJSON as any });
            m.addLayer({
                id: 'ports-layer',
                type: 'circle',
                source: 'ports',
                paint: {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 5, 8],
                    'circle-color': [
                        'case',
                        ['get', 'disabled'], '#555555', // Grey if disabled
                        ['any', ['get', 'isOrigin'], ['get', 'isDest']], '#00ff00', // Green if O/D
                        '#ff3300' // Default Red-Orange
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });

            // Interaction
            m.on('click', 'ports-layer', (e) => {
                if (e.features && e.features[0].properties) {
                    onPortClickRef.current(e.features[0].properties.id);
                }
            });
            m.on('mouseenter', 'ports-layer', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'ports-layer', () => { m.getCanvas().style.cursor = ''; });
        }

        // 2b. Port Links Source (Visualizing the connection)
        const linkFeatures = Object.values(graph.ports).map(p => {
            const targetNode = graph.nodes[p.node_id];
            if (!targetNode) return null;
            return {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [p.lon, p.lat],
                        [targetNode.lon, targetNode.lat]
                    ]
                },
                properties: {}
            };
        }).filter(f => f !== null);

        const linksGeoJSON = { type: 'FeatureCollection', features: linkFeatures };

        if (m.getSource('port-links')) {
            (m.getSource('port-links') as maplibregl.GeoJSONSource).setData(linksGeoJSON as any);
        } else {
            m.addSource('port-links', { type: 'geojson', data: linksGeoJSON as any });
            m.addLayer({
                id: 'port-links-layer',
                type: 'line',
                source: 'port-links',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#888888',
                    'line-width': 1,
                    'line-dasharray': [2, 2],
                    'line-opacity': 0.7
                }
            }, 'ports-layer'); // Draw links BEFORE ports (so ports sit on top)
        }

        // 3. Chokepoints Source
        const cpFeatures = Object.values(graph.chokepoints).map(cp => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
            properties: {
                name: cp.name,
                disabled: graph.disabledChokepoints.has(cp.name)
            }
        }));

        const cpGeoJSON = { type: 'FeatureCollection', features: cpFeatures };

        if (m.getSource('chokepoints')) {
            (m.getSource('chokepoints') as maplibregl.GeoJSONSource).setData(cpGeoJSON as any);
        } else {
            m.addSource('chokepoints', { type: 'geojson', data: cpGeoJSON as any });
            m.addLayer({
                id: 'chokepoints-layer',
                type: 'symbol',
                source: 'chokepoints',
                layout: {
                    // MapLibre default styles might not have 'star' icon.
                    // Fallback to simpler marker or circle + text if icon missing.
                    // Voyager style has icons. 
                    // Let's use circle plus text layer.
                    'text-field': ['get', 'name'],
                    'text-offset': [0, 1.5],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold'] // Usually available
                },
                paint: {
                    'text-color': '#000',
                    'text-halo-color': '#fff',
                    'text-halo-width': 2
                }
            });
            // Use circle for marker
            m.addLayer({
                id: 'chokepoints-marker',
                type: 'circle',
                source: 'chokepoints',
                paint: {
                    'circle-radius': 8,
                    'circle-color': ['case', ['get', 'disabled'], '#ff0000', '#000000'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#FFD700' // Gold
                }
            });

            m.on('click', 'chokepoints-marker', (e) => {
                if (e.features && e.features[0].properties) {
                    onChokepointClickRef.current(e.features[0].properties.name);
                }
            });
            m.on('mouseenter', 'chokepoints-marker', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'chokepoints-marker', () => { m.getCanvas().style.cursor = ''; });
        }

        // Clean up old route layer if it exists
        if (m.getLayer('route-layer')) m.removeLayer('route-layer');
        if (m.getSource('route')) m.removeSource('route');

    }, [loaded, graph, pathEdgeIds, originId, destId, graph.disabledPorts, graph.disabledChokepoints]);

    return <div ref={mapContainer} className="w-full h-full" />;
}
